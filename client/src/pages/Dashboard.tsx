import { useEffect } from "react";
import { useAuth, useBankConnections } from "@/lib/api";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import RailwayFinancialData from "@/components/RailwayFinancialData";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { getBankConnections } = useBankConnections();

  // Check if user has connected banks
  const { data: bankConnections, isLoading } = useQuery({
    queryKey: ["/api/bank-connections"],
    queryFn: getBankConnections,
    enabled: isAuthenticated,
  });

  // Redirect to onboarding if no bank connections are found
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
      return;
    }

    if (!isLoading && bankConnections && bankConnections.length === 0) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, bankConnections, navigate]);

  // Function to refresh all data
  const refreshAllData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bank-connections"] });
  };

  if (!isAuthenticated || isLoading) {
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

      <Tabs defaultValue="railway" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="railway">Railway API Data</TabsTrigger>
          <TabsTrigger value="local">Local Demo Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="railway" className="space-y-6">
          <RailwayFinancialData userId="demo123" />
        </TabsContent>
        
        <TabsContent value="local" className="space-y-6">
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
