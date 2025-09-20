import { useAuth0 } from "@auth0/auth0-react";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import DemoPDCard from "@/components/DemoPDCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { isLoading: authLoading } = useAuth0();
  
  // For now, let's make the dashboard work without requiring authentication
  // This fixes the infinite loading issue

  // Function to refresh all data
  const refreshAllData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bank-connections"] });
  };

  // Show loading only while Auth0 is determining auth state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 font-sans">Your Financial Health</h2>
        <Button 
          variant="ghost" 
          size="sm"
          className="text-gray-500 hover:text-primary flex items-center"
          onClick={refreshAllData}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          <span className="text-sm">Update</span>
        </Button>
      </div>

      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid w-full grid-cols-1 mb-6">
          <TabsTrigger value="local">Local Demo Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="local" className="space-y-6">
          <DemoOpenBanking />
          <DemoPDCard />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CreditScoreCard />
            <InsuranceRiskCard />
            <FinancialGoalsCard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}