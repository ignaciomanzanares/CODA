import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from '@/lib/api';
import { queryClient } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { useState } from "react";
import { useLocation } from "wouter";

// Existing components
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import PDOverview from "@/components/PDOverview";
import TransactionalScoreCard from "@/components/TransactionalScoreCard";
import DownloadReporteCodaButton from "@/components/DownloadReporteCodaButton";
import { ReportDataProvider } from "@/contexts/ReportDataContext";

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
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const { currency } = useCurrency();
  const rawFirst = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'usuario';
  const firstName = rawFirst === 'Investor' ? 'Inversor' : rawFirst;
  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const annualSavings = financialData ? (financialData.summary.monthlyIncome - financialData.summary.monthlyExpenses) * 12 : 0;

  return (
    <ReportDataProvider>
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{greeting}, {firstName}.</h1>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  <Bell className="h-3 w-3 mr-1" />
                  {unreadCount} nuevas
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Aquí está tu resumen financiero
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
              Actualizar
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
              <span className="hidden sm:inline">Resumen</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Análisis</span>
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Cuentas</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* AI Insights Banner + Reporte CODA */}
            <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">Información financiera con IA</h3>
                    <p className="text-muted-foreground">
                      {financialData && financialData.summary.savingsRate >= 20 ? (
                        <>
                          Muy bien. Tu tasa de ahorro del <strong className="text-foreground">{financialData.summary.savingsRate}%</strong> está 
                          por encima del 20% recomendado. A este ritmo, ahorras aproximadamente{' '}
                          <strong className="text-foreground">
                            {formatCurrency(Math.round(annualSavings), currency)}
                          </strong>{' '}al año.
                        </>
                      ) : (
                        <>
                          Según tus gastos, podrías ahorrar <strong className="text-foreground">{formatCurrency(320, currency)}/mes</strong> adicionales 
                          optimizando suscripciones. Tus gastos en restaurantes son un 23% mayores que el mes pasado.
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <Button 
                        variant="link" 
                        className="p-0 h-auto"
                        onClick={() => navigate("/plan")}
                      >
                        Ver análisis detallado →
                      </Button>
                      <DownloadReporteCodaButton />
                    </div>
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

            {/* Carga Open Banking: en stand by hasta implementación */}
            {false && <DemoOpenBanking />}

            {/* Documentos oficiales (CMF / Cartolas) → scoring real */}
            <DocumentUploadCard />

            {/* Scores desde documentos reales (cartolas + CMF) */}
            <TransactionalScoreCard />

            {/* Score crediticio + Metas. Riesgo de Seguros en stand by. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CreditScoreCard />
              <FinancialGoalsCard />
              {false && <InsuranceRiskCard />}
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

            {/* Carga de documentos (CMF / Cartolas) */}
            <DocumentUploadCard />
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Acciones rápidas
            </CardTitle>
            <CardDescription>Tareas frecuentes y accesos directos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/bill-split")}
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-sm">Dividir cuenta</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/goals")}
              >
                <PiggyBank className="h-5 w-5" />
                <span className="text-sm">Añadir ahorro</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/products?category=insurance")}
              >
                <Shield className="h-5 w-5" />
                <span className="text-sm">Ver seguros</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate("/goals")}
              >
                <Target className="h-5 w-5" />
                <span className="text-sm">Definir meta</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </ReportDataProvider>
  );
}
