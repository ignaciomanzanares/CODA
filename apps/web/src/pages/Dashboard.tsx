import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import type { DashboardPeriod } from "@/types/dashboard";

// Dashboard subcomponents
import PeriodToggle from "@/components/dashboard/PeriodToggle";
import ScoreHero from "@/components/dashboard/ScoreHero";
import ScoreBreakdown from "@/components/dashboard/ScoreBreakdown";
import AvailableCard from "@/components/dashboard/AvailableCard";
import InsightCard from "@/components/dashboard/InsightCard";
import ActionCards from "@/components/dashboard/ActionCards";
import FlowDonut from "@/components/dashboard/FlowDonut";
import SavingsProgress from "@/components/dashboard/SavingsProgress";
import CategoryCard from "@/components/dashboard/CategoryCard";
import CreditScoreCard from "@/components/dashboard/CreditScoreCard";
import PatrimonioSidebar from "@/components/dashboard/PatrimonioSidebar";
import ReferralShareCard from "@/components/dashboard/ReferralShareCard";
import DashboardTextInsights from "@/components/dashboard/DashboardTextInsights";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

// Shared primitives
import { Button } from "@/components/ui/button";
import { PastelIcon } from "@/components/ui/pastel-icon";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import SignInBanner from "@/components/SignInBanner";

// Icons
import { RefreshCw, FileText, Upload, ChevronLeft, ChevronRight, RotateCcw, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiFetch";
import { getPersonalToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export default function Dashboard() {
  const { isLoading: authLoading, user, isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [monthOffset, setMonthOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const { setOpen: openUploadDrawer } = useUploadDrawer();
  const { toast } = useToast();
  const { data, isLoading, totalMonths } = useDashboardData(period, monthOffset);

  const handlePeriodChange = (p: DashboardPeriod) => {
    setPeriod(p);
    setMonthOffset(0);
  };

  const handleRecategorizeAll = async () => {
    setIsRecategorizing(true);
    setShowAdminMenu(false);
    toast({
      title: "Recategorizando transacciones",
      description: "Estamos actualizando las categorías con el motor más reciente.",
    });
    try {
      const token = getPersonalToken();
      const result = await apiFetch("/api/admin/recategorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }) as { updated: number; scanned?: number; version?: string };
      await queryClient.invalidateQueries();
      const updated = result?.updated ?? 0;
      const scanned = result?.scanned ?? 0;
      toast({
        title: "Categorías actualizadas",
        description: updated > 0
          ? `Se recategorizaron ${updated} de ${scanned} transacciones.`
          : `Todas las ${scanned} transacciones ya tenían la categoría correcta.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "No se pudieron recategorizar las transacciones.",
        variant: "destructive",
      });
    } finally {
      setIsRecategorizing(false);
    }
  };

  const refreshAllData = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (authLoading || isLoading) {
    return <DashboardSkeleton />;
  }

  // ── Greeting ────────────────────────────────────────────────────────────
  const rawFirst = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "usuario";
  const firstName = rawFirst === "Investor" ? "Inversor" : rawFirst;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";

  const dashboardFallback = (
    <div className="w-full max-w-2xl mx-auto px-4 py-16 flex items-center justify-center min-h-[400px]">
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
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          {/* ── Not authenticated banner ──────────────────────────────── */}
          {!isAuthenticated && (
            <SignInBanner
              title="Inicia sesión para ver tu resumen"
              description="Los datos del panel provienen de tus cuentas y documentos."
              actionText="Iniciar sesión"
            />
          )}

          {/* ── Compact Header ──────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                  {greeting}, {firstName}
                </h1>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => openUploadDrawer(true)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Subir</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={refreshAllData}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                </Button>
                {/* Admin menu (recategorize, etc.) */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setShowAdminMenu((s) => !s)}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                  {showAdminMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowAdminMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-popover shadow-lg py-1">
                        <button
                          onClick={handleRecategorizeAll}
                          disabled={isRecategorizing}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <RotateCcw className={cn("h-3 w-3", isRecategorizing && "animate-spin")} />
                          {isRecategorizing ? "Recategorizando..." : "Recategorizar transacciones"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Period toggle + month nav */}
            <div className="flex items-center justify-between">
              <PeriodToggle value={period} onChange={handlePeriodChange} />
              {data?.hasData && data.periodLabel && (
                <div className="flex items-center gap-1">
                  {period === "month" && totalMonths > 1 && (
                    <button
                      onClick={() => setMonthOffset((o) => Math.max(-(totalMonths - 1), o - 1))}
                      disabled={Math.abs(monthOffset) >= totalMonths - 1}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      aria-label="Mes anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground min-w-[100px] text-center">
                    {data.periodLabel}
                  </span>
                  {period === "month" && totalMonths > 1 && (
                    <button
                      onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
                      disabled={monthOffset >= 0}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      aria-label="Mes siguiente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* ONBOARDING CHECKLIST — shown while setup is incomplete     */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {isAuthenticated && <OnboardingChecklist />}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* EMPTY STATE — no documents uploaded                        */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {isAuthenticated && data && !data.hasData && (
            <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-card p-10 text-center space-y-5">
              <PastelIcon icon={FileText} color="blue" size="lg" className="mx-auto" />
              <div>
                <h3 className="font-bold text-xl mb-2 text-foreground">
                  Sube tu primer documento
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Arrastra tu cartola bancaria o informe CMF (PDF) y en segundos verás tu score,
                  gastos, ahorro y análisis personalizados.
                </p>
              </div>
              <Button onClick={() => openUploadDrawer(true)} className="gap-2">
                <FileText className="h-4 w-4" />
                Subir documento
              </Button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* DASHBOARD CONTENT                                          */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {data?.hasData && (
            <>
              {/* ── CAPA 1: HERO ─────────────────────────────────────── */}

              {/* Score Hero */}
              {data.score !== null && (
                <ScoreHero score={data.score} delta={data.scoreDelta} />
              )}

              {/* Credit Score (compact, only when available) */}
              {data.creditScore !== null && (
                <CreditScoreCard
                  score={data.creditScore}
                  delta={data.creditScoreDelta}
                  lastUpdated={data.creditScoreDate}
                />
              )}

              {/* Score Breakdown — how to improve */}
              {data.score !== null && (
                <ScoreBreakdown
                  score={data.score}
                  insights={data.scoreInsights}
                  creditScore={data.creditScore}
                />
              )}

              {/* Balance del período */}
              {(data.totalIncome > 0 || data.totalExpenses > 0) && (
                <AvailableCard
                  totalIncome={data.totalIncome}
                  totalExpenses={data.totalExpenses}
                  savingsGoal={data.savingsGoalAmount}
                />
              )}

              {/* ── ACTION CARDS — Revenue bridge ────────────────────── */}
              <ActionCards data={data} />

              {/* Text insights — natural-language observations */}
              <DashboardTextInsights data={data} />

              {/* Insight of the day */}
              {data.insight && <InsightCard insight={data.insight} />}

              {/* Referral — organic growth */}
              <ReferralShareCard />

              {/* ── CAPA 2: FLUJO DEL PERÍODO ────────────────────────── */}
              <div className="space-y-4">
                <FlowDonut
                  segments={data.flowSegments}
                  pctIncomeSpent={data.pctIncomeSpent}
                  totalExpenses={data.totalExpenses}
                />
                <SavingsProgress
                  savingsNet={data.savingsNet}
                  savingsRate={data.savingsRate}
                  goalPct={data.savingsGoalPct}
                  goalAmount={data.savingsGoalAmount}
                />
              </div>

              {/* ── CAPA 3: DETALLE EXPANDIBLE ───────────────────────── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Detalle por categoría
                </p>
                {data.categoryGroups.map((group) => (
                  <CategoryCard key={group.key} group={group} />
                ))}
              </div>

              {/* ── PATRIMONIO ────────────────────────────────────────── */}
              {data.patrimonio &&
                (data.patrimonio.totalPatrimonioNeto !== 0 ||
                  data.patrimonio.inversionesLiquidas !== 0 ||
                  data.patrimonio.cuentasVista !== 0) && (
                <PatrimonioSidebar
                  inversionesLiquidas={data.patrimonio.inversionesLiquidas}
                  cuentasVista={data.patrimonio.cuentasVista}
                  totalPatrimonioNeto={data.patrimonio.totalPatrimonioNeto}
                />
              )}
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
