import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Target
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import type { Goal } from "@/types";
import { ROUTES } from "@/lib/routes";

type CreditScore = {
  utilization?: string;
  score?: number;
};

type InsuranceRisk = {
  autoRisk?: string;
};

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

export default function Plan() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("recommendations");
  
  // Get API functions from useApi hook
  const { getCreditScore, getInsuranceRisk, getFinancialGoals } = useApi();

  // Use useQuery with the correct functions
  const { data: realCreditScore, isLoading: isLoadingCreditScore } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: getCreditScore,
    enabled: isAuthenticated && !authLoading,
  });
  const { data: realInsuranceRisk, isLoading: isLoadingInsuranceRisk } = useQuery({
    queryKey: ["/api/insurance-risk"],
    queryFn: getInsuranceRisk,
    enabled: isAuthenticated && !authLoading,
  });
  const { data: realGoals, isLoading: isLoadingGoals } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
  });

  // Fetch financial summary for projections
  const { data: financialData } = useQuery<FinancialSummaryData>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
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
      return apiFetch('/api/financial-summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
  });

  // Monthly summary from real expenses (for MonthlyTracker)
  const CATEGORY_COLORS = ["#8b5cf6", "#f59e0b", "#3b82f6", "#06b6d4", "#ec4899", "#eab308", "#ef4444", "#6b7280"];
  const { data: monthlySummary } = useQuery<{
    currentMonth: { totalSpent: number; byCategory: { category: string; spent: number }[] };
    last6Months: { monthLabel: string; spent: number }[];
  }>({
    queryKey: ["/api/expenses/monthly-summary"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) throw new Error("Not authenticated");
      return apiFetch("/api/expenses/monthly-summary", { headers: { Authorization: `Bearer ${token}` } });
    },
    enabled: isAuthenticated && !authLoading,
  });

  const monthlyTrackerProps = (() => {
    const totalBudget = financialData?.summary?.monthlyIncome
      ? financialData.summary.monthlyIncome * 0.7
      : 0;
    if (!monthlySummary && !isAuthenticated) {
      return {
        totalBudget,
        totalSpent: financialData?.summary?.monthlyExpenses ?? 0,
        categoryData: undefined,
        historicalData: undefined,
      };
    }
    if (!monthlySummary) {
      return {
        totalBudget,
        totalSpent: financialData?.summary?.monthlyExpenses ?? 0,
        categoryData: undefined,
        historicalData: undefined,
      };
    }
    const { currentMonth, last6Months } = monthlySummary;
    const totalSpent = currentMonth.totalSpent;
    const categoryData = currentMonth.byCategory.map((c, i) => ({
      category: c.category,
      spent: c.spent,
      budget: Math.max(c.spent * 1.2, c.spent + 100),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
    const historicalData = last6Months.map((m) => ({
      month: m.monthLabel,
      spent: m.spent,
      budget: totalBudget,
    }));
    return {
      totalBudget,
      totalSpent,
      categoryData: categoryData.length ? categoryData : undefined,
      historicalData: historicalData.length ? historicalData : undefined,
    };
  })();

  const creditScore = isAuthenticated ? realCreditScore : undefined;
  const insuranceRisk = isAuthenticated ? realInsuranceRisk : undefined;
  const goals = isAuthenticated ? realGoals : [];

  const isLoading = authLoading || (isAuthenticated && (isLoadingCreditScore || isLoadingInsuranceRisk || isLoadingGoals));

  // Generate recommendations based on data
  const getRecommendations = () => {
    const recommendations = [];

    // Defensive: creditScore and insuranceRisk may be undefined
    const cs: CreditScore = (creditScore ?? {}) as CreditScore;
    const ir: InsuranceRisk = (insuranceRisk ?? {}) as InsuranceRisk;

    if (cs.utilization) {
      // Credit utilization recommendation
      if (cs.utilization === "Average" || cs.utilization === "Poor") {
        recommendations.push({
          id: 1,
          icon: <TrendingUp />,
          title: "Mejorar la utilización de crédito",
          description: "Tu utilización de crédito está en 35%. Reducirla por debajo del 30% podría subir tu score entre 15 y 25 puntos.",
          actionText: "Saber más",
          actionLink: ROUTES.productos,
        });
      }
    }

    if (typeof cs.score === "number") {
      // Debt consolidation recommendation
      if (cs.score < 720) {
        recommendations.push({
          id: 2,
          icon: <Landmark />,
          title: "Consolidar deuda con alto interés",
          description: "Podrías ahorrar $1.200 en intereses consolidando tu deuda de tarjetas con un crédito de consumo al 7,49%.",
          actionText: "Ver opciones",
          actionLink: `${ROUTES.productos}?category=loans`,
        });
      }
    }

    if (ir.autoRisk) {
      // Insurance recommendation
      if (ir.autoRisk === "Medium" || ir.autoRisk === "High") {
        recommendations.push({
          id: 3,
          icon: <ShieldCheck />,
          title: "Completa tu cobertura de seguros",
          description: "Según tu perfil de riesgo, un seguro de responsabilidad civil podría proteger tu patrimonio.",
          actionText: "Pedir cotizaciones",
          actionLink: `${ROUTES.productos}?category=insurance`,
        });
      }
    }

    return recommendations;
  };

  const recommendations = getRecommendations();

  // Convert goals to timeline format
  const getTimelineGoals = () => {
    if (!goals || !Array.isArray(goals)) return [];
    
    return goals.map((goal: Goal, index: number) => {
      const progress = goal.targetAmount > 0 
        ? Math.round((goal.currentAmount / goal.targetAmount) * 100) 
        : 0;
      
      // Determine status based on progress
      let status = 'not_started';
      if (progress >= 100) status = 'completed';
      else if (progress > 0) status = 'in_progress';
      
      // Determine timeframe based on target date
      let timeframe = 'now';
      if (goal.targetDate) {
        const monthsUntil = Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
        if (monthsUntil <= 3) timeframe = 'now';
        else if (monthsUntil <= 6) timeframe = 'next (3-6 months)';
        else if (monthsUntil <= 12) timeframe = '6-12 months';
        else timeframe = '1-2 years';
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
            description="Las recomendaciones y el presupuesto se calculan con tus cuentas, gastos y documentos cargados."
            actionText="Iniciar sesión"
          />
        )}
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Plan financiero</h1>
              <p className="text-muted-foreground">Sigue, presupuesta y alcanza tus metas financieras</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
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

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-6">
            <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Tu plan financiero personalizado</h2>
                    <p className="text-muted-foreground">
                      Según tu perfil financiero, hemos identificado {recommendations.length} oportunidades 
                      para optimizar tus finanzas. Seguir estas recomendaciones podría ahorrarte aproximadamente 
                      <strong className="text-foreground"> $3.600+ al año</strong>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recommendations */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Recomendaciones inteligentes
                </h3>
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    icon={rec.icon}
                    title={rec.title}
                    description={rec.description}
                    actionText={rec.actionText}
                    actionLink={rec.actionLink}
                  />
                ))}
              </div>

              {/* Financial Timeline */}
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
                        <p className="text-sm">Crea tu primera meta financiera para ver la línea de tiempo</p>
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

          {/* Monthly Budget Tab */}
          <TabsContent value="monthly" className="space-y-6">
            <MonthlyTracker
              totalBudget={monthlyTrackerProps.totalBudget}
              totalSpent={monthlyTrackerProps.totalSpent}
              categoryData={monthlyTrackerProps.categoryData}
              historicalData={monthlyTrackerProps.historicalData}
            />
          </TabsContent>

          {/* Annual Plan Tab */}
          <TabsContent value="annual" className="space-y-6">
            <AnnualProjection 
              monthlyIncome={financialData?.summary?.monthlyIncome || 7500}
              monthlyExpenses={financialData?.summary?.monthlyExpenses || 3845}
              currentSavings={financialData?.summary?.totalAssets ? financialData.summary.totalAssets * 0.1 : 16000}
              savingsGoal={50000}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
