import { useState } from "react";
import { ChevronDown, Gauge, Info, AlertTriangle, Plus, Link2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCLP } from "@/lib/clp";
import { ROUTES } from "@/lib/routes";
import {
  useIncomeReconciliation,
  type IncomeSourceId,
  type SourceConfidence,
  type IncomeDiscrepancy,
} from "@/hooks/useIncomeReconciliation";

const SOURCE_LABEL: Record<IncomeSourceId, string> = {
  sii: "SII — renta declarada",
  afp: "AFP — renta imponible",
  cartola: "Cartola bancaria",
  cmf_proxy: "Estimación desde deudas (CMF)",
};

/** Nivel de confianza legible a partir del 0–1 del motor. */
function confidenceLabel(c: number): { label: string; className: string; bar: string } {
  if (c >= 0.8)
    return {
      label: "Alta",
      className: "text-emerald-700 dark:text-emerald-300",
      bar: "bg-emerald-500",
    };
  if (c >= 0.5)
    return { label: "Media", className: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500" };
  return { label: "Baja", className: "text-red-700 dark:text-red-300", bar: "bg-red-500" };
}

/**
 * Copy de cara al usuario para cada discrepancia. Reformula la salida cruda del motor a un tono
 * constructivo: nunca acusatorio (la bandera de "informalidad" NO se presenta como evasión, sino
 * como ingreso variable que conviene declarar/conectar). El `detail` técnico del backend no se
 * muestra tal cual para las banderas sensibles.
 */
function discrepancyCopy(d: IncomeDiscrepancy): { title: string; body: string } {
  switch (d.kind) {
    case "informal_income":
      return {
        title: "Tienes ingresos que no están en tus declaraciones",
        body: "Tu cartola muestra más ingreso del que figura en el SII. Puede ser ingreso variable, honorarios o boletas recientes. Tenerlo formalizado mejora tu acceso a crédito.",
      };
    case "possible_undeclared_account":
      return {
        title: "Podrías tener ingresos en otra cuenta",
        body: "Declaras más ingreso del que entra a esta cuenta. Conecta tus otras cuentas para que tu panorama quede completo.",
      };
    case "stale_source":
      return {
        title: "Una de tus fuentes está desactualizada",
        body: d.detail,
      };
    case "large_gap":
      return {
        title: "Tus fuentes de ingreso difieren",
        body: d.detail,
      };
    default:
      return { title: "Nota sobre tus ingresos", body: d.detail };
  }
}

function SourceRow({ s }: { s: SourceConfidence }) {
  const conf = confidenceLabel(s.confidence);
  const pct = Math.round(s.confidence * 100);
  return (
    <div className="py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {SOURCE_LABEL[s.source] ?? s.source}
          {s.stale && (
            <span className="ml-1.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
              · desactualizada
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatCLP(s.monthlyClp)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", conf.bar)} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn("shrink-0 text-[11px] font-medium tabular-nums", conf.className)}>
          {conf.label} · {pct}%
        </span>
      </div>
    </div>
  );
}

/**
 * D7 — "Confianza en tu ingreso": muestra el ingreso estimado, de qué fuentes sale y qué tan
 * seguros estamos, más notas constructivas. Complementa el panel R1 (que explica el nivel): aquí
 * se explica la confianza del ingreso que alimenta ese cálculo. Se pide al expandir. No cambia el
 * score. Si no hay señales válidas (chosenSource null), no se renderiza nada.
 */
export default function IncomeConfidencePanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useIncomeReconciliation(open);

  // Si ya cargó y no hay ingreso reconciliado, ocultar el panel entero (nada útil que mostrar).
  if (data && (data.chosenSource === null || data.monthlyClp <= 0)) return null;

  const soloUnaFuente = data?.confidenceBySource.length === 1;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2.5">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Confianza en tu ingreso</span>
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
            Cruzamos tus fuentes de ingreso (cartola, SII, AFP) para estimar tu ingreso mensual y
            qué tan confiable es. Mientras más fuentes conectes, mayor la confianza.
          </p>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {isError && (
            <p className="text-sm text-muted-foreground">
              No pudimos calcular la confianza de tu ingreso en este momento. Intenta nuevamente más
              tarde.
            </p>
          )}

          {data && data.chosenSource && (
            <div>
              <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Ingreso mensual estimado</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {formatCLP(data.monthlyClp)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {data.rationale}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-1">
                {data.confidenceBySource.map((s) => (
                  <SourceRow key={s.source} s={s} />
                ))}
              </div>

              {soloUnaFuente && (
                <Link
                  href={ROUTES.conectarDatos}
                  className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Sube la confianza conectando más fuentes
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Con solo una fuente la estimación es aproximada. Conecta el SII o tu AFP para
                      afinarla.
                    </span>
                  </span>
                  <Link2 className="h-4 w-4 shrink-0 text-primary" />
                </Link>
              )}

              {data.discrepancies.length > 0 && (
                <div className="mt-3 space-y-2">
                  {data.discrepancies.map((d, i) => {
                    const copy = discrepancyCopy(d);
                    const warn = d.severity === "warn";
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                          warn
                            ? "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
                            : "border-border bg-muted/30",
                        )}
                      >
                        {warn ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{copy.title}</p>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                            {copy.body}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
