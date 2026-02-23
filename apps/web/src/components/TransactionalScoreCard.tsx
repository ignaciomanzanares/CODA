import { useMutation } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import type { SimulateBankFlowResponse, TransactionalScoreResult } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, BarChart3, Loader2, RefreshCw, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Códigos SFA → nombre para Ofertas Recomendadas */
const PRODUCT_LABELS: Record<string, string> = {
  C001: "Crédito de Consumo Preferencial",
  C002: "Crédito con descuento por planilla",
  C003: "Línea de crédito en cuenta corriente",
  E001: "Depósito a plazo",
  E002: "Depósito a plazo renovable",
  E003: "Depósito a plazo indefinido",
};

function getProductLabel(code: string): string {
  return PRODUCT_LABELS[code] || code;
}

/** Heurística: insight positivo (check verde) vs recomendación (alerta naranja). */
function isRecommendation(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("podría subir") ||
    t.includes("recomendación") ||
    t.includes("optimización") ||
    t.includes("considera") ||
    t.includes("si usas") ||
    t.includes("reducir intereses") ||
    (t.includes("mejorar") && (t.includes("score") || t.includes("si ")))
  );
}

/** Gauge semicircular 0-1000. Arco ~π*50 ≈ 157 unidades. */
function ScoreGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 1000) * 100));
  const dashLength = (pct / 100) * 157;
  const color =
    score >= 700 ? "stroke-emerald-500" : score >= 450 ? "stroke-amber-500" : "stroke-rose-500";

  return (
    <div className="relative w-44 h-28 flex justify-center">
      <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
        {/* Fondo del arco */}
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted/60"
          strokeLinecap="round"
        />
        {/* Arco de valor */}
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dashLength} 200`}
          className={cn("transition-all duration-700", color)}
        />
      </svg>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <span className="text-2xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground block">/ 1000</span>
      </div>
    </div>
  );
}

export default function TransactionalScoreCard() {
  const { simulateBankFlow } = useApi();
  const mutation = useMutation({
    mutationFn: simulateBankFlow,
  });

  const data = mutation.data as SimulateBankFlowResponse | undefined;
  const scoreResult = data?.score;
  const isLoading = mutation.isPending;
  const hasResult = !!scoreResult && !mutation.isError;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Score Transaccional
        </CardTitle>
        <CardDescription>
          Basado en tu comportamiento financiero (cuentas y productos SFA)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {!hasResult && !isLoading && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Obtén tu puntuación transaccional y ofertas recomendadas en base a tus datos.
            </p>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="gap-2"
            >
              Obtener mi score transaccional
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-center">
                Analizando tu comportamiento financiero...
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Simulando consentimiento y datos para tu perfil
              </p>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          </div>
        )}

        {hasResult && scoreResult && (
          <TransactionalScoreContent score={scoreResult} onRefresh={() => mutation.mutate()} />
        )}

        {mutation.isError && (
          <div className="py-4 text-center">
            <p className="text-sm text-destructive mb-2">No se pudo calcular el score.</p>
            <Button variant="outline" size="sm" onClick={() => mutation.mutate()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionalScoreContent({
  score,
  onRefresh,
}: {
  score: TransactionalScoreResult;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center">
        <ScoreGauge score={score.transactionalScore} />
      </div>

      {score.mainInsights && score.mainInsights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Insights
          </p>
          <ul className="space-y-2">
            {score.mainInsights.map((text, i) => {
              const isRec = isRecommendation(text);
              return (
                <li key={i} className="flex gap-2 text-sm">
                  {isRec ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500 mt-0.5" />
                  )}
                  <span className={cn(isRec && "text-amber-800 dark:text-amber-200")}>{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {score.recommendedProducts && score.recommendedProducts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            Ofertas recomendadas
          </p>
          <div className="grid grid-cols-1 gap-2">
            {score.recommendedProducts.map((code) => (
              <div
                key={code}
                className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                {getProductLabel(code)}
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4" />
        Volver a analizar
      </Button>
    </div>
  );
}
