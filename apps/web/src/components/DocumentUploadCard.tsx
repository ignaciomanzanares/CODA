import { useState, useCallback } from "react";
import { useApi } from "@/lib/api";
import type { DocumentUploadResult } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: Record<string, string> = {
  reading: "Leyendo documento...",
  extracting: "Extrayendo datos CMF...",
  scoring: "Calculando impacto en tu Score...",
  done: "Listo",
};

export default function DocumentUploadCard() {
  const { uploadDocument } = useApi();
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setError("Solo se aceptan archivos PDF (Informe CMF o Cartola bancaria).");
        return;
      }
      setError(null);
      setResult(null);
      setLoading(true);
      setProgressStep("reading");
      try {
        setProgressStep("extracting");
        const res = await uploadDocument(file);
        setProgressStep("scoring");
        setResult(res);
        setProgressStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al procesar el documento.");
        setProgressStep(null);
      } finally {
        setLoading(false);
      }
    },
    [uploadDocument]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
  }, []);
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Documentos oficiales
        </CardTitle>
        <CardDescription>
          Sube un Informe de Deudas CMF o una Cartola bancaria (PDF) para actualizar tu Score crediticio y transaccional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            id="document-upload"
            onChange={onInputChange}
            disabled={loading}
          />
          {loading ? (
            <div className="space-y-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">
                {progressStep ? STEPS[progressStep] ?? progressStep : "Procesando..."}
              </p>
              <p className="text-xs text-muted-foreground">
                {progressStep === "reading" && "Leyendo documento..."}
                {progressStep === "extracting" && "Extrayendo datos CMF..."}
                {progressStep === "scoring" && "Calculando impacto en tu Score..."}
              </p>
            </div>
          ) : (
            <>
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                Arrastra un PDF aquí o haz clic para seleccionar
              </p>
              <label htmlFor="document-upload">
                <Button type="button" variant="secondary" className="cursor-pointer">
                  Seleccionar PDF
                </Button>
              </label>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
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
                  <p className="font-medium pt-1">Score crediticio actualizado: {result.creditScore} (Excellent)</p>
                )}
              </div>
            )}
            {result.documentType === "cartola" && result.transactionalScore != null && (
              <div className="text-sm space-y-1">
                <p className="font-medium">Score transaccional: {result.transactionalScore} / 1000</p>
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
