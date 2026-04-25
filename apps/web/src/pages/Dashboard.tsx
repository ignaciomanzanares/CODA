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
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";

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
  ChevronRight,
  FileText,
  Target,
  Wallet,
  BarChart3,
  Activity,
  Users,
  Trash2,
} from "lucide-react";

// Types — single source: /api/dashboard/summary
interface DashboardSummary {
  saldo_actual: number;
  ingresos_promedio_mensual: number;
  gastos_promedio_mensual: number;
  tasa_ahorro_pct: number;
  meta: { cartola_count: number; months_analyzed: number; data_source: string };
}

export default function Dashboard() {
  const { isLoading: authLoading, user, isAuthenticated } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, navigate] = useLocation();
  const { currency } = useCurrency();
  const { hasDocuments } = useUserDocuments();
  const { setOpen: openUploadDrawer } = useUploadDrawer();

  const { data: ds, isLoading: dsLoading } = useQuery<DashboardSummary>({
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

  const { data: scoreDocCount } = useQuery<{ count: number }>({
    queryKey: ['/api/score/documents/count'],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token) return { count: 0 };
      return apiFetch('/api/score/documents/count', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30000,
  });
  const [clearingScore, setClearingScore] = useState(false);

  const handleClearScoreData = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar todos los documentos del Score? Los scores se mantendrán hasta que subas nuevos documentos.")) return;
    setClearingScore(true);
    try {
      const token = getPersonalToken();
      await apiFetch('/api/score/documents', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: ['/api/score/documents/count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactional-score'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-score'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
    } catch {
      alert("Error al eliminar datos del Score.");
    } finally {
      setClearingScore(false);
    }
  };

  const refreshAllData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] }),
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] }),
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

  const hasData = !!(ds?.meta?.cartola_count && ds.meta.months_analyzed > 0);

  /** All dashboard/summary values are integer CLP — tell formatCurrency not to ×1000. */
  const fmt = (n: number) =>
    formatCurrency(n, currency, { sourceCurrency: 'CLP' as const });

  const savingsThisMonth = ds ? ds.ingresos_promedio_mensual - ds.gastos_promedio_mensual : 0;

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
        {hasData && ds && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Main balance card — spans 2 cols */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 space-y-3">
              <EyebrowLabel color="muted">Patrimonio neto</EyebrowLabel>
              <h2 className="text-hero-value font-bold tracking-tight text-foreground tabular-nums">
                {fmt(ds.saldo_actual)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {ds.meta.cartola_count} cartola{ds.meta.cartola_count !== 1 ? 's' : ''} · {ds.meta.months_analyzed} mes{ds.meta.months_analyzed !== 1 ? 'es' : ''}
              </p>
            </div>

            {/* 3 stat cards */}
            <StatCard
              label="Ingresos"
              value={fmt(ds.ingresos_promedio_mensual)}
              subtitle="Promedio mensual"
              icon={TrendingUp}
              iconColor="green"
            />
            <StatCard
              label="Gastos"
              value={fmt(ds.gastos_promedio_mensual)}
              delta={`${savingsThisMonth >= 0 ? '+' : ''}${fmt(savingsThisMonth)} ahorrado`}
              deltaDirection={savingsThisMonth >= 0 ? "up" : "down"}
              icon={TrendingDown}
              iconColor="red"
            />
            <StatCard
              label="Tasa de ahorro"
              value={`${ds.tasa_ahorro_pct}%`}
              delta={ds.tasa_ahorro_pct >= 20 ? 'Excelente' : 'Mejorable'}
              deltaDirection={ds.tasa_ahorro_pct >= 20 ? "up" : "neutral"}
              icon={Activity}
              iconColor={ds.tasa_ahorro_pct >= 20 ? "green" : "orange"}
            />
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {isAuthenticated && !dsLoading && !hasData && (
          <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-card p-10 text-center space-y-5">
            <PastelIcon icon={FileText} color="blue" size="lg" className="mx-auto" />
            <div>
              <h3 className="font-bold text-xl mb-2 text-foreground">Sube tu primera cartola</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Arrastra tu cartola bancaria (PDF) y en segundos verás tus ingresos, gastos, score y análisis personalizados.
              </p>
            </div>
            <Button onClick={() => openUploadDrawer(true)} className="gap-2">
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
        {hasData && ds && (
          <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1 text-foreground">Resumen financiero</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {ds.tasa_ahorro_pct >= 20 ? (
                      <>
                        Tu tasa de ahorro del <strong className="text-foreground">{ds.tasa_ahorro_pct}%</strong> está
                        por encima del 20% recomendado. Ahorras aproximadamente{' '}
                        <strong className="text-foreground">
                          {fmt(savingsThisMonth * 12)}
                        </strong>{' '}al año.
                      </>
                    ) : (
                      <>
                        Tu tasa de ahorro actual es del <strong className="text-foreground">{ds.tasa_ahorro_pct}%</strong>.
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
          {(scoreDocCount?.count ?? 0) > 0 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-muted-foreground">
                {scoreDocCount!.count} documento{scoreDocCount!.count !== 1 ? 's' : ''} subido{scoreDocCount!.count !== 1 ? 's' : ''} al Score
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleClearScoreData}
                disabled={clearingScore}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {clearingScore ? "Eliminando..." : "Limpiar datos del Score"}
              </Button>
            </div>
          )}
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
