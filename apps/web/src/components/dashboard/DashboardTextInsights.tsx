import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Info,
  Shield,
  Repeat,
  PiggyBank,
  Calendar,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";

interface Insight {
  type: "positive" | "warning" | "alert" | "info";
  text: string;
}

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
  notation: "compact",
});

function buildInsights(data: DashboardData): Insight[] {
  const out: Insight[] = [];
  const { totalIncome, totalExpenses, savingsNet, savingsRate, categoryGroups } = data;
  const SAVINGS_GOAL = 20;

  // 1. Income vs expenses
  if (totalIncome > 0 && totalExpenses > totalIncome) {
    out.push({
      type: "alert",
      text: `Tus egresos superan tus ingresos en ${CLP.format(totalExpenses - totalIncome)} este período.`,
    });
  }

  // 2. Savings rate vs goal
  if (totalIncome > 0) {
    const diff = savingsRate - SAVINGS_GOAL;
    if (diff >= 0) {
      out.push({
        type: "positive",
        text: `Tu tasa de ahorro fue ${savingsRate}% — ${diff > 0 ? diff + " puntos sobre" : "justo en"} tu meta del ${SAVINGS_GOAL}%.`,
      });
    } else if (savingsRate < 0) {
      out.push({
        type: "alert",
        text: `Tu tasa de ahorro fue ${savingsRate}% en el período. Prioriza reducir el déficit antes de invertir o tomar productos de ahorro.`,
      });
    } else if (diff >= -10) {
      out.push({
        type: "warning",
        text: `Tu tasa de ahorro fue ${savingsRate}%, a ${Math.abs(diff)} puntos de tu meta del ${SAVINGS_GOAL}%.`,
      });
    } else {
      out.push({
        type: "alert",
        text: `Tu tasa de ahorro fue ${savingsRate}% (meta: ${SAVINGS_GOAL}%). Reducir gastos variables puede ayudar.`,
      });
    }
  }

  // 3. Top spending category and mom change
  const expenseGroups = categoryGroups
    .filter((g) => g.key !== "ingresos" && g.total > 0)
    .sort((a, b) => b.total - a.total);

  if (expenseGroups.length > 0 && totalExpenses > 0) {
    const top = expenseGroups[0];
    const pct = Math.round((top.total / totalExpenses) * 100);
    const prev = top.prevMonthTotal;
    // "Gastos Financieros" puede incluir transferencias/pagos entre cuentas propias
    // pendientes de reclasificar → suavizar el copy y pedir revisión, sin afirmar de más.
    const isFinanciero = top.key === "financieros";
    const concentraText = isFinanciero
      ? `Revisa la categoría ${top.label}: concentra cerca del ${pct}% de tus egresos (${CLP.format(top.total)}). Verifica que no incluya pagos o transferencias entre tus propias cuentas.`
      : `${top.label} concentra el ${pct}% de tus egresos (${CLP.format(top.total)}).`;

    if (prev !== null && prev > 0) {
      const change = Math.round(((top.total - prev) / prev) * 100);
      if (Math.abs(change) >= 10 && !isFinanciero) {
        out.push({
          type: change > 0 ? "warning" : "positive",
          text: `${top.label}: ${CLP.format(top.total)} — ${change > 0 ? "+" : ""}${change}% versus el mes anterior.`,
        });
      } else {
        out.push({ type: "info", text: concentraText });
      }
    } else {
      out.push({ type: "info", text: concentraText });
    }
  }

  // 4. Second-biggest category mom change (if different direction from top)
  if (expenseGroups.length > 1) {
    const second = expenseGroups[1];
    const prev = second.prevMonthTotal;
    if (prev !== null && prev > 0) {
      const change = Math.round(((second.total - prev) / prev) * 100);
      if (Math.abs(change) >= 20) {
        out.push({
          type: change > 0 ? "warning" : "positive",
          text: `${second.label} ${change > 0 ? "subió" : "bajó"} un ${Math.abs(change)}% vs el mes pasado.`,
        });
      }
    }
  }

  // 5. Net savings message
  if (totalIncome > 0 && savingsNet > 0) {
    out.push({
      type: "positive",
      text: `Saldo positivo de ${CLP.format(savingsNet)} — buen trabajo manteniendo el control.`,
    });
  }

  return out.slice(0, 3);
}

const ICON_MAP = {
  positive: CheckCircle2,
  warning: TrendingDown,
  alert: AlertTriangle,
  info: Lightbulb,
};

// Iconos del "insight del día" (backend manda el nombre como string).
const DAILY_ICON_MAP: Record<string, React.ElementType> = {
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertCircle,
  info: Info,
  lightbulb: Lightbulb,
  shield: Shield,
  repeat: Repeat,
  "piggy-bank": PiggyBank,
  calendar: Calendar,
  "pie-chart": PieChart,
};

const COLOR_MAP = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  alert: "text-red-500 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

/**
 * Una sola card "Observaciones del período": filas con icono de color en vez
 * de una franja de fondo verde/azul/amarillo/rojo por insight (parecían
 * alertas de sistema). Integra el "insight del día" como última fila — antes
 * era una cuarta franja aparte (InsightCard).
 */
export default function DashboardTextInsights({ data }: { data: DashboardData }) {
  if (!data.hasData || data.totalIncome === 0) return null;

  const insights = buildInsights(data);
  const daily = data.insight;
  if (insights.length === 0 && !daily) return null;

  const DailyIcon = daily ? (DAILY_ICON_MAP[daily.icon] ?? Lightbulb) : null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <p className="px-4 pt-3.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Observaciones del período
      </p>
      <div className="divide-y divide-border/60">
        {insights.map((ins, i) => {
          const Icon = ICON_MAP[ins.type];
          return (
            <div key={i} className="flex items-start gap-2.5 px-4 py-3">
              <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", COLOR_MAP[ins.type])} />
              <p className="text-sm leading-snug text-foreground">{ins.text}</p>
            </div>
          );
        })}
        {daily && DailyIcon && (
          <div className="flex items-start gap-2.5 px-4 py-3">
            <DailyIcon
              className={cn("h-4 w-4 shrink-0 mt-0.5", COLOR_MAP[daily.type] ?? COLOR_MAP.info)}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-foreground">{daily.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{daily.body}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
