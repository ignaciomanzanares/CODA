import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "@/lib/api";
import { useReportData } from "@/contexts/ReportDataContext";
import { queryClient } from "@/lib/queryClient";
import type { DocumentUploadResult } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, CheckCircle2, AlertCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Analytics } from "@/lib/analytics";

const STEPS: Record<string, string> = {
  reading: "Leyendo documento...",
  extracting: "Extrayendo datos CMF...",
  scoring: "Calculando impacto en tu Score...",
  done: "Listo",
};

/**
 * Mensajes de error estructurados por código.
 * Los códigos vienen del campo `error_code` de la API (ParseError en backend).
 */
const PARSE_ERROR_MESSAGES: Record<string, { title: string; hint: string }> = {
  FORMAT_UNKNOWN: {
    title: "Banco no reconocido",
    hint: "Sube una cartola PDF de Santander, BCI, Banco de Chile, BancoEstado, Itaú o Scotiabank. Si el archivo es una imagen escaneada, descarga el PDF directamente desde el portal web del banco.",
  },
  FORMAT_UNSUPPORTED: {
    title: "Banco no compatible aún",
    hint: "Tu banco fue detectado pero aún no está soportado. Contáctanos para solicitar compatibilidad.",
  },
  TEXT_EXTRACTION_FAILED: {
    title: "PDF no legible",
    hint: "El archivo no tiene texto digital extraíble (probablemente es una imagen escaneada). Descarga la cartola directamente desde el sitio web de tu banco — no la escanees ni la fotografíes.",
  },
  NO_TRANSACTIONS: {
    title: "Sin transacciones",
    hint: "El parser leyó el PDF pero no encontró movimientos. Verifica que la cartola tenga al menos un movimiento en el período, o descárgala desde el portal web del banco (no desde una app móvil).",
  },
  BALANCE_MISMATCH: {
    title: "Saldos no cuadran",
    hint: "Las transacciones no cuadran con el saldo final reportado. Puede que la cartola esté incompleta o le falten páginas. Descarga el PDF completo del portal del banco.",
  },
  LOW_CONFIDENCE: {
    title: "Extracción poco confiable",
    hint: "La confianza del parseo es muy baja. Puede que el formato del PDF no sea compatible. Descarga la cartola directamente desde el portal web del banco.",
  },
};

const PENDING_UPLOAD_KEY = 'coda:pending_upload';

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function toFileList(files: FileList | null): File[] {
  if (!files?.length) return [];
  return filterValidFiles(Array.from(files));
}

/** Misma lógica que toFileList pero para un arreglo ya materializado (p. ej. drag-and-drop). */
function filterValidFiles(files: readonly File[]): File[] {
  return files.filter(
    (f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE
  );
}

function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Formato no permitido: ${file.type}. Formatos válidos: PDF, PNG, JPG, WEBP.`
    };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Archivo demasiado grande (${sizeMB} MB). Máximo: 10 MB.`
    };
  }
  
  if (file.size < 1024) {
    return {
      valid: false,
      error: 'Archivo demasiado pequeño. Puede estar vacío o corrupto.'
    };
  }
  
  return { valid: true };
}

export default function DocumentUploadCard() {
  const { uploadDocument } = useApi();
  const { setUploadResult } = useReportData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingUploadBanner, setPendingUploadBanner] = useState<{ filename: string } | null>(null);

  // On mount: check if a prior upload was interrupted by a session expiry.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_UPLOAD_KEY);
    if (raw) {
      try {
        const meta = JSON.parse(raw) as { filename?: string };
        if (meta.filename) setPendingUploadBanner({ filename: meta.filename });
      } catch {
        sessionStorage.removeItem(PENDING_UPLOAD_KEY);
      }
    }
  }, []);

  const processFiles = useCallback(
    async (fileList: File[]) => {
      const validFiles = filterValidFiles(fileList);
      
      // Client-side validation
      if (validFiles.length === 0) {
        // Check if files were rejected due to type or size
        const rejectedFiles = Array.from(fileList).filter(f => !validFiles.includes(f));
        if (rejectedFiles.length > 0) {
          const firstRejected = rejectedFiles[0];
          const validation = validateFile(firstRejected);
          setError(validation.error || "Archivo no válido.");
        } else {
          setError("No se seleccionó ningún archivo válido. Formatos: PDF, PNG, JPG, WEBP (máx 10 MB).");
        }
        return;
      }
      
      setError(null);
      setWarnings([]);
      setResult(null);
      setLoading(true);
      setProgressTotal(validFiles.length);
      let lastResult: DocumentUploadResult | null = null;
      
      for (let i = 0; i < validFiles.length; i++) {
        setProgressCurrent(i + 1);
        setProgressStep("reading");

        // Validate each file
        const validation = validateFile(validFiles[i]);
        if (!validation.valid) {
          setError(validation.error!);
          setProgressStep(null);
          setLoading(false);
          return;
        }

        // Store minimal metadata so the interrupted-upload banner can surface
        // if a 401 fires mid-upload and the user has to re-authenticate.
        // We store only metadata (no file bytes) — File objects are not
        // serializable and financial data must not linger in sessionStorage.
        const currentFile = validFiles[i]!;
        sessionStorage.setItem(
          PENDING_UPLOAD_KEY,
          JSON.stringify({
            filename: currentFile.name,
            size: currentFile.size,
            lastModified: currentFile.lastModified,
            sourcePage: window.location.pathname,
          })
        );
        setPendingUploadBanner(null); // dismiss any stale banner

        try {
          setProgressStep("extracting");
          const res = await uploadDocument(currentFile);
          setProgressStep("scoring");
          lastResult = res;
          
          // Handle warnings from server
          if (res.warnings && res.warnings.length > 0) {
            setWarnings(res.warnings);
          }
          
          if (res.error) {
            sessionStorage.removeItem(PENDING_UPLOAD_KEY); // non-auth failure
            setError(res.error);
            setProgressStep(null);
            break;
          }
        } catch (e: any) {
          // 401 is handled globally by SessionExpiryGuard; leave the
          // PENDING_UPLOAD_KEY in sessionStorage so the banner shows on return.
          const status = (e as { status?: number })?.status;
          if (status !== 401) sessionStorage.removeItem(PENDING_UPLOAD_KEY);

          // Map structured error_code from API to a targeted message, fallback to raw message
          const apiData = e?.response?.data ?? e?.data;
          const errorCode: string | undefined = apiData?.error_code;
          const rawMessage: string =
            apiData?.message ?? (e instanceof Error ? e.message : "Error al procesar el documento.");

          if (errorCode && PARSE_ERROR_MESSAGES[errorCode]) {
            const { title, hint } = PARSE_ERROR_MESSAGES[errorCode];
            setError(`${title}: ${hint}`);
          } else {
            setError(rawMessage);
          }
          setProgressStep(null);
          break;
        }
      }
      if (lastResult && !lastResult.error) {
        sessionStorage.removeItem(PENDING_UPLOAD_KEY); // success
        setResult(lastResult);
        setProgressStep("done");
        setUploadResult({
          ...(lastResult.creditScore != null && { creditScore: lastResult.creditScore }),
          ...(lastResult.transactionalScore != null && { transactionalScore: lastResult.transactionalScore }),
          ...(lastResult.mainInsights != null && { mainInsights: lastResult.mainInsights }),
          ...(lastResult.cmf?.rutDocumento && { documentRut: lastResult.cmf.rutDocumento }),
          ...(lastResult.cmf?.deudaTotalVigente != null && { cmfDeudaTotalVigente: lastResult.cmf.deudaTotalVigente }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        if (lastResult.documentType === "cartola") {
          Analytics.documentUploaded("cartola");
          queryClient.invalidateQueries({ queryKey: ["/api/transactional-score"] });
        }
        if (lastResult.documentType === "cmf_informe_deudas") {
          Analytics.documentUploaded("cmf");
          queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
        }
      }
      setLoading(false);
    },
    [uploadDocument, setUploadResult]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag(false);
      const files = toFileList(e.dataTransfer.files);
      if (files.length) processFiles(files);
    },
    [processFiles]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = toFileList(e.target.files);
      if (files.length) processFiles(files);
      e.target.value = "";
    },
    [processFiles]
  );

  const onSelectClick = useCallback(() => {
    if (!loading) {
      setPendingUploadBanner(null);
      inputRef.current?.click();
    }
  }, [loading]);

  return (
    <Card id="document-upload-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Documentos oficiales
        </CardTitle>
        <CardDescription>
          Sube un Informe de Deudas CMF o una Cartola bancaria (PDF, PNG, JPG) para actualizar tu Score crediticio y transaccional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Interrupted-upload banner: shown when the user re-authenticates
            after a session expiry that fired during a previous upload. */}
        {pendingUploadBanner && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">Carga interrumpida</p>
              <p>
                Tu carga de <strong>{pendingUploadBanner.filename}</strong> se interrumpió.
                Vuelve a seleccionar el archivo para continuar.
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso"
              className="text-amber-600 hover:text-amber-800 ml-2 shrink-0"
              onClick={() => {
                sessionStorage.removeItem(PENDING_UPLOAD_KEY);
                setPendingUploadBanner(null);
              }}
            >
              ✕
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
          multiple
          className="sr-only"
          aria-hidden="true"
          onChange={onInputChange}
          disabled={loading}
        />
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            drag ? "border-primary bg-primary/5" : "border-muted-foreground/30",
            loading && "pointer-events-none opacity-80"
          )}
        >
          {loading ? (
            <div className="space-y-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">
                {progressStep ? STEPS[progressStep] ?? progressStep : "Procesando..."}
              </p>
              {progressTotal > 1 && (
                <p className="text-xs text-muted-foreground">
                  Procesando {progressCurrent} de {progressTotal}...
                </p>
              )}
              {progressTotal <= 1 && (
                <p className="text-xs text-muted-foreground">
                  {progressStep === "reading" && "Leyendo documento..."}
                  {progressStep === "extracting" && "Extrayendo datos CMF..."}
                  {progressStep === "scoring" && "Calculando impacto en tu Score..."}
                </p>
              )}
            </div>
          ) : (
            <>
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                Arrastra uno o más archivos aquí o haz clic para seleccionar
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={onSelectClick}
                disabled={loading}
              >
                Seleccionar archivo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, PNG, JPG, WEBP · Máximo 10 MB
              </p>
            </>
          )}
        </div>

        {warnings && warnings.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">Advertencias:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">Error:</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {result?.error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{result.error}</span>
          </div>
        )}

        {result && result.step === "done" && !result.error && result.detection_tier === "MEDIUM" && result.documentType === "cartola" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">
                Detectamos como {result.detected_banco ?? "banco"} con{" "}
                {result.banco_confidence != null
                  ? `${Math.round(result.banco_confidence * 100)}%`
                  : "baja"}{" "}
                de confianza. Revisa antes de continuar.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100"
                onClick={() => {
                  // CTA: transaction review — user can proceed after acknowledgment
                  alert(
                    "Revisa los movimientos extraídos en la sección de transacciones antes de usarlos para decisiones financieras."
                  );
                }}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Revisar antes de continuar
              </Button>
            </div>
          </div>
        )}

        {result && result.step === "done" && !result.error && (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className={cn(
              "flex items-center gap-2",
              result.detection_tier === "MEDIUM"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}>
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Datos procesados con éxito</span>
            </div>
            {result.documentType === "cmf_informe_deudas" && result.cmf && (
              <div className="text-sm space-y-1">
                <p>Deuda total vigente: ${result.cmf.deudaTotalVigente.toLocaleString("es-CL")} CLP</p>
                <p>Deuda indirecta: ${result.cmf.deudaIndirecta.toLocaleString("es-CL")} CLP</p>
                <p>Número de instituciones: {result.cmf.numeroInstituciones}</p>
                {result.creditScore != null && (
                  <p className="font-medium pt-1">Score crediticio actualizado: {result.creditScore} / 850</p>
                )}
              </div>
            )}
            {result.documentType === "cartola" && result.transactionalScore != null && (
              <div className="text-sm space-y-1">
                <p className="font-medium">Score transaccional: {result.transactionalScore} / 100</p>
                {result.recommendedProducts && result.recommendedProducts.length > 0 && (
                  <p>Ofertas recomendadas: {result.recommendedProducts.join(", ")}</p>
                )}
              </div>
            )}
            {result.mainInsights && result.mainInsights.length > 0 && (
              <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                {result.mainInsights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
