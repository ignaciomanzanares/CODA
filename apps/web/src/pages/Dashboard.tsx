import { useAuth } from "@/lib/auth";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import PDOverview from "@/components/PDOverview";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Dashboard() {
  const { isLoading: authLoading, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Function to refresh all data
  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/bank-connections"] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Show loading only while determining auth state
  if (authLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Dashboard</h1>
          <p className="text-muted-foreground">
            {user ? `Welcome back, ${user.name || user.email}` : 'Your financial health overview'}
          </p>
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={refreshAllData}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        <DemoOpenBanking />
        <PDOverview />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CreditScoreCard />
          <InsuranceRiskCard />
          <FinancialGoalsCard />
        </div>
      </div>
    </div>
  );
}