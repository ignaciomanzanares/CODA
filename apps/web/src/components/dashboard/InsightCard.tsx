import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
  Shield,
  Repeat,
  PiggyBank,
  Calendar,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardInsight } from "@/types/dashboard";

const ICON_MAP: Record<string, React.ElementType> = {
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

const TYPE_STYLES = {
  positive: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5",
  warning: "border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5",
  alert: "border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5",
  info: "border-blue-200 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/5",
};

const ICON_STYLES = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  alert: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

interface InsightCardProps {
  insight: DashboardInsight;
}

export default function InsightCard({ insight }: InsightCardProps) {
  const Icon = ICON_MAP[insight.icon] ?? Lightbulb;
  const style = TYPE_STYLES[insight.type] ?? TYPE_STYLES.info;
  const iconStyle = ICON_STYLES[insight.type] ?? ICON_STYLES.info;

  return (
    <div className={cn("rounded-2xl border p-4 space-y-1", style)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconStyle)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{insight.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.body}</p>
        </div>
      </div>
    </div>
  );
}
