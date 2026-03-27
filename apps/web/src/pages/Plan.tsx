import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import RecommendationCard from "@/components/RecommendationCard";
import FinancialTimeline from "@/components/FinancialTimeline";
import { MonthlyTracker, AnnualProjection } from "@/components/dashboard";
import {
  TrendingUp,
  Landmark,
  ShieldCheck,
  DollarSign,
  Calendar,
  LineChart,
  Lightbulb,
  Target,
  PiggyBank,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import type { Goal } from "@/types";
import { ROUTES } from "@/lib/routes";

interface FinancialSummaryData {
  summary: {
    totalBalance: number;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    accountCount: number;
  };
}

type PlanRecIcon =
  | "trending"
  | "landmark"
  | "shield"
  | "piggy"
  | "target"
  | "alert"
  | "wallet";

type PlanRecommendation = {
  id: string;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
  icon: PlanRecIcon;
};

function iconForPlan(icon: PlanRecIcon) {
  const className = "h-5 w-5";
  switch (icon) {
    case "trending":
      return <TrendingUp className={className} />;
    case "landmark":
      return <Landmark className={className} />;
    case "shield":
      return <ShieldCheck className={className} />;
    case "piggy":
      return <PiggyBank className={className} />;
    case "target":
      return <Target className={className} />;
    case "alert":
      return <AlertTriangle className={className} />;
    case "wallet":
    default:
      return <Wallet className={className} />;
  }
}

export default function Plan() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("recommendations");

  const { getFinancialGoals } = useApi();

  const { data: realGoals, isLoading: isLoadingGoals } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
  });

  const { data: financialData } = useQuery<FinancialSummaryData>({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        return {
          summary: {
            totalBalance: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            netWorth: 0,
            monthlyIncome: 0,
            monthlyExpenses: 0,
            savingsRate: 0,
            accountCount: 0,
          },
        };
      }
      return apiFetch("/api/financial-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
  });

  const { data: planInsights, isLoading: isLoadingPlanInsights } = useQuery<{
    recommendations: PlanRecommendation[];
    summaryBanner: string;
    hasData: boolean;
  }>({
    queryKey: ["/api/plan/insights"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) throw new Error("Not authenticated");
      return apiFetch("/api/plan/insights", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
  });

  const CATEGORY_COLORS = [
    "#8b5cf6",
    "#f59e0b",
    "#3b82f6",
    "#06b6d4",
    "#ec4899",
    "#eab308",
    "#ef4444",
    "#6b7280",
  ];
  const { data: monthlySummary } = useQuery<{
    currentMonth: { totalSpent: number; byCategory: { category: string; spent: number }[] };
    last6Months: { monthLabel: string; spent: number }[];
  }>({
    queryKey: ["/api/expenses/monthly-summary"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) throw new Error("Not authenticated");
      return apiFetch("/api/expenses/monthly-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
  });

  const monthlyTrackerProps = (() => {
    const inc = financialData?.summary?.monthlyIncome ?? 0;
    const exp = financialData?.summary?.monthlyExpenses ?? 0;
    const totalBudget = inc > 0 ? inc * 0.7 : 0;
    if (!monthlySummary && !isAuthenticated) {
      return {
        totalBudget,
        totalSpent: exp,
        categoryData: undefined,
        historicalData: undefined,
      };
    }
    if (!monthlySummary) {
      return {
        totalBudget,
        totalSpent: exp,
        categoryData: undefined,
        historicalData: undefined,
      };
    }
    const { currentMonth, last6Months } = monthlySummary;
    const totalSpent = currentMonth.totalSpent;
    const categoryData = currentMonth.byCategory.map((c, i) => ({
      category: c.category,
      spent: c.spent,
      budget: Math.max(c.spent * 1.1, Math.round(c.spent + 1)),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
    const historicalData = last6Months.map((m) => ({
      month: m.monthLabel,
      spent: m.spent,
      budget: totalBudget > 0 ? totalBudget : m.spent,
    }));
    return {
      totalBudget,
      totalSpent,
      categoryData: categoryData.length ? categoryData : undefined,
      historicalData: historicalData.length ? historicalData : undefined,
    };
  })();

  const goals = isAuthenticated ? realGoals : [];

  const isLoading =
    authLoading ||
    (isAuthenticated && (isLoadingGoals || isLoadingPlanInsights));

  const recommendations = planInsights?.recommendations ?? [];
  const summaryBanner =
    planInsights?.summaryBanner ??
    "Cargando recomendaciones con tus datos…";

  const savingsGoalPrimary =
    Array.isArray(goals) && goals.length > 0
      ? goals.reduce(
          (max, g) =>
            (g.targetAmount ?? 0) > (max?.targetAmount ?? 0) ? g : max,
          goals[0]!
        )
      : null;
  const annualSavingsGoal =
    savingsGoalPrimary && savingsGoalPrimary.targetAmount > 0
      ? savingsGoalPrimary.targetAmount
      : null;

  const getTimelineGoals = () => {
    if (!goals || !Array.isArray(goals)) return [];

    return goals.map((goal: Goal, index: number) => {
      const progress =
        goal.targetAmount > 0
          ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
          : 0;

      let status = "not_started";
      if (progress >= 100) status = "completed";
      else if (progress > 0) status = "in_progress";

      let timeframe = "now";
      if (goal.targetDate) {
        const monthsUntil = Math.ceil(
          (new Date(goal.targetDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24 * 30)
        );
        if (monthsUntil <= 3) timeframe = "now";
        else if (monthsUntil <= 6) timeframe = "next (3-6 months)";
        else if (monthsUntil <= 12) timeframe = "6-12 months";
        else timeframe = "1-2 years";
      }

      return {
        id: goal.id || index,
        name: goal.name,
        status,
        timeframe,
        progress,
      };
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para tu plan personalizado"
            description="Las recomendaciones y el presupuesto se calculan con tus cuentas, gastos registrados y documentos cargados."
            actionText="Iniciar sesión"
          />
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Plan financiero</h1>
              <p className="text-muted-foreground">
                Basado en tus datos reales (sin cifras de demostración)
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="recommendations" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Recomendaciones</span>
              <span className="sm:hidden">Tips</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Presupuesto mensual</span>
              <span className="sm:hidden">Presupuesto</span>
            </TabsTrigger>
            <TabsTrigger value="annual" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              <span className="hidden sm:inline">Plan anual</span>
              <span className="sm:hidden">Anual</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommendations" className="space-y-6">
            <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Tu plan con datos cargados</h2>
                    <div
                      className="text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: summaryBanner
                          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                          .replace(/\n/g, "<br/>"),
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Recomendaciones
                </h3>
                {isAuthenticated && recommendations.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay suficientes datos o no aplican alertas. Sigue registrando gastos y movimientos.
                  </p>
                )}
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    icon={iconForPlan(rec.icon)}
                    title={rec.title}
                    description={rec.description.replace(/\*\*(.*?)\*\*/g, "$1")}
                    actionText={rec.actionText}
                    actionLink={rec.actionLink}
                  />
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  Línea de tiempo de metas
                </h3>
                <Card>
                  <CardContent className="p-6">
                    {getTimelineGoals().length > 0 ? (
                      <FinancialTimeline goals={getTimelineGoals()} />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Aún no hay metas definidas</p>
                        <p className="text-sm">Crea una meta para ver el avance aquí</p>
                      </div>
                    )}
                    <div className="mt-6 pt-4 border-t">
                      <Link href={ROUTES.metas}>
                        <Button variant="outline" className="w-full">
                          Gestionar metas
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-6">
            <MonthlyTracker
              totalBudget={monthlyTrackerProps.totalBudget}
              totalSpent={monthlyTrackerProps.totalSpent}
              categoryData={monthlyTrackerProps.categoryData}
              historicalData={monthlyTrackerProps.historicalData}
            />
          </TabsContent>

          <TabsContent value="annual" className="space-y-6">
            <AnnualProjection
              monthlyIncome={financialData?.summary?.monthlyIncome ?? 0}
              monthlyExpenses={financialData?.summary?.monthlyExpenses ?? 0}
              currentSavings={financialData?.summary?.totalBalance ?? 0}
              savingsGoal={annualSavingsGoal}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
