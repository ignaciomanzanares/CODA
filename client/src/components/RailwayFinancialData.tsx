import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, DollarSign, CreditCard, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { railwayApi, type FinancialProfile, type CreditAnalysis } from "@/lib/railwayApi";
import { useToast } from "@/hooks/use-toast";
import RailwayHealthCheck from "./RailwayHealthCheck";

interface RailwayFinancialDataProps {
  userId?: string;
}

export default function RailwayFinancialData({ userId = "demo123" }: RailwayFinancialDataProps) {
  const { toast } = useToast();

  // Fetch financial profile from Railway API
  const { data: financialProfile, isLoading: profileLoading, error: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ['railway-financial-profile', userId],
    queryFn: () => railwayApi.getFinancialProfile(userId),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch credit analysis from Railway API
  const { data: creditAnalysis, isLoading: creditLoading, error: creditError, refetch: refetchCredit } = useQuery({
    queryKey: ['railway-credit-analysis', userId],
    queryFn: () => railwayApi.getCreditAnalysis(userId),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchProfile(), refetchCredit()]);
      toast({
        title: "Data refreshed",
        description: "Financial data has been updated from Railway API",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Unable to refresh data from Railway API",
        variant: "destructive",
      });
    }
  };

  if (profileLoading || creditLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Financial Overview</h2>
          <Skeleton className="h-10 w-24" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (profileError || creditError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Financial Overview</h2>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to load financial data from Railway API. Please check your connection and try again.
            {profileError && <div className="mt-2 text-sm">Profile Error: {profileError.message}</div>}
            {creditError && <div className="mt-2 text-sm">Credit Error: {creditError.message}</div>}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RailwayHealthCheck />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Financial Overview</h2>
          <p className="text-gray-600">Data from Railway API • User ID: {userId}</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Balance</p>
                <p className="text-2xl font-bold">
                  ${financialProfile?.summary?.totalBalance?.toLocaleString() || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CreditCard className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Credit Score</p>
                <p className="text-2xl font-bold">
                  {creditAnalysis?.score ? `${creditAnalysis.score}/10` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Monthly Income</p>
                <p className="text-2xl font-bold">
                  ${financialProfile?.summary?.monthlyIncome?.toLocaleString() || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Connected Accounts</p>
                <p className="text-2xl font-bold">
                  {financialProfile?.summary?.accountsCount || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Accounts */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {financialProfile?.accounts.length ? (
              <div className="space-y-4">
                {financialProfile.accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{account.name}</p>
                        <Badge variant={account.isConnected ? "default" : "secondary"}>
                          {account.isConnected ? "Connected" : "Disconnected"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{account.bankName} • {account.type}</p>
                      <p className="text-xs text-gray-500">****{account.accountNumber?.slice(-4) || '****'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">${account.balance?.toLocaleString() || '0'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No accounts connected</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Credit Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {creditAnalysis ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600">
                    {creditAnalysis?.score || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Credit Score
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Monthly Income</span>
                    <span className="text-sm font-medium">${creditAnalysis.monthly_income?.toLocaleString() || 'N/A'}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Monthly Expenses</span>
                    <span className="text-sm font-medium">${creditAnalysis.monthly_expenses?.toLocaleString() || 'N/A'}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Savings Rate</span>
                    <span className="text-sm font-medium">{creditAnalysis.savings_rate ? `${(creditAnalysis.savings_rate * 100).toFixed(1)}%` : 'N/A'}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Max Loan Amount</span>
                    <span className="text-sm font-medium">${creditAnalysis.max_loan_amount?.toLocaleString() || 'N/A'}</span>
                  </div>
                </div>

                {creditAnalysis?.risk_factors?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Risk Factors:</h4>
                    <div className="space-y-2">
                      {creditAnalysis.risk_factors.slice(0, 3).map((factor: string, index: number) => (
                        <div key={index} className="text-sm p-2 bg-orange-50 rounded">
                          <Badge variant="outline" className="text-xs">{factor}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {creditAnalysis?.recommendation && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Recommendation:</h4>
                    <div className="text-sm p-2 bg-blue-50 rounded">
                      <p className="text-gray-600">{creditAnalysis.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Credit analysis not available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      {financialProfile?.transactions && financialProfile.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {financialProfile.transactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{transaction.description}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>{new Date(transaction.date).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-xs">{transaction.category}</Badge>
                      {transaction.merchantName && (
                        <span>• {transaction.merchantName}</span>
                      )}
                    </div>
                  </div>
                  <div className={`font-semibold ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {transaction.amount < 0 ? '-' : '+'}${Math.abs(transaction.amount).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}