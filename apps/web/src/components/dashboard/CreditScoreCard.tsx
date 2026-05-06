import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ShieldCheck, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CreditScoreCardProps {
  score: number;             // 0-850
  delta: number | null;
  lastUpdated: string | null; // ISO date
}

function scoreLabel(score: number): string {
  if (score >= 700) return "Excelente";
  if (score >= 600) return "Bueno";
  if (score >= 500) return "Regular";
  return "Bajo";
}

function scoreColor(score: number): string {
  if (score >= 700) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 600) return "text-blue-600 dark:text-blue-400";
  if (score >= 500) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(score: number): string {
  if (score >= 700) return "bg-emerald-500";
  if (score >= 600) return "bg-blue-500";
  if (score >= 500) return "bg-amber-500";
  return "bg-red-500";
}

/**
 * Compact horizontal card showing the user's credit score (CMF, 0-850).
 * Only rendered when the user has credit score data.
 */
export default function CreditScoreCard({
  score,
  delta,
  lastUpdated,
}: CreditScoreCardProps) {
  const pct = Math.min(100, Math.round((score / 850) * 100));

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Score Crediticio
          </p>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  <Info className="h-3.5 w-3.5" />
                  <span className="sr-only">Más información sobre el Score Crediticio</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                Basado en tu Informe de Deudas de la CMF. Refleja tu historial crediticio formal: deudas vigentes, morosidad y cantidad de acreedores. Escala de 0 a 850.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {delta !== null && delta !== 0 && (
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              delta > 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta > 0 ? "+" : ""}
            {delta}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", scoreColor(score))}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 850</span>
        <span className={cn("text-xs font-medium", scoreColor(score))}>
          {scoreLabel(score)}
        </span>
      </div>

      {/* Mini progress bar */}
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor(score))}
          style={{ width: `${pct}%` }}
        />
      </div>

      {updatedLabel && (
        <p className="text-[11px] text-muted-foreground">
          Última actualización: {updatedLabel}
        </p>
      )}
    </div>
  );
}
