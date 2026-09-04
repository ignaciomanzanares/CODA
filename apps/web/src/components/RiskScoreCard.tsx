/**
 * Tarjeta del doble evaluador de riesgo (Fase E) — consume /api/risk/evaluation.
 *
 * Un titular + segunda opinión, según segmento (thin_file → transaccional; cmf_rich → tradicional).
 * Nunca dos números co-iguales. El transaccional CODA va etiquetado "Beta". Revelación progresiva
 * (<details>) con las dos miradas + reconciliación. Detrás del flag FEATURES.riskDualScore.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, ChevronRight, Upload } from "lucide-react";

type Band = { label: string; desc?: string };
type TradReason = {
  feature: string;
  label: string;
  contribution: number;
  direction: "increases_risk" | "reduces_risk";
};
type Traditional =
  | { available: true; score: number; band: Band; pd: number; reasons: TradReason[] }
  | { available: false };
type Transactional =
  | { available: true; score: number; band: string; pd: number; reasons: string[]; isBeta: true }
  | { available: false; reason?: string; isBeta: true };
type RiskEvaluation =
  | {
      available: true;
      segment: "thin_file" | "cmf_rich";
      headline: "traditional" | "transactional";
      traditional: Traditional;
      transactional: Transactional;
      reconciliation: { agree: boolean | null; note: string };
    }
  | { available: false; message: string };

type BandTone = "good" | "warn" | "bad";

function tradTone(label: string): BandTone {
  if (/excelente|muy bueno/i.test(label)) return "good";
  if (/bueno|regular/i.test(label)) return "warn";
  return "bad";
}
function txTone(label: string): BandTone {
  if (/excelente/i.test(label)) return "good";
  if (/bueno|regular/i.test(label)) return "warn";
  return "bad";
}
const TONE_STROKE: Record<BandTone, string> = {
  good: "stroke-emerald-500",
  warn: "stroke-amber-500",
  bad: "stroke-rose-500",
};
const TONE_TEXT: Record<BandTone, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-rose-600 dark:text-rose-400",
};
const TONE_BAR: Record<BandTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
};

/** Gauge semicircular (mismo patrón que ScoreHero). `pct` en 0..1. */
function Gauge({
  pct,
  tone,
  value,
  suffix,
}: {
  pct: number;
  tone: BandTone;
  value: number;
  suffix: string;
}) {
  const arc = 283;
  const dash = Math.min(1, Math.max(0, pct)) * arc;
  return (
    <div className="relative w-40 h-24 shrink-0">
      <svg viewBox="0 0 200 110" className="w-full h-full" fill="none" aria-hidden="true">
        <path
          d="M 10 95 A 90 90 0 0 1 190 95"
          strokeWidth="13"
          strokeLinecap="round"
          className="stroke-muted/40"
        />
        <path
          d="M 10 95 A 90 90 0 0 1 190 95"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arc}`}
          className={cn("transition-all duration-700 ease-out", TONE_STROKE[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <span className="text-3xl font-bold tabular-nums leading-none">{value}</span>
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function BetaPill() {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
      Beta
    </span>
  );
}

function Lens({
  title,
  sub,
  valueLabel,
  tone,
  pct,
  reasons,
}: {
  title: string;
  sub: string;
  valueLabel: string;
  tone: BandTone;
  pct: number;
  reasons: string[];
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {title} <span className="text-xs font-normal text-muted-foreground">{sub}</span>
        </p>
        <span className={cn("text-sm font-bold tabular-nums", TONE_TEXT[tone])}>{valueLabel}</span>
      </div>
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", TONE_BAR[tone])}
          style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
        />
      </div>
      <ul className="space-y-1">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RiskScoreCard() {
  const { data, isLoading, isError } = useQuery<RiskEvaluation>({
    queryKey: ["/api/risk/evaluation"],
    queryFn: () => apiFetch("/api/risk/evaluation"),
  });

  if (isLoading) return <Skeleton className="h-56 w-full rounded-2xl" />;

  // NUNCA fallar en silencio: si el endpoint no responde (p. ej. RISK_DUAL_SCORE_ENABLED
  // apagado en la API → 404), antes retornábamos null y la tarjeta desaparecía sin rastro,
  // indistinguible de "el flag del front está apagado". Eso costó una sesión de debug.
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Score no disponible.</span> No pudimos
            calcular tu evaluación de riesgo en este momento. Reintenta más tarde.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data.available) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{data.message}</p>
        </CardContent>
      </Card>
    );
  }

  const { headline, traditional, transactional, reconciliation } = data;
  const headlineIsTraditional = headline === "traditional";

  // Titular
  let heroTone: BandTone = "warn";
  let heroPct = 0;
  let heroValue = 0;
  let heroSuffix = "";
  let heroBand = "";
  let heroKicker = "";
  if (headlineIsTraditional && traditional.available) {
    heroTone = tradTone(traditional.band.label);
    heroPct = traditional.score / 850;
    heroValue = traditional.score;
    heroSuffix = "/ 850 · buró + CMF";
    heroBand = traditional.band.label;
    heroKicker = "Score crediticio";
  } else if (transactional.available) {
    heroTone = txTone(transactional.band);
    heroPct = transactional.score / 100;
    heroValue = transactional.score;
    heroSuffix = "/ 100 · tu cuenta bancaria";
    heroBand = transactional.band;
    heroKicker = "Score CODA";
  }

  const secondIsBeta = headlineIsTraditional; // si titular = tradicional, la 2ª opinión (transaccional) es beta

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{heroKicker}</span>
          <span className="text-xs tabular-nums text-muted-foreground/70">{heroSuffix}</span>
        </div>

        {/* Titular */}
        <div className="flex flex-wrap items-center gap-4">
          <Gauge pct={heroPct} tone={heroTone} value={heroValue} suffix="" />
          <div className="min-w-0">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold",
                heroTone === "good"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : heroTone === "warn"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
              )}
            >
              {heroBand}
              {!headlineIsTraditional && <BetaPill />}
            </span>
            {headlineIsTraditional && traditional.available && (
              <p className="mt-1.5 text-sm text-muted-foreground">{traditional.band.desc}</p>
            )}
          </div>
        </div>

        {/* Segunda opinión */}
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 p-3">
          {secondIsBeta ? (
            transactional.available ? (
              <>
                <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {transactional.score}
                </span>
                <span className="min-w-0 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Score CODA</span> · lectura de tu
                  cuenta
                </span>
                <span className="ml-auto">
                  <BetaPill />
                </span>
              </>
            ) : (
              <>
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Score CODA:</span>{" "}
                  {transactional.available === false
                    ? (transactional.reason ?? "aún no disponible")
                    : "aún no disponible"}
                </span>
                <span className="ml-auto">
                  <BetaPill />
                </span>
              </>
            )
          ) : traditional.available ? (
            <>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  TONE_TEXT[tradTone(traditional.band.label)],
                )}
              >
                {traditional.score}
              </span>
              <span className="min-w-0 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Score crediticio tradicional</span>{" "}
                · buró/CMF
              </span>
            </>
          ) : (
            <>
              <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Score tradicional:</span> aún no
                disponible — no encontramos historial en el buró.
              </span>
            </>
          )}
        </div>

        {/* Revelación progresiva */}
        <details className="group border-t pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver desglose de las dos miradas
          </summary>
          <div className="mt-2 space-y-3">
            <Lens
              title="Tradicional"
              sub="reg. logística · buró/CMF"
              valueLabel={traditional.available ? `${traditional.score}/850` : "Sin datos"}
              tone={traditional.available ? tradTone(traditional.band.label) : "warn"}
              pct={traditional.available ? traditional.score / 850 : 0}
              reasons={
                traditional.available
                  ? traditional.reasons.length
                    ? traditional.reasons.map(
                        (r) =>
                          `${r.direction === "increases_risk" ? "Sube el riesgo" : "Reduce el riesgo"}: ${r.label}`,
                      )
                    : ["Historial sin factores de riesgo relevantes."]
                  : ["Sin historial en el buró todavía — nada que controlar aún."]
              }
            />
            <Lens
              title="Transaccional CODA"
              sub="XGBoost · Berka"
              valueLabel={
                transactional.available
                  ? `${transactional.score}/100 · PD ${(transactional.pd * 100).toFixed(1)}%`
                  : "Sin datos"
              }
              tone={transactional.available ? txTone(transactional.band) : "warn"}
              pct={transactional.available ? transactional.score / 100 : 0}
              reasons={
                transactional.available
                  ? transactional.reasons.slice(0, 3).map(featureLabel)
                  : [
                      transactional.available === false
                        ? (transactional.reason ?? "Aún no hay suficientes datos.")
                        : "Aún no hay suficientes datos.",
                    ]
              }
            />
            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              {reconciliation.agree === false ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span>{reconciliation.note}</span>
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/** Traduce nombres de features del modelo Berka a lenguaje del usuario. */
function featureLabel(feature: string): string {
  const map: Record<string, string> = {
    creditPerMonth: "Frecuencia de ingresos mensuales",
    debitPerMonth: "Frecuencia de gastos mensuales",
    activeDaysShare: "Actividad regular en tu cuenta",
    topCategoryShare: "Concentración de tu gasto",
    debitCreditRatio: "Relación gasto/ingreso",
    incomeRegularity: "Regularidad de tus ingresos",
    netCashflowVolatility: "Estabilidad de tu flujo de caja",
    monthlyIncome: "Nivel de ingresos",
  };
  return map[feature] ?? feature;
}
