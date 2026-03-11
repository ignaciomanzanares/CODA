import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from '@/lib/api';
import { queryClient } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { useState } from "react";
import { useLocation } from "wouter";

// Components
import DocumentUploadCard from "@/components/DocumentUploadCard";
import TransactionalScoreCard from "@/components/TransactionalScoreCard";
import CreditScoreCard from "@/components/CreditScoreCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import DownloadReporteCodaButton from "@/components/DownloadReporteCodaButton";
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
}

export default function Dashboard() {
  const { isLoading: authLoading, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, navigate] = useLocation();
  const { currency } = useCurrency();

  // Fetch financial summary
  const { data: financialData } = useQuery<FinancialSummaryData>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        if (token) {
          const data = await apiFetch('/api/financial-summary', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (data.summary?.accountCount > 0) return data;
        }
      } catch {}
      return await apiFetch('/api/financial-summary/demo');
    },
    staleTime: 30000,
  });
  
  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
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
  
  const summary = financialData?.summary;
  const netWorthChange = summary ? summary.netWorth * 0.02 : 0;
  const netWorthChangePercent = summary && summary.netWorth > 0 
    ? ((netWorthChange / (summary.netWorth - netWorthChange)) * 100).toFixed(1) 
    : '0.0';
  const savingsThisMonth = summary ? summary.monthlyIncome - summary.monthlyExpenses : 0;

  return (
    <ReportDataProvider>
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        
        {/* Header - Minimalista */}
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
        {summary && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Patrimonio neto</p>
            <div className="flex items-baseline gap-3">
              <h2 className="text-hero-value font-bold tracking-tight">
                {formatCurrency(summary.netWorth, currency)}
              </h2>
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                netWorthChange >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {netWorthChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{netWorthChange >= 0 ? '+' : ''}{netWorthChangePercent}%</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(summary.totalAssets, currency)} en activos · {formatCurrency(summary.totalLiabilities, currency)} en pasivos
            </p>
          </div>
        )}

        <Separator />

        {/* Key Metrics - Clean Grid */}
        {summary && (
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

        {/* Financial Insight - Subtle Card */}
        {summary && (
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
                    onClick={() => navigate("/plan")}
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
                onClick={() => navigate("/expenses")}
              >
                <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Gastos</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate("/bill-split")}
              >
                <ArrowUpRight className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Dividir cuenta</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate("/goals")}
              >
                <Target className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Metas</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 justify-start"
                onClick={() => navigate("/products")}
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
