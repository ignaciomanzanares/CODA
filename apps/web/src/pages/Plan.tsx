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
  Home, 
  DollarSign, 
  GraduationCap,
  Calendar,
  LineChart,
  Lightbulb,
  Target
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { generateDemoCreditScore, generateDemoInsuranceRisk, generateDemoFinancialGoals } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import type { Goal } from "@/types";

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

  // Use demo data when not authenticated, real data when authenticated
  const demoCreditScore = generateDemoCreditScore();
  const demoInsuranceRisk = generateDemoInsuranceRisk();
  const demoGoals = generateDemoFinancialGoals();

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
      try {
        const token = localStorage.getItem('jwt_token');
        if (token) {
          const data = await apiFetch('/api/financial-summary', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (data.summary?.accountCount > 0) {
            return data;
          }
        }
      } catch {
        // Fall through to demo data
      }
      return await apiFetch('/api/financial-summary/demo');
    },
  });
  
  const creditScore = isAuthenticated ? realCreditScore : demoCreditScore;
  const insuranceRisk = isAuthenticated ? realInsuranceRisk : demoInsuranceRisk;
  const goals = isAuthenticated ? realGoals : demoGoals;

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
          title: "Improve Credit Utilization",
          description: "Your credit utilization is at 35%. Reducing it below 30% could boost your score by 15-25 points.",
          actionText: "Learn More",
          actionLink: "/products",
        });
      }
    }

    if (typeof cs.score === "number") {
      // Debt consolidation recommendation
      if (cs.score < 720) {
        recommendations.push({
          id: 2,
          icon: <Landmark />,
          title: "Consolidate High-Interest Debt",
          description: "We found you could save $1,200 in interest by consolidating your credit card debt with a 7.49% personal loan.",
          actionText: "See Options",
          actionLink: "/products?category=loans",
        });
      }
    }

    if (ir.autoRisk) {
      // Insurance recommendation
      if (ir.autoRisk === "Medium" || ir.autoRisk === "High") {
        recommendations.push({
          id: 3,
          icon: <ShieldCheck />,
          title: "Complete Your Insurance Coverage",
          description: "Based on your risk profile, adding umbrella insurance could protect your growing assets.",
          actionText: "Get Quotes",
          actionLink: "/products?category=insurance",
        });
      }
    }

    // General recommendations
    recommendations.push({
      id: 4,
      icon: <Home />,
      title: "Explore First-Time Buyer Programs",
      description: "Based on your income and credit, you may qualify for programs with 3% down payment and lower rates.",
      actionText: "Check Eligibility",
      actionLink: "/products?category=mortgage",
    });

    recommendations.push({
      id: 5,
      icon: <GraduationCap />,
      title: "Optimize Student Loan Repayment",
      description: "Refinancing at current rates could save you $2,400 over the life of your loans.",
      actionText: "Compare Rates",
      actionLink: "/products?category=loans",
    });

    return recommendations;
  };

  const recommendations = getRecommendations();

  // Convert goals to timeline format
  const getTimelineItems = () => {
    if (!goals || !Array.isArray(goals)) return [];
    
    return goals.map((goal: Goal) => ({
      title: goal.name,
      target: `$${goal.targetAmount.toLocaleString()}`,
      progress: Math.round((goal.currentAmount / goal.targetAmount) * 100),
      date: goal.targetDate ? new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'No date',
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container py-8 space-y-6">
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
      <div className="container py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner 
            title="Viewing Demo Financial Plan"
            description="You're seeing sample data. Sign in to get personalized recommendations based on your actual financial situation."
            actionText="Sign In for Personalized Plan"
          />
        )}
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Financial Plan</h1>
              <p className="text-muted-foreground">Track, budget, and reach your financial goals</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="recommendations" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Recommendations</span>
              <span className="sm:hidden">Tips</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Monthly Budget</span>
              <span className="sm:hidden">Budget</span>
            </TabsTrigger>
            <TabsTrigger value="annual" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              <span className="hidden sm:inline">Annual Plan</span>
              <span className="sm:hidden">Annual</span>
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
                    <h2 className="text-xl font-semibold mb-2">Your Personalized Financial Plan</h2>
                    <p className="text-muted-foreground">
                      Based on your financial profile, we've identified {recommendations.length} opportunities 
                      to optimize your finances. Following these recommendations could save you an estimated 
                      <strong className="text-foreground"> $3,600+ per year</strong>.
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
                  Smart Recommendations
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
                  Goals Timeline
                </h3>
                <Card>
                  <CardContent className="p-6">
                    <FinancialTimeline items={getTimelineItems()} />
                    <div className="mt-6 pt-4 border-t">
                      <Link href="/goals">
                        <Button variant="outline" className="w-full">
                          Manage Goals
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
              totalBudget={financialData?.summary?.monthlyIncome ? financialData.summary.monthlyIncome * 0.7 : 5000}
              totalSpent={financialData?.summary?.monthlyExpenses || 3845}
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
