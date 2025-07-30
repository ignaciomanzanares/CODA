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
    } catch (error) {
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

  const creditScore = creditAnalysis?.creditScore || 0;
  const maxScore = creditAnalysis?.maxScore || 850;
  const scorePercentage = (creditScore / maxScore) * 100;

  // Determine score color based on range
  const getScoreColor = (score: number) => {
    if (score >= 750) return "text-green-600";
    if (score >= 700) return "text-blue-600";
    if (score >= 650) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 750) return "Excellent";
    if (score >= 700) return "Good";
    if (score >= 650) return "Fair";
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

            {/* Score Factors */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg">Score Factors</h4>
              
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Payment History</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={creditAnalysis.factors.paymentHistory.status === 'Good' ? 'default' : 'secondary'}>
                      {creditAnalysis.factors.paymentHistory.status}
                    </Badge>
                    <span className="font-semibold">{creditAnalysis.factors.paymentHistory.score}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Credit Utilization</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={creditAnalysis.factors.utilization.status === 'Good' ? 'default' : 'secondary'}>
                      {creditAnalysis.factors.utilization.status}
                    </Badge>
                    <span className="font-semibold">{creditAnalysis.factors.utilization.score}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">Age of Credit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={creditAnalysis.factors.ageOfCredit.status === 'Good' ? 'default' : 'secondary'}>
                      {creditAnalysis.factors.ageOfCredit.status}
                    </Badge>
                    <span className="font-semibold">{creditAnalysis.factors.ageOfCredit.score}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {creditAnalysis.recommendations && creditAnalysis.recommendations.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-lg">Recommendations</h4>
                <div className="space-y-2">
                  {creditAnalysis.recommendations.slice(0, 3).map((rec, index) => (
                    <div key={index} className="p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                      <p className="font-medium text-blue-900">{rec.title}</p>
                      <p className="text-sm text-blue-700 mt-1">{rec.description}</p>
                      <Badge variant="outline" className="mt-2 text-xs">
                        Impact: {rec.impact}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500 text-center">
              Last updated: {new Date(creditAnalysis.lastUpdated).toLocaleString()}
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