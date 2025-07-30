import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, CheckCircle2, TrendingUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { railwayApi } from "@/lib/railwayApi";

interface BankConnectionCardProps {
  bankName: string;
  bankLogo?: React.ReactNode;
  description?: string;
}

export default function BankConnectionCard({
  bankName,
  bankLogo,
  description = "Connect to showcase WeGroup credit analysis engine.",
}: BankConnectionCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [creditAnalysis, setCreditAnalysis] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for connecting directly to WeGroup Railway API
  const connectToWeGroupMutation = useMutation({
    mutationFn: async () => {
      // Call your WeGroup Railway API directly
      const analysis = await railwayApi.getCreditAnalysis("testuser");
      return analysis;
    },
    onSuccess: (data) => {
      setIsConnected(true);
      setCreditAnalysis(data);
      setIsDialogOpen(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['railway-credit-score'] });
      queryClient.invalidateQueries({ queryKey: ['railway-financial-profile'] });
      
      toast({
        title: "WeGroup Analysis Complete",
        description: `Credit analysis completed. Score: ${data.score}/10 - ${data.recommendation.toUpperCase()}`,
      });
    },
    onError: (error) => {
      console.error("WeGroup connection failed:", error);
      toast({
        title: "Connection failed",
        description: "Could not connect to WeGroup Railway API. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConnect = () => {
    connectToWeGroupMutation.mutate();
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center mb-2">
          {bankLogo || <Building2 className="h-8 w-8 text-blue-600" />}
        </div>
        <CardTitle className="text-lg">{bankName}</CardTitle>
        <p className="text-sm text-gray-600">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && creditAnalysis ? (
          // Show connected state with credit analysis preview
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <Badge variant="default">Connected</Badge>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg border">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-800">WeGroup Analysis</span>
              </div>
              <div className="text-2xl font-bold text-green-700">
                {creditAnalysis.score}/10
              </div>
              <div className="text-sm text-green-600 uppercase font-medium">
                {creditAnalysis.recommendation}
              </div>
              <div className="text-xs text-green-600 mt-1">
                Max Loan: ${creditAnalysis.max_loan_amount.toLocaleString()}
              </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  View Full Analysis
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>WeGroup Credit Analysis</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600">
                      {creditAnalysis.score}/10
                    </div>
                    <div className="text-lg font-semibold text-gray-700">
                      {creditAnalysis.recommendation.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Monthly Income:</span>
                      <span className="font-semibold">${creditAnalysis.monthly_income.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Monthly Expenses:</span>
                      <span className="font-semibold">${creditAnalysis.monthly_expenses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Savings Rate:</span>
                      <span className="font-semibold">{(creditAnalysis.savings_rate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Max Loan Amount:</span>
                      <span className="font-semibold text-green-600">${creditAnalysis.max_loan_amount.toLocaleString()}</span>
                    </div>
                  </div>

                  {creditAnalysis.insights.spending_patterns.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Spending Patterns:</h4>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {creditAnalysis.insights.spending_patterns.map((pattern: string, index: number) => (
                          <li key={index}>• {pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          // Show connect button
          <div className="space-y-3">
            <Button 
              onClick={handleConnect} 
              className="w-full" 
              disabled={connectToWeGroupMutation.isPending}
            >
              {connectToWeGroupMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing with WeGroup...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Connect & Analyze
                </>
              )}
            </Button>
            
            <div className="text-xs text-center text-gray-500">
              No login required - Direct API demonstration
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}