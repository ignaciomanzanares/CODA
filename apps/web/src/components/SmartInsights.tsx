import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  PieChart,
  Repeat,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Info,
  PiggyBank,
  Lightbulb,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  type: string;
  title: string;
  body: string;
  icon: string;
}
interface InsightsData {
  insights: Insight[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  calendar: Calendar,
  "pie-chart": PieChart,
  repeat: Repeat,
  "trending-up": TrendingUp,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertCircle,
  info: Info,
  "piggy-bank": PiggyBank,
  lightbulb: Lightbulb,
  shield: Shield,
};

const TYPE_STYLES: Record<string, { bg: string; icon: string; border: string }> = {
  positive: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    icon: "text-emerald-600",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  alert: {
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "text-red-600",
    border: "border-red-200 dark:border-red-800",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-600",
    border: "border-amber-200 dark:border-amber-800",
  },
  pattern: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "text-blue-600",
    border: "border-blue-200 dark:border-blue-800",
  },
  info: {
    bg: "bg-slate-50 dark:bg-slate-800/40",
    icon: "text-slate-500",
    border: "border-slate-200 dark:border-slate-700",
  },
};

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = ICON_MAP[insight.icon] ?? Info;
  const style = TYPE_STYLES[insight.type] ?? TYPE_STYLES.info;

  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", style.bg, style.border)}>
      <div className={cn("mt-0.5 shrink-0", style.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{insight.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.body}</p>
      </div>
    </div>
  );
}

export default function SmartInsights() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["/api/transactions/insights"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession())
        return Promise.resolve({
          insights: [],
          spendingByCategory: [],
          totalEgresos: 0,
          totalIngresos: 0,
        });
      return apiFetch("/api/transactions/insights");
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const insights = data?.insights ?? [];
  if (insights.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground mb-3">Insights y consejos de ahorro</p>
        {insights.map((ins, i) => (
          <InsightCard key={i} insight={ins} />
        ))}
      </CardContent>
    </Card>
  );
}
