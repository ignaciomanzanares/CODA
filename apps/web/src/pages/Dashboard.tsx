import { useAuth } from "@/lib/auth";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import PDOverview from "@/components/PDOverview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CreditCard, 
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Shield,
  Target,
  Bell
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Quick stat card component
function QuickStatCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon, 
  color 
}: { 
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: any;
  color: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {change && (
              <div className={cn(
                "flex items-center gap-1 text-sm mt-2",
                changeType === 'positive' && "text-green-600",
                changeType === 'negative' && "text-red-600",
                changeType === 'neutral' && "text-muted-foreground"
              )}>
                {changeType === 'positive' && <ArrowUpRight className="h-4 w-4" />}
                {changeType === 'negative' && <ArrowDownRight className="h-4 w-4" />}
                <span>{change}</span>
              </div>
            )}
          </div>
          <div className={cn("p-3 rounded-xl", color)}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { isLoading: authLoading, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Fetch notifications count
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
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

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container py-8 space-y-8">
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
              Here's your financial health overview for today
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

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStatCard
            title="Total Balance"
            value="$24,562.80"
            change="+$1,240 this month"
            changeType="positive"
            icon={Wallet}
            color="bg-blue-500"
          />
          <QuickStatCard
            title="Monthly Spending"
            value="$3,845.20"
            change="12% under budget"
            changeType="positive"
            icon={CreditCard}
            color="bg-purple-500"
          />
          <QuickStatCard
            title="Savings Rate"
            value="28%"
            change="+3% from last month"
            changeType="positive"
            icon={PiggyBank}
            color="bg-green-500"
          />
          <QuickStatCard
            title="Net Worth"
            value="$142,350"
            change="+$8,500 YTD"
            changeType="positive"
            icon={TrendingUp}
            color="bg-orange-500"
          />
        </div>

        {/* Bank Connections */}
        <DemoOpenBanking />

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
                  Based on your spending patterns, you could save an additional <strong className="text-foreground">$320/month</strong> by 
                  optimizing your subscription services. Your dining expenses are 23% higher than last month.
                </p>
                <Button variant="link" className="p-0 h-auto mt-2">
                  View detailed analysis →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PD Overview */}
        <PDOverview />
        
        {/* Main Cards Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <CreditScoreCard />
          </div>
          <div className="lg:col-span-1">
            <InsuranceRiskCard />
          </div>
          <div className="lg:col-span-1">
            <FinancialGoalsCard />
          </div>
        </div>

        {/* Bottom Section - Recent Activity */}
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
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <CreditCard className="h-5 w-5" />
                <span className="text-sm">Pay Bills</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <PiggyBank className="h-5 w-5" />
                <span className="text-sm">Add Savings</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Shield className="h-5 w-5" />
                <span className="text-sm">View Insurance</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
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