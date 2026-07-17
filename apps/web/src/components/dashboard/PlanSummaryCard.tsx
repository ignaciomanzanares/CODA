import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Target, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/api";
import { apiFetch } from "@/lib/apiFetch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { Goal } from "@/types";

// Subset del payload de /api/financial-summary que usa este tile (la misma
// queryKey la puebla useDashboardData con el payload completo).
interface FinancialSummary {
  summary?: {
    monthlyIncome?: number;
    monthlyExpenses?: number;
    savingsRate?: number;
  };
}

// Helpers locales (mismos que Plan.tsx; no se importan desde la página lazy
// para no arrastrar su chunk al bundle del dashboard).
const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function CardChrome({ children }: { children: React.ReactNode }) {
  return (
    <Link href={ROUTES.plan} className="block">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3 transition-colors hover:border-primary/30">
        {children}
      </div>
    </Link>
  );
}

function Header({ chip }: { chip?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Target className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Plan Financiero
        </p>
      </div>
      {chip}
    </div>
  );
}

function FooterLink() {
  return (
    <p className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
      Ver plan completo
      <ChevronRight className="h-3.5 w-3.5" />
    </p>
  );
}

function GoalsRow({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Sin metas aún — define tu primera meta de ahorro.
      </p>
    );
  }

  const completed = goals.filter((g) => g.currentAmount >= g.targetAmount).length;
  const topGoal = goals
    .filter((g) => g.currentAmount < g.targetAmount)
    .sort((a, b) => pct(b.currentAmount, b.targetAmount) - pct(a.currentAmount, a.targetAmount))[0];

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {completed} de {goals.length} {goals.length === 1 ? "meta completada" : "metas completadas"}
      </p>
      {topGoal && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-foreground truncate">{topGoal.name}</p>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {pct(topGoal.currentAmount, topGoal.targetAmount)}%
            </span>
          </div>
          <Progress value={pct(topGoal.currentAmount, topGoal.targetAmount)} className="h-1.5" />
        </div>
      )}
    </div>
  );
}

/**
 * Tile compacto del panel con la distribución 50/30/20 y el avance de metas.
 * Toda la card navega a /plan; comparte cache con useDashboardData
 * (["financial-summary"]) y con la página Plan (["/api/financial-goals"]).
 */
export default function PlanSummaryCard() {
  const { getFinancialGoals } = useApi();

  const summaryQuery = useQuery<FinancialSummary | null>({
    queryKey: ["financial-summary"],
    queryFn: () => apiFetch("/api/financial-summary") as Promise<FinancialSummary>,
    staleTime: 60_000,
  });

  const goalsQuery = useQuery<Goal[]>({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    staleTime: 60_000,
  });

  if (summaryQuery.isLoading || goalsQuery.isLoading) {
    return <Skeleton className="h-[150px] rounded-2xl" />;
  }

  const income = summaryQuery.data?.summary?.monthlyIncome ?? 0;
  const expenses = summaryQuery.data?.summary?.monthlyExpenses ?? 0;
  const goals = goalsQuery.data ?? [];

  // El panel no debe degradarse si ambas fuentes fallan.
  if (summaryQuery.isError && goalsQuery.isError) return null;

  if (income <= 0 && goals.length === 0) {
    return (
      <CardChrome>
        <Header />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sube la cartola de la cuenta donde recibes tus ingresos (corriente o vista) para armar tu
          plan 50/30/20 — las tarjetas solo aportan gastos.
        </p>
        <FooterLink />
      </CardChrome>
    );
  }

  // Misma matemática que Plan.tsx: sin datos categorizados, el gasto se reparte
  // 60/40 entre necesidades y gustos como aproximación.
  const savings = Math.max(0, income - expenses);
  const needsPct = pct(expenses * 0.6, income);
  const wantsPct = pct(expenses * 0.4, income);
  const savingsPct = pct(savings, income);

  return (
    <CardChrome>
      <Header
        chip={
          income > 0 ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                savingsPct >= 20
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : savingsPct >= 10
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
              )}
            >
              Ahorro {savingsPct}%
            </span>
          ) : undefined
        }
      />

      {income > 0 && (
        <div className="space-y-1.5">
          {/* Mini barra 50/30/20 apilada (mismos colores que Plan.tsx) */}
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            <div
              className="bg-blue-500 transition-all duration-700"
              style={{ width: `${Math.min(needsPct, 100)}%` }}
              title={`Necesidades ${needsPct}%`}
            />
            <div
              className="bg-violet-400 transition-all duration-700"
              style={{ width: `${Math.min(wantsPct, 100)}%` }}
              title={`Gustos ${wantsPct}%`}
            />
            <div
              className="bg-emerald-400 transition-all duration-700 flex-1"
              style={{ minWidth: savingsPct > 0 ? `${Math.min(savingsPct, 100)}%` : "2px" }}
              title={`Ahorro ${savingsPct}%`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="text-blue-600 dark:text-blue-400">Necesidades</span>
            {" · "}
            <span className="text-violet-600 dark:text-violet-400">Gustos</span>
            {" · "}
            <span className="text-emerald-600 dark:text-emerald-400">Ahorro</span> (meta 20%)
          </p>
          <p className="text-[11px] text-muted-foreground">Ingreso mensual: {CLP.format(income)}</p>
        </div>
      )}

      {!goalsQuery.isError && <GoalsRow goals={goals} />}

      <FooterLink />
    </CardChrome>
  );
}
