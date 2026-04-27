import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

interface AvailableCardProps {
  totalIncome: number;
  totalExpenses: number;
  savingsGoal: number;
}

export default function AvailableCard({
  totalIncome,
  totalExpenses,
  savingsGoal,
}: AvailableCardProps) {
  const balance = totalIncome - totalExpenses;
  const afterGoal = balance - savingsGoal;
  const isPositive = balance >= 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Balance del período
        </p>
        <div className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          isPositive
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        )}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isPositive ? "Superávit" : "Déficit"}
        </div>
      </div>

      <p className={cn(
        "text-3xl sm:text-4xl font-bold tabular-nums leading-none",
        isPositive ? "text-foreground" : "text-red-600 dark:text-red-400",
      )}>
        {fmtCLP(balance)}
      </p>

      <div className="grid grid-cols-3 gap-2 pt-1">
        <div>
          <p className="text-[11px] text-muted-foreground">Ingresos</p>
          <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {fmtCLP(totalIncome)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Gastos</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {fmtCLP(totalExpenses)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Meta ahorro</p>
          <p className="text-sm font-semibold tabular-nums text-muted-foreground">
            {fmtCLP(savingsGoal)}
          </p>
        </div>
      </div>

      {afterGoal > 0 && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Libre después de ahorrar: {fmtCLP(afterGoal)}
        </p>
      )}
    </div>
  );
}
