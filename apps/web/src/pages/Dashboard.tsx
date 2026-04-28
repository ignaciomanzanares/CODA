import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import type { DashboardPeriod } from "@/types/dashboard";

// Dashboard subcomponents
import PeriodToggle from "@/components/dashboard/PeriodToggle";
import ScoreHero from "@/components/dashboard/ScoreHero";
import AvailableCard from "@/components/dashboard/AvailableCard";
import InsightCard from "@/components/dashboard/InsightCard";
import FlowDonut from "@/components/dashboard/FlowDonut";
import SavingsProgress from "@/components/dashboard/SavingsProgress";
import CategoryCard from "@/components/dashboard/CategoryCard";
import CreditScoreCard from "@/components/dashboard/CreditScoreCard";
import PatrimonioSidebar from "@/components/dashboard/PatrimonioSidebar";

// Shared primitives
import { Button } from "@/components/ui/button";
import { PastelIcon } from "@/components/ui/pastel-icon";
import ErrorBoundary from "@/components/ErrorBoundary";
import SignInBanner from "@/components/SignInBanner";

// Icons
import { RefreshCw, FileText, Upload, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiFetch";
import { getPersonalToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { isLoading: authLoading, user, isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [monthOffset, setMonthOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const { setOpen: openUploadDrawer } = useUploadDrawer();
  const { toast } = useToast();
  const { data, isLoading, totalMonths } = useDashboardData(period, monthOffset);

  // Reset offset when switching period type
  const handlePeriodChange = (p: DashboardPeriod) => {
    setPeriod(p);
    setMonthOffset(0);
  };

  const handleRecategorizeAll = async () => {
    setIsRecategorizing(true);
    try {
      const token = getPersonalToken();
      const result = await apiFetch("/api/admin/recategorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }) as { updated: number };
      await queryClient.invalidateQueries();
      const updated = result?.updated ?? 0;
      toast({
        title: "Categorías actualizadas",
        description: updated > 0
          ? `Se recategorizaron ${updated} transacciones.`
          : "Todas las transacciones ya tenían la categoría correcta.",
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/insights"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/transactional-score"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/score-history"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/parsed"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (authLoading || isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando tu dashboard...</p>
        </div>
      </div>
    );
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

          {/* ── Header + Period Toggle ───────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  {greeting}, {firstName}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date().toLocaleDateString("es-CL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openUploadDrawer(true)}
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Subir documento</span>
                </Button>
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
          {/* EMPTY STATE — no cartolas uploaded                         */}
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
          {/* CAPA 1 — HERO (above the fold)                            */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {data?.hasData && (
            <>
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

              {/* Balance del período */}
              {(data.totalIncome > 0 || data.totalExpenses > 0) && (
                <AvailableCard
                  totalIncome={data.totalIncome}
                  totalExpenses={data.totalExpenses}
                  savingsGoal={data.savingsGoalAmount}
                />
              )}

              {/* Insight of the day */}
              {data.insight && <InsightCard insight={data.insight} />}

              {/* ═══════════════════════════════════════════════════════ */}
              {/* CAPA 2 — FLUJO DEL PERÍODO                            */}
              {/* ═══════════════════════════════════════════════════════ */}
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

              {/* ═══════════════════════════════════════════════════════ */}
              {/* CAPA 3 — DETALLE EXPANDIBLE                           */}
              {/* ═══════════════════════════════════════════════════════ */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Detalle por categoría
                </p>
                {data.categoryGroups.map((group) => (
                  <CategoryCard key={group.key} group={group} />
                ))}
                <button
                  onClick={handleRecategorizeAll}
                  disabled={isRecategorizing}
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RotateCcw className={cn("h-3 w-3", isRecategorizing && "animate-spin")} />
                  {isRecategorizing ? "Recategorizando..." : "Recategorizar todas las transacciones"}
                </button>
              </div>

              {/* ═══════════════════════════════════════════════════════ */}
              {/* PATRIMONIO                                             */}
              {/* ═══════════════════════════════════════════════════════ */}
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
