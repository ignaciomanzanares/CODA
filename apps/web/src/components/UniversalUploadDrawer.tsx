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
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { getPersonalToken } from "@/lib/auth";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";

type FileState = "pending" | "uploading" | "parsing" | "success" | "error";

interface FileStatus {
  file: File;
  status: FileState;
  message?: string;
}

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
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { autoPickFile, clearAutoPickFile } = useUploadDrawer();

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
  };

  const uploadAll = async () => {
    const pending = files.filter(
      (f) => f.status === "pending" || f.status === "error"
    );
    if (!pending.length) return;

    setIsUploading(true);
    setDoneCount(null);
    let successCount = 0;

    for (const fs of pending) {
      const setStatus = (status: FileState, message?: string) =>
        setFiles((prev) =>
          prev.map((f) =>
            f.file === fs.file ? { ...f, status, message } : f
          )
        );

      // Yield to the renderer so "uploading" paint is guaranteed before fetch blocks.
      setStatus("uploading");
      await new Promise((r) => setTimeout(r, 0));
      try {
        const token = getPersonalToken() ?? "";
        const formData = new FormData();
        formData.append("document", fs.file);

        const apiBase = (API_URL || "").replace(/\/$/, "");
        const res = await fetch(`${apiBase}/api/documents/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        // Show "Analizando" while reading the response body.
        // Minimum 400ms so the user sees the state change.
        setStatus("parsing");
        const [json] = await Promise.all([
          res.json().catch(() => ({})),
          new Promise((r) => setTimeout(r, 400)),
        ]);

        if (!res.ok) {
          throw new Error(
            (json as { message?: string }).message ?? `Error ${res.status}`
          );
        }

        setStatus("success");
        successCount++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al procesar";
        setStatus("error", msg);
      }
    }

    // Invalidate all relevant query keys (movements + scores)
    await queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
    await queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/transactions/parsed"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/transactions/insights"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/transactions/summary"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/transactional-score"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/score/documents/count"] });

    setIsUploading(false);
    setDoneCount(successCount);
  };

  const hasPending = files.some(
    (f) => f.status === "pending" || f.status === "error"
  );
  const total = files.length;
  const successTotal = files.filter((f) => f.status === "success").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir documentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    fs.status === "success" &&
                      "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20",
                    fs.status === "error" &&
                      "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
                    (fs.status === "uploading" || fs.status === "parsing") &&
                      "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
                    fs.status === "pending" && "border-muted bg-muted/30"
                  )}
                >
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
                    <span>
                      {fs.status === "error" && fs.message
                        ? fs.message.slice(0, 35)
                        : LABEL[fs.status]}
                    </span>
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
              ))}
            </div>
          )}

          {/* Summary after completion */}
          {doneCount !== null && (
            <p className="text-sm text-center text-muted-foreground">
              {doneCount === total
                ? `${doneCount} de ${total} documento${total !== 1 ? "s" : ""} procesado${total !== 1 ? "s" : ""} correctamente.`
                : `${doneCount} de ${total} completado${total !== 1 ? "s" : ""}. Revisa los errores y vuelve a intentarlo.`}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
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
                    Procesando…
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
