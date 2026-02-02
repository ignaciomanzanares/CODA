import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from '@/lib/api';
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useLocation } from "wouter";

// Existing components
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import PDOverview from "@/components/PDOverview";

// New dashboard components
import {
  NetWorthChart,
  CashFlowChart,
  AccountBreakdown,
  SpendingBreakdown,
  FinancialSummaryStats,
} from "@/components/dashboard";

// UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Icons
import { 
  RefreshCw, 
  Wallet, 
  CreditCard, 
  PiggyBank,
  Sparkles,
  Shield,
  Target,
  Bell,
  LayoutDashboard,
  BarChart3,
  LineChart,
} from "lucide-react";

// Types for financial summary
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
  accountsByType: {
    checking: { count: number; total: number; accounts: any[] };
    savings: { count: number; total: number; accounts: any[] };
    creditCards: { count: number; total: number; accounts: any[] };
    loans: { count: number; total: number; accounts: any[] };
    investments: { count: number; total: number; accounts: any[] };
  };
  trends: {
    netWorth: { month: string; netWorth: number; assets: number; liabilities: number }[];
    cashFlow: { month: string; income: number; expenses: number }[];
  };
  spending: {
    total: number;
    byCategory: { name: string; amount: number; percentage: number }[];
  };
}

export default function Dashboard() {
  const { isLoading: authLoading, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [, navigate] = useLocation();
  
  // Fetch notifications count
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
      if (!token) return 0;
      try {
        const data = await apiFetch('/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}` }
        });
        return data.count || 0;
      } catch {
        return 0;
      }
    }
  });

  // Fetch comprehensive financial summary
  const { data: financialData, isLoading: financialLoading } = useQuery<FinancialSummaryData>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      try {
        // Try authenticated endpoint first
        const token = localStorage.getItem('jwt_token');
        if (token) {
          const data = await apiFetch('/api/financial-summary', {
            headers: { Authorization: `Bearer ${token}` }
          });
          // If we got real data with accounts, use it
          if (data.summary?.accountCount > 0) {
            return data;
          }
        }
      } catch {
        // Fall through to demo data
      }
      // Fall back to demo data
      return await apiFetch('/api/financial-summary/demo');
    },
    staleTime: 30000, // Cache for 30 seconds
  });
  
  // Function to refresh all data
  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
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

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{greeting}, {firstName}!</h1>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  <Bell className="h-3 w-3 mr-1" />
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Here's your complete financial overview
            </p>
          </div>
          
          <div className="flex items-center gap-2">
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
        </div>

        {/* Financial Summary Stats */}
        {financialData && (
          <FinancialSummaryStats data={financialData.summary} />
        )}

        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Accounts</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* AI Insights Banner */}
            <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">AI Financial Insight</h3>
                    <p className="text-muted-foreground">
                      {financialData && financialData.summary.savingsRate >= 20 ? (
                        <>
                          Great job! Your savings rate of <strong className="text-foreground">{financialData.summary.savingsRate}%</strong> is 
                          above the recommended 20%. At this rate, you're saving approximately{' '}
                          <strong className="text-foreground">
                            ${Math.round((financialData.summary.monthlyIncome - financialData.summary.monthlyExpenses) * 12).toLocaleString()}
                          </strong>{' '}per year.
                        </>
                      ) : (
                        <>
                          Based on your spending patterns, you could save an additional <strong className="text-foreground">$320/month</strong> by 
                          optimizing your subscription services. Your dining expenses are 23% higher than last month.
                        </>
                      )}
                    </p>
                    <Button 
                      variant="link" 
                      className="p-0 h-auto mt-2"
                      onClick={() => navigate("/plan")}
                    >
                      View detailed analysis →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts Row */}
            {financialData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <NetWorthChart 
                  data={financialData.trends.netWorth}
                  currentNetWorth={financialData.summary.netWorth}
                />
                <CashFlowChart 
                  data={financialData.trends.cashFlow}
                  monthlyIncome={financialData.summary.monthlyIncome}
                  monthlyExpenses={financialData.summary.monthlyExpenses}
                />
              </div>
            )}

            {/* Bank Connections Demo */}
            <DemoOpenBanking />

            {/* Risk & Goals Cards */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <CreditScoreCard />
              <InsuranceRiskCard />
              <FinancialGoalsCard />
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {/* PD Overview */}
            <PDOverview />

            {/* Spending Analysis */}
            {financialData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SpendingBreakdown 
                  data={financialData.spending.byCategory}
                  totalSpending={financialData.spending.total}
                />
                <CashFlowChart 
                  data={financialData.trends.cashFlow}
                  monthlyIncome={financialData.summary.monthlyIncome}
                  monthlyExpenses={financialData.summary.monthlyExpenses}
                />
              </div>
            )}

            {/* Net Worth Trend Full Width */}
            {financialData && (
              <NetWorthChart 
                data={financialData.trends.netWorth}
                currentNetWorth={financialData.summary.netWorth}
              />
            )}
          </TabsContent>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-6">
            {financialData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AccountBreakdown 
                  data={financialData.accountsByType}
                  totalAssets={financialData.summary.totalAssets}
                  totalLiabilities={financialData.summary.totalLiabilities}
                />
                <div className="space-y-6">
                  <SpendingBreakdown 
                    data={financialData.spending.byCategory}
                    totalSpending={financialData.spending.total}
                  />
                </div>
              </div>
            )}

            {/* Bank Connections */}
            <DemoOpenBanking />
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/bill-split")}
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-sm">Pay Bills</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/goals")}
              >
                <PiggyBank className="h-5 w-5" />
                <span className="text-sm">Add Savings</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/products?category=insurance")}
              >
                <Shield className="h-5 w-5" />
                <span className="text-sm">View Insurance</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/goals")}
              >
                <Target className="h-5 w-5" />
                <span className="text-sm">Set Goal</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
