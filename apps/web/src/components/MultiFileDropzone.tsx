/**
 * MultiFileDropzone — Drag & drop para subir múltiples PDFs de cartola.
 * Cada archivo se sube en serie al endpoint /api/documents/upload,
 * con feedback visual de progreso por archivo.
 */
import { useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, X } from "lucide-react";

interface FileStatus {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  message?: string;
}

interface MultiFileDropzoneProps {
  onDone?: (successCount: number) => void;
  className?: string;
}

export default function MultiFileDropzone({ onDone, className }: MultiFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfs.length) return;
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.file.name));
      const toAdd = pdfs.filter(f => !existingNames.has(f.name));
      return [...prev, ...toAdd.map(f => ({ file: f, status: "pending" as const }))];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const uploadAll = async () => {
    const pending = files.filter(f => f.status === "pending" || f.status === "error");
    if (!pending.length) return;

    setIsUploading(true);
    let successCount = 0;

    for (const fs of pending) {
      // Mark as uploading
      setFiles(prev => prev.map(f => f.file === fs.file ? { ...f, status: "uploading" } : f));

      try {
        const formData = new FormData();
        formData.append("document", fs.file);

        const apiBase = (API_URL || "").replace(/\/$/, "");
        const res = await fetch(`${apiBase}/api/documents/upload`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? `Error ${res.status}`);
        }

        setFiles(prev => prev.map(f => f.file === fs.file ? { ...f, status: "success", message: "Cartola procesada correctamente" } : f));
        successCount++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al procesar";
        setFiles(prev => prev.map(f => f.file === fs.file ? { ...f, status: "error", message: msg } : f));
      }
    }

    // Invalidate queries so Panel + Gastos reload data
    await queryClient.invalidateQueries({ queryKey: ["/api/transactions/parsed"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/transactions/insights"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
    await queryClient.invalidateQueries({ queryKey: ["financial-summary"] });

    setIsUploading(false);
    onDone?.(successCount);
  };

  const hasPending = files.some(f => f.status === "pending" || f.status === "error");

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all cursor-pointer select-none",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <div className={cn("rounded-full p-3 transition-colors", isDragging ? "bg-primary/10" : "bg-muted")}>
          <Upload className={cn("h-6 w-6 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div>
          <p className="text-sm font-medium">
            {isDragging ? "Suelta los archivos aquí" : "Arrastra tus cartolas PDF aquí"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar · Múltiples archivos permitidos</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={e => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fs, idx) => (
            <div
              key={fs.file.name + idx}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                fs.status === "success" && "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20",
                fs.status === "error"   && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
                fs.status === "uploading" && "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
                fs.status === "pending" && "border-muted bg-muted/30"
              )}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-xs font-medium">{fs.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(fs.file.size / 1024).toFixed(0)} KB
              </span>
              {fs.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
              {fs.status === "success"   && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
              {fs.status === "error"     && (
                <span className="flex items-center gap-1 text-xs text-red-600">
                  <XCircle className="h-3.5 w-3.5" />
                  {fs.message ? fs.message.slice(0, 40) : "Error"}
                </span>
              )}
              {(fs.status === "pending") && (
                <button onClick={e => { e.stopPropagation(); removeFile(idx); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex gap-2 justify-end">
          {!isUploading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiles([])}
              className="text-xs"
            >
              Limpiar lista
            </Button>
          )}
          <Button
            size="sm"
            onClick={uploadAll}
            disabled={isUploading || !hasPending}
            className="text-xs"
          >
            {isUploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Procesando...</>
            ) : (
              <><Upload className="h-3.5 w-3.5 mr-1.5" />Subir {files.filter(f => f.status === "pending" || f.status === "error").length} cartola{files.filter(f => f.status === "pending" || f.status === "error").length !== 1 ? "s" : ""}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
