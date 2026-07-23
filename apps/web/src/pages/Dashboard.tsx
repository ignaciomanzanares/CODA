import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import type { DashboardPeriod } from "@/types/dashboard";

// Dashboard subcomponents
import ScoreHero from "@/components/dashboard/ScoreHero";
import ScoreBreakdown from "@/components/dashboard/ScoreBreakdown";
import AvailableCard from "@/components/dashboard/AvailableCard";
import ActionCards from "@/components/dashboard/ActionCards";
import FlowDonut from "@/components/dashboard/FlowDonut";
import SavingsProgress from "@/components/dashboard/SavingsProgress";
import CategoryCard from "@/components/dashboard/CategoryCard";
import CreditScoreCard from "@/components/dashboard/CreditScoreCard";
import HealthSummaryCard from "@/components/dashboard/HealthSummaryCard";
import PlanSummaryCard from "@/components/dashboard/PlanSummaryCard";
import RiskScoreCard from "@/components/RiskScoreCard";
import ScoresPendingCard from "@/components/dashboard/ScoresPendingCard";
import { useHealthEvaluation } from "@/hooks/useHealthEvaluation";
import { FEATURES } from "@/config/features";
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
import { RefreshCw, FileText, Upload, RotateCcw, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { isLoading: authLoading, user, isAuthenticated } = useAuth();
  // Fijo en "mes"/último período con datos — el selector de período se quitó
  // del UI (sin SFA en vivo no aporta). useDashboardData conserva la firma.
  const period: DashboardPeriod = "month";
  const monthOffset = 0;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const { setOpen: openUploadDrawer } = useUploadDrawer();
  const { toast } = useToast();
  const { data, isLoading } = useDashboardData(period, monthOffset);
  // Para fusionar las dos cards "Pendiente" (CMF + salud) en una sola de acción.
  // React Query dedupe: HealthSummaryCard usa el mismo hook sin costo extra.
  const health = useHealthEvaluation();

  const handleRecategorizeAll = async () => {
    setIsRecategorizing(true);
    setShowAdminMenu(false);
    toast({
      title: "Recategorizando transacciones",
      description: "Estamos actualizando las categorías con el motor más reciente.",
    });
    try {
      const result = (await apiFetch("/api/admin/recategorize", {
        method: "POST",
      })) as { updated: number; scanned?: number; version?: string };
      await queryClient.invalidateQueries();
      const updated = result?.updated ?? 0;
      const scanned = result?.scanned ?? 0;
      toast({
        title: "Categorías actualizadas",
        description:
          updated > 0
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

  // Patrimonio: se usa en la sidebar (desktop) o al final de la columna (móvil).
  const patrimonioCard =
    data?.patrimonio &&
    (data.patrimonio.totalPatrimonioNeto !== 0 ||
      data.patrimonio.inversionesLiquidas !== 0 ||
      data.patrimonio.cuentasVista !== 0 ||
      data.patrimonio.activosDeclarados !== 0) ? (
      <PatrimonioSidebar
        inversionesLiquidas={data.patrimonio.inversionesLiquidas}
        cuentasVista={data.patrimonio.cuentasVista}
        activosDeclarados={data.patrimonio.activosDeclarados}
        totalPatrimonioNeto={data.patrimonio.totalPatrimonioNeto}
      />
    ) : null;

  return (
    <ErrorBoundary fallback={dashboardFallback}>
      <div className="min-h-screen bg-background">
        {/* En desktop el panel deja la columna única de 672px y usa el ancho real:
            contenido principal + sidebar (oportunidades/patrimonio/referral). */}
        <div className="w-full max-w-2xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
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
                      <div className="fixed inset-0 z-40" onClick={() => setShowAdminMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-popover shadow-lg py-1">
                        <button
                          onClick={handleRecategorizeAll}
                          disabled={isRecategorizing}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <RotateCcw
                            className={cn("h-3 w-3", isRecategorizing && "animate-spin")}
                          />
                          {isRecategorizing ? "Recategorizando..." : "Recategorizar transacciones"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Etiqueta del período analizado. El toggle Hoy/Semana/Mes y la
                navegación de meses se quitaron: con cartolas históricas (sin SFA
                en vivo) no aportan — el detalle histórico vive en Movimientos.
                Reponer navegación cuando haya datos en tiempo real. */}
            {data?.hasData && data.periodLabel && (
              <p className="text-xs text-muted-foreground">Último período: {data.periodLabel}</p>
            )}
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
                <h3 className="font-bold text-xl mb-2 text-foreground">Sube tu primer documento</h3>
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
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
              {/* ── Columna principal ─────────────────────────────────── */}
              <div className="space-y-6 min-w-0">
                {/* ── CAPA 1: HERO ─────────────────────────────────────── */}

                {FEATURES.riskDualScore ? (
                  /* Doble evaluador de riesgo: un titular + segunda opinión (subsume hero + credit card).
                   Card grande → el tile de salud va full-width debajo. */
                  <>
                    <RiskScoreCard />
                    <HealthSummaryCard />
                  </>
                ) : (
                  <>
                    {/* Score Hero */}
                    {data.score !== null && (
                      <ScoreHero score={data.score} delta={data.scoreDelta} />
                    )}

                    {/* Crediticio (CMF) | Salud financiera. Si AMBOS están pendientes
                      (falta el informe CMF), una sola card de acción en vez de dos
                      estados vacíos grises seguidos. */}
                    {!data.creditScoreAvailable &&
                    !health.isLoading &&
                    !health.isError &&
                    health.data?.hasData === false ? (
                      <ScoresPendingCard />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <CreditScoreCard
                          score={data.creditScore}
                          available={data.creditScoreAvailable}
                          unavailableReason={data.creditScoreUnavailableReason}
                          message={data.creditScoreMessage}
                          sourceLabel={data.creditScoreSource?.label ?? null}
                          sourceUploadedAt={data.creditScoreSource?.uploadedAt ?? null}
                          delta={data.creditScoreDelta}
                          lastUpdated={data.creditScoreDate}
                        />
                        <HealthSummaryCard />
                      </div>
                    )}
                  </>
                )}

                {/* Score Breakdown — how to improve */}
                {data.score !== null && (
                  <ScoreBreakdown
                    score={data.score}
                    insights={data.scoreInsights}
                    creditScore={data.creditScore}
                    totalIncome={data.totalIncome}
                    totalExpenses={data.totalExpenses}
                    savingsNet={data.savingsNet}
                    savingsRate={data.savingsRate}
                    scoreConfidence={data.scoreConfidence}
                    scoreObservedMonths={data.scoreObservedMonths}
                  />
                )}

                {/* Balance del período */}
                {(data.totalIncome > 0 || data.totalExpenses > 0) && (
                  <AvailableCard
                    totalIncome={data.totalIncome}
                    totalExpenses={data.totalExpenses}
                    savingsGoal={data.incomeReliable ? data.savingsGoalAmount : 0}
                  />
                )}

                {/* Plan financiero — resumen 50/30/20 + metas */}
                <PlanSummaryCard />

                {/* ── ACTION CARDS — Revenue bridge (en desktop van a la sidebar) ── */}
                <div className="lg:hidden">
                  <ActionCards data={data} />
                </div>

                {/* ── CAPA 2: FLUJO DEL PERÍODO ────────────────────────── */}
                <div className="space-y-4">
                  <FlowDonut
                    segments={data.flowSegments}
                    pctIncomeSpent={data.incomeReliable ? data.pctIncomeSpent : null}
                    totalExpenses={data.totalExpenses}
                  />
                  {/* Tasa de ahorro solo con ingreso medible: con puras cartolas
                      de tarjeta mostraba "-2923%". */}
                  {data.incomeReliable ? (
                    <SavingsProgress
                      savingsNet={data.savingsNet}
                      savingsRate={data.savingsRate}
                      goalPct={data.savingsGoalPct}
                      goalAmount={data.savingsGoalAmount}
                    />
                  ) : (
                    <div className="rounded-2xl border border-border bg-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Ahorro del mes
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Para medir tu tasa de ahorro y los porcentajes del ingreso necesitamos la
                        cartola de la cuenta donde recibes tus ingresos (corriente o vista) — las
                        tarjetas de crédito solo aportan gastos.
                      </p>
                    </div>
                  )}
                </div>

                {/* Observaciones del período (incluye el insight del día) */}
                <DashboardTextInsights data={data} />

                {/* ── CAPA 3: DETALLE EXPANDIBLE ───────────────────────── */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Detalle por categoría
                  </p>
                  {data.categoryGroups.map((group) => (
                    <CategoryCard key={group.key} group={group} />
                  ))}
                </div>

                {/* ── PATRIMONIO + REFERRAL (solo móvil; en desktop, sidebar) ── */}
                {/* Los activos declarados ahora son una línea DENTRO de la card de
                    Patrimonio y están sumados al neto. */}
                {patrimonioCard && <div className="lg:hidden">{patrimonioCard}</div>}
                <div className="lg:hidden">
                  <ReferralShareCard />
                </div>
              </div>

              {/* ── Sidebar desktop: lo accionable y el contexto ──────── */}
              <aside className="hidden lg:block space-y-6 lg:sticky lg:top-20">
                <ActionCards data={data} />
                {patrimonioCard}
                <ReferralShareCard />
              </aside>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
