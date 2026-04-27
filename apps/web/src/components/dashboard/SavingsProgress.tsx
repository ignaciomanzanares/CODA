import { cn } from "@/lib/utils";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

interface SavingsProgressProps {
  savingsNet: number;     // CLP (income - expenses)
  savingsRate: number;    // 0-100 percentage
  goalPct: number;        // 0-100 progress toward savings goal
  goalAmount: number;     // CLP target
}

export default function SavingsProgress({
  savingsNet,
  savingsRate,
  goalPct,
  goalAmount,
}: SavingsProgressProps) {
  const barColor =
    goalPct >= 100
      ? "bg-emerald-500"
      : goalPct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  const labelColor =
    goalPct >= 100
      ? "text-emerald-600 dark:text-emerald-400"
      : goalPct >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const statusText =
    goalPct >= 100
      ? "Meta alcanzada"
      : goalPct >= 50
        ? "En camino"
        : savingsNet < 0
          ? "Déficit"
          : "Por debajo de la meta";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ahorro del mes
        </p>
        <span className={cn("text-xs font-semibold", labelColor)}>{statusText}</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
            style={{ width: `${Math.min(100, Math.max(0, goalPct))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>$0</span>
          <span>Meta: {fmtCLP(goalAmount)}</span>
        </div>
      </div>

      {/* Dual metric */}
      <div className="flex items-baseline gap-4">
        <div>
          <p className={cn("text-2xl font-bold tabular-nums", savingsNet >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400")}>
            {fmtCLP(savingsNet)}
          </p>
          <p className="text-xs text-muted-foreground">Ahorro neto</p>
        </div>
        <div className="border-l border-border pl-4">
          <p className={cn("text-xl font-bold tabular-nums", savingsRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
            {savingsRate}%
          </p>
          <p className="text-xs text-muted-foreground">Tasa de ahorro</p>
        </div>
      </div>
    </div>
  );
}
