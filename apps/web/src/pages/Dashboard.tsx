import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from '@/lib/api';
import { queryClient } from "@/lib/queryClient";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import SignInBanner from "@/components/SignInBanner";
import PreviewBanner from "@/components/PreviewBanner";

// Components
import DocumentUploadCard from "@/components/DocumentUploadCard";
import TransactionalScoreCard from "@/components/TransactionalScoreCard";
import CreditScoreCard from "@/components/CreditScoreCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import FinancialHealthCard from "@/components/FinancialHealthCard";
import DownloadReporteCodaButton from "@/components/DownloadReporteCodaButton";
import CategoryPieChart from "@/components/CategoryPieChart";
import SmartInsights from "@/components/SmartInsights";
import ScoreHistoryChart from "@/components/ScoreHistoryChart";
import { ReportDataProvider } from "@/contexts/ReportDataContext";

// UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// Icons
import { 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Shield,
  Target,
} from "lucide-react";

// Types
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
  trends?: {
    netWorth?: { month: string; netWorth: number }[];
  };
}

const emptySummary: FinancialSummaryData = {
  summary: {
    totalBalance: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    savingsRate: 0,
    accountCount: 0,
  },
};

export default function Dashboard() {
  const { isLoading: authLoading, user, isAuthenticated } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, navigate] = useLocation();
  const { currency } = useCurrency();
  const { hasDocuments } = useUserDocuments();

  const { data: financialData, isLoading: financialLoading } = useQuery<FinancialSummaryData>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
      if (!token) return emptySummary;
      return apiFetch('/api/financial-summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30000,
  });

  // Cartola-based summary (always fetched; used to fill gaps when fintoc summary is all zeros)
  const { data: cartolaSummary } = useQuery<{
    summary: { totalIncome: number; totalExpenses: number; netBalance: number; currentBalance: number | null; transactionCount: number; documentCount: number; avgMonthlyIncome?: number; avgMonthlyExpenses?: number };
  }>({
    queryKey: ['/api/transactions/summary'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
      if (!token) return null;
      return apiFetch('/api/transactions/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30000,
  });

  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/transactions/summary'] }),
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (authLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const rawFirst = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'usuario';
  const firstName = rawFirst === 'Investor' ? 'Inversor' : rawFirst;
  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  
  const rawSummary = financialData?.summary;

  // If fintoc financial-summary is all zeros but we have cartola data, use that instead
  const hasFintocData = rawSummary && (rawSummary.monthlyIncome > 0 || rawSummary.totalBalance > 0);
  const hasCartolaData = cartolaSummary && cartolaSummary.summary.transactionCount > 0;
  const usingCartolaFallback = !hasFintocData && hasCartolaData;

  const summary = hasFintocData ? rawSummary : (hasCartolaData ? (() => {
    const monthlyIncome = cartolaSummary!.summary.avgMonthlyIncome ?? cartolaSummary!.summary.totalIncome;
    const monthlyExpenses = cartolaSummary!.summary.avgMonthlyExpenses ?? cartolaSummary!.summary.totalExpenses;
    return {
      totalBalance: cartolaSummary!.summary.currentBalance ?? 0,
      totalAssets: cartolaSummary!.summary.currentBalance ?? 0,
      totalLiabilities: 0,
      netWorth: cartolaSummary!.summary.currentBalance ?? cartolaSummary!.summary.netBalance,
      monthlyIncome,
      monthlyExpenses,
      savingsRate: monthlyIncome > 0
        ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
        : 0,
      accountCount: 0,
    };
  })() : rawSummary);

  const nwTrend = financialData?.trends?.netWorth;
  let netWorthChange = 0;
  let netWorthChangePercent = '0.0';
  if (nwTrend && nwTrend.length >= 2) {
    const prev = nwTrend[nwTrend.length - 2]!.netWorth;
    const last = nwTrend[nwTrend.length - 1]!.netWorth;
    netWorthChange = last - prev;
    netWorthChangePercent =
      prev !== 0 ? ((netWorthChange / Math.abs(prev)) * 100).toFixed(1) : '0.0';
  }
  const savingsThisMonth = summary ? summary.monthlyIncome - summary.monthlyExpenses : 0;
  const allZeros = summary && summary.monthlyIncome === 0 && summary.totalBalance === 0;

  return (
    <ReportDataProvider>
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        
        {/* Header - Minimalista */}
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para ver tu resumen"
            description="Los datos del panel provienen de tus cuentas y documentos. Sin sesión no mostramos cifras de ejemplo."
            actionText="Iniciar sesión"
          />
        )}

        {isAuthenticated && !hasDocuments && (
          <PreviewBanner />
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-hero-title font-semibold text-foreground">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={refreshAllData}
            disabled={isRefreshing}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Main Balance - Hero Section */}
        {summary && !allZeros && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">
                {usingCartolaFallback ? 'Balance desde cartolas' : 'Patrimonio neto'}
              </p>
              {usingCartolaFallback && (
                <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Cartola bancaria
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-hero-value font-bold tracking-tight">
                {formatCurrency(summary.netWorth, currency)}
              </h2>
              {!usingCartolaFallback && (
                <div className={cn(
                  "flex items-center gap-1 text-sm font-medium",
                  netWorthChange >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {netWorthChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span>{netWorthChange >= 0 ? '+' : ''}{netWorthChangePercent}%</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {usingCartolaFallback
                ? `${cartolaSummary!.summary.transactionCount} movimientos · ${cartolaSummary!.summary.documentCount} cartola${cartolaSummary!.summary.documentCount !== 1 ? 's' : ''}`
                : `${formatCurrency(summary.totalAssets, currency)} en activos · ${formatCurrency(summary.totalLiabilities, currency)} en pasivos`
              }
            </p>
          </div>
        )}

        {/* Zero-state: authenticated but no data yet */}
        {isAuthenticated && !financialLoading && allZeros && !hasCartolaData && (
          <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Sube tu primera cartola</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Arrastra tu cartola bancaria (PDF) y en segundos verás tus ingresos, gastos, score y análisis personalizados.
              </p>
            </div>
            <Button onClick={() => navigate(ROUTES.movimientos)} className="gap-2">
              <FileText className="h-4 w-4" />
              Subir cartola bancaria
            </Button>
          </div>
        )}

        <Separator />

        {/* Key Metrics - Clean Grid */}
        {summary && !allZeros && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">Saldo total</p>
              <p className="text-card-value font-semibold truncate">{formatCurrency(summary.totalBalance, currency)}</p>
              <p className="text-xs text-muted-foreground">{summary.accountCount} cuentas</p>
            </div>
            
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">Ingresos mensuales</p>
              <p className="text-card-value font-semibold truncate">{formatCurrency(summary.monthlyIncome, currency)}</p>
              <p className="text-xs text-muted-foreground">Últimos 30 días</p>
            </div>
            
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">Gastos mensuales</p>
              <p className="text-card-value font-semibold truncate">{formatCurrency(summary.monthlyExpenses, currency)}</p>
              <div className={cn(
                "text-xs font-medium",
                savingsThisMonth >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {savingsThisMonth >= 0 ? '+' : ''}{formatCurrency(savingsThisMonth, currency)} ahorrado
              </div>
            </div>
            
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">Tasa de ahorro</p>
              <p className="text-card-value font-semibold">{summary.savingsRate}%</p>
              <p className={cn(
                "text-xs font-medium",
                summary.savingsRate >= 20 ? "text-green-600" : "text-amber-600"
              )}>
                {summary.savingsRate >= 20 ? 'Excelente' : 'Mejorable'}
              </p>
            </div>
          </div>
        )}

        {/* Spending breakdown — sólo cuando hay cartolas cargadas */}
        {hasDocuments && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryPieChart />
            <SmartInsights />
          </div>
        )}

        {/* Financial Insight - Subtle Card */}
        {summary && !allZeros && (
          <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Información financiera</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {summary.savingsRate >= 20 ? (
                      <>
                        Tu tasa de ahorro del <strong className="text-foreground">{summary.savingsRate}%</strong> está 
                        por encima del 20% recomendado. Ahorras aproximadamente{' '}
                        <strong className="text-foreground">
                          {formatCurrency(savingsThisMonth * 12, currency)}
                        </strong>{' '}al año.
                      </>
                    ) : (
                      <>
                        Tu tasa de ahorro actual es del <strong className="text-foreground">{summary.savingsRate}%</strong>. 
                        Recomendamos alcanzar al menos el 20% para un futuro financiero sólido.
                      </>
                    )}
                  </p>
                  <Button 
                    variant="link" 
                    className="p-0 h-auto mt-2 text-sm"
                    onClick={() => navigate(ROUTES.plan)}
                  >
                    Ver análisis completo <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <DownloadReporteCodaButton />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Document Upload */}
        <DocumentUploadCard />

        {/* Scores Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TransactionalScoreCard />
          <CreditScoreCard />
        </div>

        {/* Score evolution chart */}
        {hasDocuments && <ScoreHistoryChart />}

        {/* Financial Health & Government Programs */}
        {hasDocuments && <FinancialHealthCard />}

        {/* Goals */}
        <FinancialGoalsCard />

        {/* Quick Actions - Minimal */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Acciones rápidas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate(ROUTES.gastos)}
              >
                <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Gastos</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate(ROUTES.dividirCuenta)}
              >
                <ArrowUpRight className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Dividir cuenta</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate(ROUTES.metas)}
              >
                <Target className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Metas</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate(ROUTES.productos)}
              >
                <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Productos</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
    </ReportDataProvider>
  );
}
