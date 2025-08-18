import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import RailwayFinancialData from "@/components/RailwayFinancialData";
import RailwayCreditScore from "@/components/RailwayCreditScore";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useApi } from "@/lib/api"; // <-- Import useApi

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const [, navigate] = useLocation();
  const { getBankConnections } = useApi(); // <-- Get API function

  // Only fetch bank connections if authenticated and not loading
  const { data: bankConnections, isLoading: bankLoading } = useQuery({
    queryKey: ["/api/bank-connections"],
    queryFn: getBankConnections, // <-- Use correct API function
    enabled: isAuthenticated && !authLoading,
  });

  // Redirect to onboarding if no bank connections are found
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/");
      return;
    }
    if (!bankLoading && bankConnections && bankConnections.length === 0) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, bankLoading, bankConnections, navigate]);

  // Function to refresh all data
  const refreshAllData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bank-connections"] });
  };

  if (authLoading || bankLoading || !isAuthenticated) {
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
          <RailwayCreditScore userId="demo123" />
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