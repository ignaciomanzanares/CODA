import { useAuth, getPersonalToken } from "@/lib/auth";
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

// Components
import DocumentUploadCard from "@/components/DocumentUploadCard";
import TransactionalScoreCard from "@/components/TransactionalScoreCard";
import CreditScoreCard from "@/components/CreditScoreCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import FinancialHealthCard from "@/components/FinancialHealthCard";
import DownloadReporteCodaButton from "@/components/DownloadReporteCodaButton";
import CategoryPieChart from "@/components/CategoryPieChart";
import SmartInsights from "@/components/SmartInsights";
import { ReportDataProvider } from "@/contexts/ReportDataContext";

// Shared primitives
import { StatCard } from "@/components/ui/stat-card";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { EyebrowLabel } from "@/components/ui/eyebrow-label";

// UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";

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
  Wallet,
  BarChart3,
  Activity,
  Users,
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
      const token = getPersonalToken();
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
      const token = getPersonalToken();
      if (!token) return null;
      return apiFetch('/api/transactions/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30000,
  });

  // Panel cards with explicit CLP semantics — preferred source for the four stat cards
  const { data: dashboardSummary } = useQuery<{
    saldo_actual: number;
    ingresos_promedio_mensual: number;
    gastos_promedio_mensual: number;
    tasa_ahorro_pct: number;
    meta: { cartola_count: number; months_analyzed: number; data_source: string };
  }>({
    queryKey: ['/api/dashboard/summary'],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token) return null;
      return apiFetch('/api/dashboard/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30000,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/transactions/summary'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] }),
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

  // Priority: Fintoc data > dashboard/summary (cartola, explicit CLP) > transactions/summary fallback
  const hasFintocData = rawSummary && (rawSummary.monthlyIncome > 0 || rawSummary.totalBalance > 0);
  const hasDashboardData = !!(dashboardSummary?.meta?.cartola_count);
  const hasCartolaData = cartolaSummary && cartolaSummary.summary.transactionCount > 0;
  const usingCartolaFallback = !hasFintocData && (hasDashboardData || hasCartolaData);

  /** Format a monetary value, telling formatCurrency it's already in integer CLP pesos when we're using cartola data. */
  const fmt = (n: number) =>
    formatCurrency(n, currency, usingCartolaFallback ? { sourceCurrency: 'CLP' as const } : undefined);

  const summary = hasFintocData ? rawSummary : hasDashboardData ? {
    totalBalance: dashboardSummary!.saldo_actual,
    totalAssets: dashboardSummary!.saldo_actual,
    totalLiabilities: 0,
    netWorth: dashboardSummary!.saldo_actual,
    monthlyIncome: dashboardSummary!.ingresos_promedio_mensual,
    monthlyExpenses: dashboardSummary!.gastos_promedio_mensual,
    savingsRate: dashboardSummary!.tasa_ahorro_pct,
    accountCount: 0,
  } : hasCartolaData ? (() => {
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
  })() : rawSummary;

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

  const dashboardFallback = (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">No se pudo cargar el panel.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary fallback={dashboardFallback}>
    <ReportDataProvider>
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

        {/* Banners */}
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para ver tu resumen"
            description="Los datos del panel provienen de tus cuentas y documentos. Sin sesión no mostramos cifras de ejemplo."
            actionText="Iniciar sesión"
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-hero-title font-bold text-foreground">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DownloadReporteCodaButton />
            <Button
              variant="outline"
              size="icon"
              onClick={refreshAllData}
              disabled={isRefreshing}
              className="text-muted-foreground"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* ── Hero row: Net Worth + Stats ────────────────────────── */}
        {summary && !allZeros && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Main balance card — spans 2 cols */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="flex items-center gap-2">
                <EyebrowLabel color="muted">
                  {usingCartolaFallback ? 'Balance desde cartolas' : 'Patrimonio neto'}
                </EyebrowLabel>
                {usingCartolaFallback && (
                  <span className="text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    Cartola bancaria
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3">
                <h2 className="text-hero-value font-bold tracking-tight text-foreground">
                  {fmt(summary.netWorth)}
                </h2>
                {!usingCartolaFallback && (
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    netWorthChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {netWorthChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span>{netWorthChange >= 0 ? '+' : ''}{netWorthChangePercent}%</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {usingCartolaFallback
                  ? `${cartolaSummary?.summary?.transactionCount ?? 0} movimientos · ${cartolaSummary?.summary?.documentCount ?? 0} cartola${(cartolaSummary?.summary?.documentCount ?? 0) !== 1 ? 's' : ''}`
                  : `${fmt(summary.totalAssets)} en activos · ${fmt(summary.totalLiabilities)} en pasivos`
                }
              </p>
            </div>

            {/* 3 stat cards */}
            <StatCard
              label="Ingresos"
              value={fmt(summary.monthlyIncome)}
              subtitle="Promedio mensual"
              icon={TrendingUp}
              iconColor="green"
            />
            <StatCard
              label="Gastos"
              value={fmt(summary.monthlyExpenses)}
              delta={`${savingsThisMonth >= 0 ? '+' : ''}${fmt(savingsThisMonth)} ahorrado`}
              deltaDirection={savingsThisMonth >= 0 ? "up" : "down"}
              icon={TrendingDown}
              iconColor="red"
            />
            <StatCard
              label="Tasa de ahorro"
              value={`${summary.savingsRate}%`}
              delta={summary.savingsRate >= 20 ? 'Excelente' : 'Mejorable'}
              deltaDirection={summary.savingsRate >= 20 ? "up" : "neutral"}
              icon={Activity}
              iconColor={summary.savingsRate >= 20 ? "green" : "orange"}
            />
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {isAuthenticated && !financialLoading && allZeros && !hasCartolaData && (
          <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-card p-10 text-center space-y-5">
            <PastelIcon icon={FileText} color="blue" size="lg" className="mx-auto" />
            <div>
              <h3 className="font-bold text-xl mb-2 text-foreground">Sube tu primera cartola</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Arrastra tu cartola bancaria (PDF) y en segundos verás tus ingresos, gastos, score y análisis personalizados.
              </p>
            </div>
            <Button onClick={() => navigate(ROUTES.movimientos)} className="gap-2">
              <FileText className="h-4 w-4" />
              Subir cartola bancaria
            </Button>
          </div>
        )}

        {/* ── Spending breakdown ──────────────────────────────────── */}
        {hasDocuments && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryPieChart />
            <SmartInsights />
          </div>
        )}

        {/* ── Financial insight card ──────────────────────────────── */}
        {summary && !allZeros && (
          <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1 text-foreground">Resumen financiero</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {summary.savingsRate >= 20 ? (
                      <>
                        Tu tasa de ahorro del <strong className="text-foreground">{summary.savingsRate}%</strong> está
                        por encima del 20% recomendado. Ahorras aproximadamente{' '}
                        <strong className="text-foreground">
                          {fmt(savingsThisMonth * 12)}
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Document Upload ─────────────────────────────────────── */}
        <DocumentUploadCard />

        {/* ── Scores ──────────────────────────────────────────────── */}
        <div>
          <EyebrowLabel className="mb-4">Score dual</EyebrowLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TransactionalScoreCard />
            <CreditScoreCard />
          </div>
        </div>

        {/* Financial Health & Government Programs */}
        {hasDocuments && <FinancialHealthCard />}

        {/* Goals */}
        <FinancialGoalsCard />

        {/* ── Quick Actions ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <EyebrowLabel color="muted" className="mb-4">Acciones rápidas</EyebrowLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Wallet, label: "Gastos", href: ROUTES.gastos, color: "blue" as const },
              { icon: Users, label: "Dividir cuenta", href: ROUTES.dividirCuenta, color: "purple" as const },
              { icon: Target, label: "Metas", href: ROUTES.metas, color: "green" as const },
              { icon: BarChart3, label: "Productos", href: ROUTES.productos, color: "orange" as const },
            ].map(({ icon: Icon, label, href, color }) => (
              <button
                key={href}
                onClick={() => navigate(href)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-background hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <PastelIcon icon={Icon} color={color} size="sm" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
    </ReportDataProvider>
    </ErrorBoundary>
  );
}
