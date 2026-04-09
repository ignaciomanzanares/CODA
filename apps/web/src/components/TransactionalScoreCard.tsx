import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useReportData } from "@/contexts/ReportDataContext";
import { queryClient } from "@/lib/queryClient";
import type { TransactionalScoreResult } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, BarChart3, Loader2, RefreshCw, Package, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const TRANSACTIONAL_SCORE_TIMEOUT_MS = 10_000;
const TRANSACTIONAL_SCORE_TIMEOUT_ERROR = "TRANSACTIONAL_SCORE_TIMEOUT";

/** Mensaje unificado: sin cartola / timeout / error de red */
const NO_SCORE_AVAILABLE_MSG =
  "Score transaccional no disponible aún. Sube una cartola bancaria para calcularlo.";

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

/** Gauge semicircular 0-100. Arco ~π*50 ≈ 157 unidades. */
function ScoreGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const dashLength = (pct / 100) * 157;
  const color =
    score >= 70 ? "stroke-emerald-500" : score >= 45 ? "stroke-amber-500" : "stroke-rose-500";

  return (
    <div className="relative w-44 h-28 flex justify-center">
      <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted/60"
          strokeLinecap="round"
        />
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
        <span className="text-xs text-muted-foreground block">/ 100</span>
      </div>
    </div>
  );
}

export default function TransactionalScoreCard() {
  const [location] = useLocation();
  const authContext = location.startsWith("/empresas") ? "empresas" : "personal";
  const { isAuthenticated, isLoading: authLoading } = useAuth(authContext);
  const { getTransactionalScore } = useApi();
  const { setTransactionalResult } = useReportData();

  const queryEnabled = isAuthenticated && !authLoading && authContext === "personal";

  const { data, isLoading, isRefetching, error, isError, isSuccess, refetch } = useQuery({
    queryKey: ["/api/transactional-score"],
    queryFn: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(TRANSACTIONAL_SCORE_TIMEOUT_ERROR)), TRANSACTIONAL_SCORE_TIMEOUT_MS);
        });
        const result = await Promise.race([getTransactionalScore(), timeout]);
        if (timer) clearTimeout(timer);
        return result;
      } catch (e) {
        if (timer) clearTimeout(timer);
        throw e;
      }
    },
    enabled: queryEnabled,
    retry: false,
  });

  const scoreResult: TransactionalScoreResult | null =
    data && typeof data === "object" && "transactionalScore" in data && data.transactionalScore != null
      ? {
          transactionalScore: data.transactionalScore,
          mainInsights: data.mainInsights ?? [],
          recommendedProducts: data.recommendedProducts ?? [],
          metrics: data.metrics,
        }
      : null;

  useEffect(() => {
    if (data && typeof data === "object" && "transactionalScore" in data && data.transactionalScore != null) {
      setTransactionalResult({
        transactionalScore: data.transactionalScore,
        mainInsights: data.mainInsights ?? [],
        metrics: data.metrics,
      });
    }
  }, [data, setTransactionalResult]);

  const hasResult = scoreResult != null;
  /** Respuesta OK sin score = aún no hay cartola procesada (mismo mensaje que timeout). */
  const noScoreFromApi = isSuccess && !hasResult;
  const showUnavailable = noScoreFromApi || isError;
  const showSpinner = isLoading && !isError;

  if (authContext !== "personal") {
    return null;
  }

  if (authLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Score Transaccional
          </CardTitle>
          <CardDescription>Cargando…</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Score Transaccional
        </CardTitle>
        <CardDescription>
          Basado en cartolas bancarias (métricas SFA). Sube una cartola en Documentos Oficiales.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {showUnavailable && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground text-center max-w-sm">{NO_SCORE_AVAILABLE_MSG}</p>
            {isError && (
              <Button variant="outline" size="sm" className="mt-1" onClick={() => refetch()}>
                Reintentar
              </Button>
            )}
          </div>
        )}

        {showSpinner && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-center">Cargando score transaccional...</p>
            </div>
            <Skeleton className="h-20 w-full rounded" />
          </div>
        )}

        {hasResult && scoreResult && !showSpinner && (
          <TransactionalScoreContent
            score={scoreResult}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/transactional-score"] })}
            isRefetching={isRefetching}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TransactionalScoreContent({
  score,
  onRefresh,
  isRefetching,
}: {
  score: TransactionalScoreResult;
  onRefresh: () => void;
  isRefetching?: boolean;
}) {
  const metrics = score.metrics;

  return (
    <div className="space-y-4">
      <p className="text-xs text-center text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-md py-2 px-3">
        Modelo preliminar basado en comportamiento transaccional (Hjelkrem et al. 2022).
        Se valida en paralelo con el score tradicional. Las decisiones comerciales no dependen
        exclusivamente de este score.
      </p>
      <div className="flex flex-col items-center">
        <ScoreGauge score={score.transactionalScore} />
      </div>

      {metrics && (metrics.averageMonthlyBalanceClp != null || metrics.monthsWithAbonos != null) && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          {metrics.averageMonthlyBalanceClp != null && (
            <div>
              <p className="text-xs text-muted-foreground">Saldo promedio (CLP)</p>
              <p className="font-medium">${metrics.averageMonthlyBalanceClp.toLocaleString("es-CL")}</p>
            </div>
          )}
          {metrics.monthsWithAbonos != null && (
            <div>
              <p className="text-xs text-muted-foreground">Meses con abonos (12m)</p>
              <p className="font-medium">{metrics.monthsWithAbonos}</p>
            </div>
          )}
        </div>
      )}

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

      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-2 text-muted-foreground"
        onClick={onRefresh}
        disabled={isRefetching}
      >
        <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
        Actualizar
      </Button>
    </div>
  );
}
