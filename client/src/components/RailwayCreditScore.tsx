import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { railwayApi } from "@/lib/railwayApi";
import { useToast } from "@/hooks/use-toast";

interface RailwayCreditScoreProps {
  userId?: string;
}

export default function RailwayCreditScore({ userId = "demo123" }: RailwayCreditScoreProps) {
  const { toast } = useToast();

  const { data: creditAnalysis, isLoading, error, refetch } = useQuery({
    queryKey: ['railway-credit-score', userId],
    queryFn: () => railwayApi.getCreditAnalysis(userId),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Credit score refreshed",
        description: "Latest credit analysis loaded from Railway API",
      });
    } catch {
      toast({
        title: "Refresh failed",
        description: "Unable to refresh credit score from Railway API",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Credit Score Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center">
              <Skeleton className="h-16 w-24 mx-auto mb-2" />
              <Skeleton className="h-4 w-32 mx-auto" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Credit Score Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Unable to load credit score from Railway API</span>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const creditScore = creditAnalysis?.score || 0;
  const maxScore = 10; // Based on your API, score seems to be out of 10
  const scorePercentage = (creditScore / maxScore) * 100;

  // Determine score color based on range (0-10 scale)
  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-blue-600";
    if (score >= 4) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 8) return "Excellent";
    if (score >= 6) return "Good";
    if (score >= 4) return "Fair";
    return "Poor";
  };

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Credit Score Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Railway API
            </Badge>
            <Button onClick={handleRefresh} variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {creditAnalysis ? (
          <div className="space-y-6">
            {/* Main Credit Score Display */}
            <div className="text-center space-y-2">
              <div className={`text-6xl font-bold ${getScoreColor(creditScore)}`}>
                {creditScore}
              </div>
              <div className="text-lg text-gray-600">
                out of {maxScore} • {getScoreLabel(creditScore)}
              </div>
              <Progress value={scorePercentage} className="w-full max-w-md mx-auto h-3" />
            </div>

            {/* Financial Metrics */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg">Financial Analysis</h4>
              
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Monthly Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">${creditAnalysis.monthly_income.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Monthly Expenses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">${creditAnalysis.monthly_expenses.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">Savings Rate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      {(creditAnalysis.savings_rate * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-yellow-600" />
                    <span className="font-medium">Debt Ratio</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={creditAnalysis.debt_ratio === 0 ? "default" : "destructive"}>
                      {(creditAnalysis.debt_ratio * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Insights & Recommendations */}
            <div className="space-y-3">
              <h4 className="font-semibold text-lg">AI Insights</h4>
              
              <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-blue-900">Loan Recommendation</p>
                  <Badge variant={creditAnalysis.recommendation === 'approve' ? 'default' : 'destructive'}>
                    {creditAnalysis.recommendation.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-blue-700">
                  Maximum recommended loan amount: ${creditAnalysis.max_loan_amount.toLocaleString()}
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Income stability: {creditAnalysis.insights.income_stability}
                </p>
              </div>

              {creditAnalysis.insights.spending_patterns.length > 0 && (
                <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <p className="font-medium text-yellow-900">Spending Patterns</p>
                  <ul className="text-sm text-yellow-700 mt-1">
                    {creditAnalysis.insights.spending_patterns.map((pattern, index) => (
                      <li key={index}>• {pattern}</li>
                    ))}
                  </ul>
                </div>
              )}

              {creditAnalysis.risk_factors.length > 0 && (
                <div className="p-3 bg-red-50 border-l-4 border-red-400 rounded">
                  <p className="font-medium text-red-900">Risk Factors</p>
                  <ul className="text-sm text-red-700 mt-1">
                    {creditAnalysis.risk_factors.map((factor, index) => (
                      <li key={index}>• {factor}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 text-center">
              Data from Railway API • User: {creditAnalysis.user_id}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No credit analysis data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}