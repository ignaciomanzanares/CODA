import { useState } from "react";
import { ChevronDown, ScrollText, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHealthExplain, type HealthAuditStep } from "@/hooks/useHealthExplain";

/** Formatea el valor de una variable de la traza para lectura humana. */
function formatValue(step: HealthAuditStep): string {
  if (typeof step.value === "boolean") return step.value ? "Sí" : "No";
  // Ratios (deuda/flujo, deuda/activos, ahorro/ingreso) llegan como fracción 0–1+.
  const isRatio = /deuda|ahorro|flujo|activos|patrimonio/i.test(step.variable);
  if (isRatio && Math.abs(step.value) <= 5) {
    return `${Math.round(step.value * 100)}%`;
  }
  return Number.isInteger(step.value) ? String(step.value) : step.value.toFixed(1);
}

function StepRow({ step }: { step: HealthAuditStep }) {
  const contribution =
    typeof step.contribution === "number" ? Math.round(step.contribution * 10) / 10 : undefined;
  const positive = (contribution ?? 0) >= 0;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0">
      <div
        className={cn(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          step.triggered ? "bg-red-500" : "bg-muted-foreground/40",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{step.variable}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatValue(step)}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{step.note}</p>
        {(contribution !== undefined || step.cut !== undefined) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {step.cut !== undefined && (
              <span>
                Corte: <span className="tabular-nums">{step.cut}</span>
              </span>
            )}
            {typeof step.weight === "number" && (
              <span>
                Peso: <span className="tabular-nums">{Math.round(step.weight * 100)}%</span>
              </span>
            )}
            {contribution !== undefined && contribution !== 0 && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {positive ? "+" : ""}
                {contribution} pts
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * R1 — "¿Por qué este nivel?": traza auditable del motor de salud v2. Se pide
 * bajo demanda (al expandir) porque es material de transparencia/defensa
 * regulatoria, no algo que el usuario necesite ver en cada visita. No cambia el
 * score: solo explica cómo se llegó al nivel que ya se muestra arriba.
 */
export default function HealthExplainPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useHealthExplain(open);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2.5">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">¿Por qué este nivel?</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <CardContent className="border-t px-4 pb-4 pt-3">
          <p className="mb-3 text-xs leading-snug text-muted-foreground">
            Traza paso a paso de cómo el modelo llegó a tu nivel: cada variable, el corte aplicado y
            cuánto aportó al puntaje. Es el mismo cálculo que ves arriba, abierto para que puedas
            auditarlo.
          </p>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {isError && (
            <p className="text-sm text-muted-foreground">
              No pudimos cargar la explicación en este momento. Intenta nuevamente más tarde.
            </p>
          )}

          {data && !data.available && (
            <p className="text-sm text-muted-foreground">
              {data.reason ?? "Aún no hay datos suficientes para explicar tu nivel."}
            </p>
          )}

          {data?.available && data.audit && (
            <div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-1">
                {data.audit.steps.map((step, i) => (
                  <StepRow key={i} step={step} />
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {data.audit.stage === "critica"
                    ? "Zona crítica — corte directo"
                    : "Puntaje compuesto"}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {data.audit.stage === "critica"
                    ? `Nivel ${data.audit.nivel}`
                    : `${Math.round(data.audit.scoreCompuesto)} / 100 → Nivel ${data.audit.nivel}`}
                </span>
              </div>

              {data.audit.moraPenaltyApplied && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Se aplicó una penalización por mora activa sobre el nivel bruto (
                  {data.audit.nivelBruto}).
                </p>
              )}

              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Modelo auditable {data.audit.version}. Los cortes provienen de criterios propios,
                evidencia y restricciones estructurales documentadas.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
