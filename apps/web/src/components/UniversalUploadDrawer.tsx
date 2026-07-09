/**
 * UniversalUploadDrawer — Modal para subir uno o más documentos financieros
 * (cartolas PDF/imagen) desde cualquier parte de la app.
 *
 * - Sube archivos en serie a /api/documents/upload (hardened parseCartolaBuffer pipeline)
 * - Muestra estado por archivo: En espera → Subiendo → Analizando → Listo / Error
 * - Invalida react-query keys al terminar
 * - Botón "Cerrar" se habilita cuando no hay uploads en curso
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { isBrowserOffline } from "@/lib/networkStatus";
import { USER_FACING_CONNECTION_ERROR } from "@/lib/userFacingErrors";
import DocumentManager from "@/components/DocumentManager";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";

type FileState = "pending" | "uploading" | "parsing" | "success" | "error";

interface FileStatus {
  file: File;
  status: FileState;
  message?: string;
}

/** Data returned from the upload API after document processing. */
interface UploadResultData {
  documentType?: string;
  transactionalScore?: number;
  creditScore?: number;
  mainInsights?: string[];
  recommendedProducts?: string[];
  /** Parser metadata (cartolas) — para guiar la revisión post-subida. */
  detectionTier?: string;
  detectedBanco?: string;
  movementCount?: number;
  documentId?: string;
  reviewStatus?: string;
}

/** Map SFA product codes to marketplace tab keys. */
function getTabFromCode(code: string): string | null {
  if (code.startsWith("A")) return "cuentas_ahorro";
  if (code.startsWith("B")) return "tarjetas_credito";
  if (code.startsWith("C")) {
    const num = parseInt(code.slice(1), 10);
    if (num >= 5 && num <= 11) return "creditos_hipotecarios";
    return "creditos_consumo";
  }
  if (code.startsWith("E")) {
    const num = parseInt(code.slice(1), 10);
    if (num >= 100) return "fondos_mutuos";
    return "depositos_plazo";
  }
  return null;
}

const TAB_LABELS: Record<string, string> = {
  cuentas_ahorro: "Cuentas de ahorro",
  tarjetas_credito: "Tarjetas de crédito",
  creditos_consumo: "Créditos de consumo",
  creditos_hipotecarios: "Créditos hipotecarios",
  depositos_plazo: "Depósitos a plazo",
  fondos_mutuos: "Fondos mutuos",
};

const LABEL: Record<FileState, string> = {
  pending: "En espera",
  uploading: "Subiendo",
  parsing: "Analizando",
  success: "Listo",
  error: "Error",
};

interface UniversalUploadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UniversalUploadDrawer({
  open,
  onOpenChange,
}: UniversalUploadDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResultData | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { autoPickFile, clearAutoPickFile } = useUploadDrawer();
  const [, navigate] = useLocation();

  // Auto-open file picker when requested via context
  useEffect(() => {
    if (open && autoPickFile) {
      clearAutoPickFile();
      // Small delay so the dialog renders before the file picker opens
      const t = setTimeout(() => inputRef.current?.click(), 150);
      return () => clearTimeout(t);
    }
  }, [open, autoPickFile, clearAutoPickFile]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted = Array.from(incoming).filter(
      (f) =>
        f.type === "application/pdf" ||
        f.type === "image/png" ||
        f.type === "image/jpeg" ||
        f.name.endsWith(".pdf") ||
        f.name.endsWith(".png") ||
        f.name.endsWith(".jpg") ||
        f.name.endsWith(".jpeg")
    );
    if (!accepted.length) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file.name));
      const toAdd = accepted
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, status: "pending" as const }));
      return [...prev, ...toAdd];
    });
    setDoneCount(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setFiles([]);
    setDoneCount(null);
    setUploadResult(null);
  };

  /**
   * Sube UN archivo. Reintenta SOLO ante 429 (rate limit): el servidor rechazó sin
   * procesar, así que reintentar no duplica. Backoff corto (2–4s, o Retry-After si es
   * chico) y máximo 2 reintentos — la ventana del limiter es larga, así que no esperamos
   * minutos: si sigue en 429, se reporta con un mensaje amable y se sigue con el resto.
   */
  /**
   * Cuando la cola BullMQ está activa (Redis configurado en el backend), el POST de subida
   * responde `202 { step: "queued", jobId }` y el worker procesa async. Polleamos
   * `GET /api/documents/upload/:jobId` hasta terminal y devolvemos el mismo shape que la ruta
   * síncrona, para que `uploadAll` maneje el resultado idéntico. Dormante cuando la cola está
   * apagada (sin Redis el POST ya trae el resultado final y este helper no se invoca).
   */
  const pollUploadJob = async (
    apiBase: string,
    jobId: string,
    setStatus: (status: FileState, message?: string) => void,
  ): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> => {
    const deadline = Date.now() + 120_000; // 2 min máx de polling
    while (Date.now() < deadline) {
      setStatus("parsing", "Procesando en segundo plano…");
      await new Promise((r) => setTimeout(r, 1500));
      if (isBrowserOffline()) {
        return { ok: false, status: 0, json: { message: USER_FACING_CONNECTION_ERROR } };
      }
      let r: Response;
      try {
        r = await fetch(`${apiBase}/api/documents/upload/${jobId}`, { credentials: "include" });
      } catch {
        continue; // error de red transitorio → reintentar el poll
      }
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok && j.step === "done") {
        const result = (j.result as Record<string, unknown>) ?? {};
        // El pipeline puede COMPLETAR con `result.error` (p. ej. documento no soportado,
        // normalización fallida). Espejar la ruta síncrona: 400 con el mensaje específico,
        // nunca marcarlo como éxito.
        if (typeof result.error === "string" && result.error) {
          return { ok: false, status: 400, json: { message: result.error } };
        }
        return { ok: true, status: 200, json: result };
      }
      if (j.state === "failed") {
        // Job realmente fallido en el worker → terminal, conservar failedReason del backend.
        return { ok: false, status: 500, json: { message: (j.message as string) ?? "No pudimos procesar el documento." } };
      }
      if (r.status >= 500) {
        // 5xx SIN state="failed" = error transitorio consultando el estado (hiccup de
        // Redis/DB en el GET), no un fallo del documento → seguir polleando hasta el deadline.
        continue;
      }
      if (r.status === 404) {
        return { ok: false, status: 404, json: { message: "El procesamiento del documento no está disponible." } };
      }
      // step === "queued" → seguir polleando
    }
    return {
      ok: false,
      status: 408,
      json: { message: "El documento sigue procesándose. Aparecerá en tus movimientos cuando termine; puedes cerrar esta ventana." },
    };
  };

  const uploadOne = async (
    fs: FileStatus,
    setStatus: (status: FileState, message?: string) => void,
  ): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> => {
    const apiBase = (API_URL || "").replace(/\/$/, "");
    const maxRetries = 2;
    for (let attempt = 0; ; attempt++) {
      // Yield to the renderer so "uploading" paint is guaranteed before fetch blocks.
      setStatus("uploading");
      await new Promise((r) => setTimeout(r, 0));

      const formData = new FormData();
      formData.append("document", fs.file);
      if (isBrowserOffline()) {
        throw new Error(USER_FACING_CONNECTION_ERROR);
      }
      const res = await fetch(`${apiBase}/api/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 10
            ? retryAfter * 1000
            : 2000 + attempt * 1000;
        setStatus("uploading", "Estamos procesando varios documentos. Espera unos segundos y reintentamos automáticamente.");
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Show "Analizando" while reading the response body (min 400ms so el estado se ve).
      setStatus("parsing");
      const [json] = await Promise.all([
        res.json().catch(() => ({})),
        new Promise((r) => setTimeout(r, 400)),
      ]);

      // Cola activa: el POST devuelve 202 { step:"queued", jobId } → pollear hasta terminal.
      const jobId = res.status === 202 ? (json as { jobId?: string }).jobId : undefined;
      if (jobId) {
        return await pollUploadJob(apiBase, jobId, setStatus);
      }

      return { ok: res.ok, status: res.status, json: json as Record<string, unknown> };
    }
  };

  const uploadAll = async () => {
    if (isUploading) return; // guard: no arrancar un segundo batch con doble click
    const pending = files.filter(
      (f) => f.status === "pending" || f.status === "error"
    );
    if (!pending.length) return;

    setIsUploading(true);
    setDoneCount(null);
    setUploadResult(null);
    setProgress({ done: 0, total: pending.length });
    let successCount = 0;
    let lastResult: UploadResultData | null = null;

    try {
      // Cola SECUENCIAL (nunca Promise.all/forEach async): un archivo a la vez para no
      // saturar el rate limit del backend ni el parsing pesado de PDF.
      for (let i = 0; i < pending.length; i++) {
        const fs = pending[i];
        const setStatus = (status: FileState, message?: string) =>
          setFiles((prev) =>
            prev.map((f) => (f.file === fs.file ? { ...f, status, message } : f))
          );

        try {
          const { ok, status, json } = await uploadOne(fs, setStatus);
          if (!ok) {
            if (status === 429) {
              // Reintentos agotados: el límite es temporal, no un error del documento.
              throw new Error(
                "No pudimos subir este documento por el límite temporal de subidas. Espera un momento e inténtalo nuevamente."
              );
            }
            if (status >= 500) {
              // Preferir el mensaje real del backend (p. ej. failedReason del job encolado);
              // el genérico queda solo para 5xx opacos (cold-start del proxy, body no-JSON) (#43).
              throw new Error(
                (json as { message?: string }).message ??
                  "El servidor tardó más de lo esperado. Espera unos segundos e intenta nuevamente. Si el documento aparece como fallido, puedes eliminarlo y volver a subirlo."
              );
            }
            // 4xx (validación/parse): conservar el mensaje específico del backend.
            throw new Error(
              (json as { message?: string }).message ?? "No pudimos procesar el documento."
            );
          }

          // Capture scoring + parser metadata from the response
          const result = json;
          if (
            result.transactionalScore ||
            result.recommendedProducts ||
            result.creditScore ||
            result.documentType === "cartola"
          ) {
            lastResult = {
              documentType: result.documentType as string | undefined,
              transactionalScore: result.transactionalScore as number | undefined,
              creditScore: result.creditScore as number | undefined,
              mainInsights: result.mainInsights as string[] | undefined,
              recommendedProducts: result.recommendedProducts as string[] | undefined,
              detectionTier: result.detection_tier as string | undefined,
              detectedBanco: result.detected_banco as string | undefined,
              movementCount: result.movementCount as number | undefined,
              documentId: result.documentId as string | undefined,
              reviewStatus: result.reviewStatus as string | undefined,
            };
          }

          setStatus("success");
          successCount++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Error al procesar";
          setStatus("error", msg);
        } finally {
          setProgress({ done: i + 1, total: pending.length });
        }
      }

      // Uploading a document changes the user's financial data globally —
      // every page could be affected. Invalidate ALL queries so every observer
      // sees fresh data.
      await queryClient.invalidateQueries();
    } finally {
      // finally: el botón NUNCA queda en "Procesando…", aunque algún archivo falle
      // o invalidateQueries lance.
      setIsUploading(false);
      setProgress(null);
      setDoneCount(successCount);
      if (successCount > 0) setUploadResult(lastResult);
    }
  };

  const hasPending = files.some(
    (f) => f.status === "pending" || f.status === "error"
  );
  const total = files.length;
  const successTotal = files.filter((f) => f.status === "success").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Subir documentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto min-h-0 flex-1">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all cursor-pointer select-none",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <div
              className={cn(
                "rounded-full p-3 transition-colors",
                isDragging ? "bg-primary/10" : "bg-muted"
              )}
            >
              <Upload
                className={cn(
                  "h-6 w-6 transition-colors",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium">
                {isDragging
                  ? "Suelta los archivos aquí"
                  : "Arrastra tus documentos aquí"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                o haz clic para seleccionar · PDF, PNG o JPG · Múltiples
                archivos
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div
              className="space-y-2 max-h-56 overflow-y-auto pr-1"
              aria-live="polite"
            >
              {files.map((fs, idx) => (
                <div
                  key={fs.file.name + idx}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    fs.status === "success" &&
                      "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20",
                    fs.status === "error" &&
                      "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
                    (fs.status === "uploading" || fs.status === "parsing") &&
                      "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
                    fs.status === "pending" && "border-muted bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-xs font-medium">
                    {fs.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(fs.file.size / 1024).toFixed(0)} KB
                  </span>

                  {/* State chip */}
                  <span
                    className={cn(
                      "text-xs shrink-0 flex items-center gap-1",
                      fs.status === "success" && "text-emerald-600",
                      fs.status === "error" && "text-red-600",
                      (fs.status === "uploading" ||
                        fs.status === "parsing") &&
                        "text-blue-600",
                      fs.status === "pending" && "text-muted-foreground"
                    )}
                  >
                    {(fs.status === "uploading" ||
                      fs.status === "parsing") && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {fs.status === "success" && (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {fs.status === "error" && (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    <span>{LABEL[fs.status]}</span>
                  </span>

                  {fs.status === "pending" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Quitar archivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  </div>
                  {fs.status === "error" && fs.message && (
                    <p className="text-xs text-red-600 dark:text-red-400 leading-snug break-words">
                      {fs.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Documentos ya subidos — borrar para re-subir (incluye "Borrar todo").
              flat: sin scroll interno propio (el body del drawer ya scrollea). */}
          {!isUploading && <DocumentManager flat />}

          {/* Summary after completion — with smart CTA */}
          {doneCount !== null && !uploadResult && (
            <p className="text-sm text-center text-muted-foreground">
              {doneCount === total
                ? `${doneCount} de ${total} documento${total !== 1 ? "s" : ""} procesado${total !== 1 ? "s" : ""} correctamente.`
                : `${doneCount} de ${total} completado${total !== 1 ? "s" : ""}. Revisa los errores y vuelve a intentarlo.`}
            </p>
          )}

          {/* Post-upload results panel */}
          {uploadResult && doneCount !== null && doneCount > 0 && (() => {
            const isCmf = uploadResult.documentType === 'cmf' || uploadResult.documentType === 'cmf_informe_deudas';
            const tabs = [...new Set(
              (uploadResult.recommendedProducts ?? [])
                .map(getTabFromCode)
                .filter((t): t is string => t !== null)
            )].slice(0, 3);

            const movementCount = uploadResult.movementCount;
            // Fuente de verdad: el backend ya persiste review_status (#36). Si no viene,
            // fallback a la heurística por parser/tier (banco genérico o detección no HIGH).
            const reviewRecommended =
              !isCmf &&
              (uploadResult.reviewStatus != null
                ? uploadResult.reviewStatus === "required"
                : uploadResult.detectedBanco === "Genérico" ||
                  (uploadResult.detectionTier != null &&
                    uploadResult.detectionTier !== "HIGH"));
            const reviewHref =
              reviewRecommended && uploadResult.documentId
                ? `/movimientos?review=1&documentId=${uploadResult.documentId}`
                : reviewRecommended
                  ? "/movimientos?review=1"
                  : "/movimientos";

            return (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                {/* Cartola: aviso de revisión (parser genérico/confianza media) o conteo */}
                {!isCmf && reviewRecommended && (
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Revisa tus movimientos</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {movementCount != null
                          ? `Leímos ${movementCount} movimiento${movementCount !== 1 ? "s" : ""} de tu cartola con una extracción general. `
                          : "Leímos tu cartola con una extracción general. "}
                        Revisa que los montos y las fechas estén correctos antes de confiar en tu score.
                      </p>
                    </div>
                  </div>
                )}
                {!isCmf && !reviewRecommended && movementCount != null && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Cartola procesada</p>
                      <p className="text-xs text-muted-foreground">
                        Detectamos {movementCount} movimiento{movementCount !== 1 ? "s" : ""}.
                      </p>
                    </div>
                  </div>
                )}

                {/* CMF credit score */}
                {isCmf && uploadResult.creditScore != null && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Tu score crediticio CMF: {uploadResult.creditScore}/100
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Basado en tu informe de deudas CMF
                      </p>
                    </div>
                  </div>
                )}

                {/* CMF without score — generic success */}
                {isCmf && uploadResult.creditScore == null && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Informe CMF procesado
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tu salud financiera se ha actualizado
                      </p>
                    </div>
                  </div>
                )}

                {/* Transactional score (cartola) */}
                {!isCmf && uploadResult.transactionalScore != null && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Tu score transaccional: {uploadResult.transactionalScore}/100
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Basado en los movimientos de tu cartola
                      </p>
                    </div>
                  </div>
                )}

                {/* CMF main CTA — go to salud financiera */}
                {isCmf && (
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => {
                      onOpenChange(false);
                      navigate("/salud-financiera");
                    }}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    Ver salud financiera
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}

                {/* Cartola: recommended categories */}
                {!isCmf && tabs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Productos recomendados para tu perfil:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tabs.map((tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/productos?tab=${tab}`);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {TAB_LABELS[tab] ?? tab}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cartola: main CTAs */}
                {!isCmf && (
                  <>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(tabs.length > 0 ? `/productos?tab=${tabs[0]}` : "/productos");
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Ver recomendaciones personalizadas
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(reviewHref);
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {reviewRecommended ? "Revisar movimientos" : "Ver mis movimientos"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Actions — footer fijo, fuera del área scrolleable (siempre visible) */}
        <div className="flex gap-2 justify-end pt-3 border-t border-border">
          {!isUploading && files.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-xs"
            >
              Limpiar lista
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cerrar
          </Button>
          {hasPending && (
            <Button
              size="sm"
              onClick={uploadAll}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  {progress
                    ? `Subiendo ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`
                    : "Procesando…"}
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Subir{" "}
                  {
                    files.filter(
                      (f) =>
                        f.status === "pending" || f.status === "error"
                    ).length
                  }{" "}
                  archivo
                  {files.filter(
                    (f) => f.status === "pending" || f.status === "error"
                  ).length !== 1
                    ? "s"
                    : ""}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
