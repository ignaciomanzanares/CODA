import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api.tsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import RecommendationCard from "@/components/RecommendationCard";
import FinancialTimeline from "@/components/FinancialTimeline";
import { TrendingUp, Landmark, ShieldCheck, Home, DollarSign, GraduationCap } from "lucide-react";
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

export default function Plan() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
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
          description: "Based on your profile, we recommend increasing your auto insurance coverage to reduce your risk level.",
          actionText: "Review Insurance",
          actionLink: "/products?category=insurance",
        });
      }
    }

    // Add more personalized recommendations based on goals
    if (goals && goals.length > 0) {
      const homeGoal = goals.find((goal: Goal) => goal.category === "home");
      if (homeGoal) {
        recommendations.push({
          id: 4,
          icon: <Home />,
          title: "Save for Home Down Payment",
          description: `You're ${Math.round((homeGoal.currentAmount / homeGoal.targetAmount) * 100)}% towards your home down payment. Consider a high-yield savings account to reach your goal faster.`,
          actionText: "Explore Savings Options",
          actionLink: "/products?category=savings",
        });
      }

      // Check for retirement goal
      const retirementGoal = goals.find((goal: Goal) => goal.category === "retirement");
      if (!retirementGoal) {
        recommendations.push({
          id: 5,
          icon: <DollarSign />,
          title: "Start Retirement Planning",
          description: "You don't have a retirement savings goal yet. We recommend saving at least 15% of your income for retirement.",
          actionText: "Create Retirement Goal",
          actionLink: "/goals",
        });
      }

      // Check for education goal
      const educationGoal = goals.find((goal: Goal) => goal.category === "education");
      if (educationGoal) {
        recommendations.push({
          id: 6,
          icon: <GraduationCap />,
          title: "Education Savings Strategy",
          description: "Consider a 529 plan or education savings account for tax advantages when saving for education.",
          actionText: "Learn More",
          actionLink: "/products?category=savings",
        });
      }
    }

    return recommendations;
  };

  // Get goals for timeline
  const getTimelineGoals = () => {
    if (!goals || goals.length === 0) return [];

    return goals.map((goal: Goal) => {
      const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
      let status = "not_started";
      
      if (progress >= 100) {
        status = "completed";
      } else if (progress > 0) {
        status = "in_progress";
      }
      
      // Calculate months until target date
      const today = new Date();
      const targetDate = new Date(goal.targetDate);
      const monthsDiff = (targetDate.getFullYear() - today.getFullYear()) * 12 + 
                          (targetDate.getMonth() - today.getMonth());
      
      let timeframe = "now";
      
      if (monthsDiff > 24) {
        timeframe = "1-2 years";
      } else if (monthsDiff > 12) {
        timeframe = "6-12 months";
      } else if (monthsDiff > 6) {
        timeframe = "next (3-6 months)";
      } else {
        timeframe = "now";
      }
      
      return {
        ...goal,
        status,
        timeframe,
        progress
      };
    }).sort((a: Goal & { timeframe: string }, b: Goal & { timeframe: string }) => {
      // Sort by timeframe (now first, then next, etc.)
      const timeOrder = { "now": 0, "next (3-6 months)": 1, "6-12 months": 2, "1-2 years": 3 };
      return timeOrder[a.timeframe as keyof typeof timeOrder] - timeOrder[b.timeframe as keyof typeof timeOrder];
    });
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  const recommendations = getRecommendations();
  const timelineGoals = getTimelineGoals();

  return (
    <div id="plan-section" className="container py-8 space-y-6">
      {!isAuthenticated && (
        <SignInBanner 
          title="Viewing Demo Financial Plan"
          description="You're exploring a sample financial plan with personalized recommendations and timeline. Sign in to get real recommendations based on your financial profile, goals, and credit data."
          actionText="Sign In for Personal Planning"
        />
      )}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 font-sans">Your Financial Plan</h2>
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h3 className="text-lg font-bold mb-4 font-sans">Recommendations</h3>
            
            <div className="space-y-4">
              {recommendations.length > 0 ? (
                recommendations.map((recommendation) => (
                  <RecommendationCard
                    key={recommendation.id}
                    icon={recommendation.icon}
                    title={recommendation.title}
                    description={recommendation.description}
                    actionText={recommendation.actionText}
                    actionLink={recommendation.actionLink}
                  />
                ))
              ) : (
                <Card className="p-6 text-center">
                  <p className="text-gray-500">
                    Connect more financial accounts to get personalized recommendations.
                  </p>
                  <Link href="/">
                    <Button className="mt-4" disabled={!isAuthenticated}>Connect Accounts</Button>
                  </Link>
                </Card>
              )}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-bold mb-4 font-sans">Financial Timeline</h3>
            
            <Card className="border border-gray-200 rounded-lg">
              <CardContent className="p-4">
                {timelineGoals.length > 0 ? (
                  <FinancialTimeline goals={timelineGoals} />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">
                      You haven&apos;t set any financial goals yet.
                    </p>
                    <Link href="/goals">
                      <Button disabled={!isAuthenticated}>Create Goals</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Link href="/goals">
              <Button className="mt-4 w-full" disabled={!isAuthenticated}>
                Customize Timeline
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}