import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ArrowRight, Upload, Wallet, Info, CheckCircle2, Circle } from "lucide-react";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import { useToast } from "@/hooks/use-toast";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import HealthLevelCard from "@/components/health/HealthLevelCard";
import EvaluationBreakdown from "@/components/health/EvaluationBreakdown";
import {
  useHealthEvaluation,
  type HealthResponse,
  type HealthSalida,
} from "@/hooks/useHealthEvaluation";

const SALIDA_LABEL: Record<HealthSalida, string> = {
  ahorro_inversion: "Ahorro e Inversión",
  refinanciamiento: "Refinanciamiento",
  reestructuracion: "Reestructuración",
  concursal: "Asesoría legal",
};

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const { openWithFilePicker } = useUploadDrawer();
  const { apiRequest } = useApi();
  const { toast } = useToast();
  const { documents } = useUserDocuments();

  const { data, isLoading, isError, error } = useHealthEvaluation();

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest<HealthResponse>("GET", "/api/health-evaluation/me"),
    onSuccess: (result) => {
      queryClient.setQueryData(["health-evaluation"], result);
    },
    onError: () => {
      toast({
        title: "No pudimos recalcular tu salud financiera",
        description:
          "Inténtalo nuevamente en unos segundos. Si el problema persiste, vuelve a cargar la página.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Salud financiera</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-lg font-semibold">No pudimos cargar tu salud financiera</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Hubo un problema al obtener tu evaluación. Intenta recargar la página o recalcular más
              tarde.
            </p>
            {msg && <p className="text-xs text-muted-foreground">Detalle: {msg}</p>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["health-evaluation"] })}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.hasData) {
    const missing = data?.missingData;
    const cartolaMissing = !!missing?.cartola;
    const cmfMissing = !!missing?.cmf;
    const description = !missing
      ? "Necesitamos algunos documentos adicionales para calcular tu salud financiera."
      : cartolaMissing && cmfMissing
        ? "Necesitamos una cartola bancaria y tu informe CMF para calcular tu salud financiera."
        : cmfMissing
          ? "Ya tenemos tus movimientos, pero falta tu informe CMF para completar la evaluación."
          : cartolaMissing
            ? "Ya tenemos tu información CMF, pero falta una cartola bancaria para analizar tus movimientos."
            : "Necesitamos algunos documentos adicionales para calcular tu salud financiera.";
    const ctaLabel =
      cmfMissing && !cartolaMissing
        ? "Subir informe CMF"
        : cartolaMissing && !cmfMissing
          ? "Subir cartola bancaria"
          : "Subir documentos";

    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Salud financiera</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold">Aún no podemos calcular tu salud financiera</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
            {missing && (
              <div className="mx-auto w-full max-w-xs space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-left text-sm">
                <div className="flex items-center gap-2">
                  {cartolaMissing ? (
                    <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span className={cartolaMissing ? "text-muted-foreground" : "text-foreground"}>
                    Cartola bancaria
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {cmfMissing ? (
                    <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span className={cmfMissing ? "text-muted-foreground" : "text-foreground"}>
                    Informe CMF
                  </span>
                </div>
              </div>
            )}
            <div className="flex justify-center pt-1">
              <Button className="gap-2" onClick={openWithFilePicker}>
                <Upload className="w-4 h-4" />
                {ctaLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { evaluation, descripcionNivel } = data;
  if (!evaluation) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Salud financiera</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <RefreshCw className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold">No pudimos calcular tu evaluación</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Tus datos están disponibles, pero no logramos generar la evaluación de salud
              financiera. Puedes intentar recalcular o subir una nueva cartola.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                className="gap-2"
                onClick={() => recalcMutation.mutate()}
                disabled={recalcMutation.isPending}
              >
                <RefreshCw
                  className={`w-4 h-4 ${recalcMutation.isPending ? "animate-spin" : ""}`}
                />
                Reintentar
              </Button>
              <Button variant="outline" className="gap-2" onClick={openWithFilePicker}>
                <Upload className="w-4 h-4" />
                Subir documentos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Salud financiera</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
          Recalcular
        </Button>
      </div>

      {/* Indicador de confianza de datos según el estado de revisión de las cartolas
          importadas (#36/#37). No cambia el score; solo contextualiza su confiabilidad. */}
      {documents.length > 0 &&
        (() => {
          const hasRequired = documents.some((d) => d.reviewStatus === "required");
          const hasReviewed = documents.some((d) => d.reviewStatus === "reviewed");

          if (hasRequired) {
            return (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Revisión recomendada</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Tu score usa movimientos importados que aún no marcaste como revisados.
                    Revísalos para aumentar la confianza del análisis.
                  </p>
                  <Link
                    href="/movimientos?review=1"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Revisar movimientos
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          }
          if (hasReviewed) {
            return (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Datos revisados</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Tus movimientos importados fueron marcados como revisados.
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Datos procesados correctamente
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  No hay revisión pendiente para tus cartolas importadas.
                </p>
              </div>
            </div>
          );
        })()}

      <HealthLevelCard
        nivel={evaluation.nivel}
        nivelNombre={evaluation.nivelNombre}
        salida={evaluation.salida}
        scoreCompuesto={evaluation.scoreCompuesto}
        descripcionNivel={descripcionNivel}
      />

      {(evaluation.insights ?? []).length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {(evaluation.insights ?? []).map((insight, i) => (
              <p key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                {insight}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {evaluation.ratios && <EvaluationBreakdown ratios={evaluation.ratios} />}

      {evaluation.salida !== "concursal" && (evaluation.productos ?? []).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Plan de acción — {SALIDA_LABEL[evaluation.salida]}
          </h2>
          <div className="space-y-2">
            {evaluation.productos.map((p, i) => (
              <Card
                key={i}
                className="border border-gray-100 hover:border-blue-200 transition-colors"
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{p.productName}</div>
                    <div className="text-xs text-gray-500">{p.provider}</div>
                  </div>
                  <Link href={`${ROUTES.productos}?categoria=${p.category}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-blue-600 hover:text-blue-700"
                    >
                      Ver <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {evaluation.salida === "concursal" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-700 font-medium mb-1">Situación de insolvencia activa</p>
            <p className="text-sm text-red-600">
              Tu nivel de deuda requiere asesoría legal especializada. CODA no recomienda
              refinanciamiento en esta situación — hacerlo empeoraría tu carga.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-4">
        <Link href={ROUTES.misActivos}>
          <Button variant="outline" className="gap-2 w-full">
            <Wallet className="w-4 h-4" />
            Gestionar mis activos para mejorar la precisión del diagnóstico
          </Button>
        </Link>
      </div>
    </div>
  );
}
