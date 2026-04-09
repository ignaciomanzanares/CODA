import { useState, useCallback, useRef } from "react";
import { useApi } from "@/lib/api";
import { useReportData } from "@/contexts/ReportDataContext";
import { queryClient } from "@/lib/queryClient";
import type { DocumentUploadResult } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Analytics } from "@/lib/analytics";

const STEPS: Record<string, string> = {
  reading: "Leyendo documento...",
  extracting: "Extrayendo datos CMF...",
  scoring: "Calculando impacto en tu Score...",
  done: "Listo",
};

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
        
        try {
          setProgressStep("extracting");
          const res = await uploadDocument(validFiles[i]);
          setProgressStep("scoring");
          lastResult = res;
          
          // Handle warnings from server
          if (res.warnings && res.warnings.length > 0) {
            setWarnings(res.warnings);
          }
          
          if (res.error) {
            setError(res.error);
            setProgressStep(null);
            break;
          }
        } catch (e: any) {
          // Better error messages
          let errorMsg = "Error al procesar el documento.";
          
          if (e?.response?.data?.message) {
            errorMsg = e.response.data.message;
          } else if (e instanceof Error) {
            errorMsg = e.message;
          }
          
          setError(errorMsg);
          setProgressStep(null);
          break;
        }
      }
      if (lastResult && !lastResult.error) {
        setResult(lastResult);
        setProgressStep("done");
        setUploadResult({
          ...(lastResult.creditScore != null && { creditScore: lastResult.creditScore }),
          ...(lastResult.transactionalScore != null && { transactionalScore: lastResult.transactionalScore }),
          ...(lastResult.mainInsights != null && { mainInsights: lastResult.mainInsights }),
          ...(lastResult.cmf?.rutDocumento && { documentRut: lastResult.cmf.rutDocumento }),
          ...(lastResult.cmf?.deudaTotalVigente != null && { cmfDeudaTotalVigente: lastResult.cmf.deudaTotalVigente }),
        });
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
    if (!loading) inputRef.current?.click();
  }, [loading]);

  return (
    <Card>
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

        {result && result.step === "done" && !result.error && (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
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
