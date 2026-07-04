import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import {
  ArrowLeftRight, Receipt, TrendingUp, TrendingDown,
  Wallet, CreditCard, PiggyBank, BarChart3, Users, Info, CheckCircle2,
} from "lucide-react";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";
import BillSplit from "@/pages/BillSplit";
import MonthlyFlowChart from "@/components/MonthlyFlowChart";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import SignInBanner from "@/components/SignInBanner";

/** "2025-06-30" → "30-06-2025" (para etiquetar el saldo al cierre de cartola). */
function fmtCartolaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TransactionSummary {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    currentBalance: number | null;
    transactionCount: number;
    documentCount: number;
  };
}

interface FinancialSummary {
  summary: {
    totalBalance: number;
    totalAssets: number;
    totalLiabilities: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    accountCount: number;
    checkingTotal?: number;
    savingsTotal?: number;
    creditCardDebt?: number;
    investmentsTotal?: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type TabId = "transacciones" | "dividir";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "transacciones", label: "Transacciones", icon: Receipt },
  { id: "dividir", label: "Dividir cuenta", icon: Users },
];

// ── Account chips ─────────────────────────────────────────────────────────────

function AccountChip({
  label,
  amount,
  icon: Icon,
  color,
  negative,
}: {
  label: string;
  amount: number;
  icon: React.ElementType;
  color: string;
  negative?: boolean;
}) {
  const sign = negative ? "-" : "";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shrink-0">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className={cn("text-sm font-semibold tabular-nums leading-none", color)}>
          {sign}{CLP.format(Math.abs(amount))}
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Movimientos() {
  const { isAuthenticated } = useAuth();
  const { openWithFilePicker } = useUploadDrawer();
  const { documents } = useUserDocuments();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialCategory = params.get("categoria") ?? undefined;
  const initialReviewOnly = params.get("revisar") === "1";
  const fromReview = params.get("review") === "1";
  const reviewDocId = params.get("documentId") ?? undefined;
  const reviewDoc = reviewDocId ? documents.find((d) => d.id === reviewDocId) : undefined;
  const initialTab = (params.get("tab") as TabId | null) ?? "transacciones";

  const markReviewed = useMutation({
    mutationFn: () =>
      apiFetch(`/api/user/documents/${reviewDocId}/review`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      toast({ title: "Movimientos marcados como revisados" });
    },
    onError: () => {
      toast({
        title: "No pudimos marcar como revisado",
        description: "Inténtalo nuevamente en unos segundos.",
        variant: "destructive",
      });
    },
  });

  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "transacciones",
  );

  // Keep URL in sync when switching tabs
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeTab === "transacciones") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", activeTab);
    }
    window.history.replaceState(null, "", url.toString());
  }, [activeTab]);

  // Upload trigger from child table buttons
  useEffect(() => {
    const handle = () => openWithFilePicker();
    window.addEventListener("trigger-cartola-upload", handle);
    return () => window.removeEventListener("trigger-cartola-upload", handle);
  }, [openWithFilePicker]);

  const { data: txSummary, isLoading: loadingTx } = useQuery<TransactionSummary>({
    queryKey: ["/api/transactions/summary"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/transactions/summary");
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: financial } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/financial-summary");
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
        <SignInBanner
          title="Inicia sesión para ver tus movimientos"
          description="Conecta tus cuentas o sube cartolas para ver todos tus movimientos en un solo lugar."
          actionText="Iniciar sesión"
        />
      </div>
    );
  }

  const s = txSummary?.summary;
  const f = financial?.summary;

  // El "saldo actual" del backend es en realidad el saldo al CIERRE de la última
  // cartola subida (getReportedBalance, ordenado por fecha de subida desc). Tomamos
  // esa misma cartola para fechar la etiqueta y no inducir a error con datos viejos.
  const latestCartola = [...documents]
    .filter((d) => d.tipo === "cartola")
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
  const balanceAsOf = latestCartola?.periodoHasta ?? latestCartola?.periodoDesde ?? null;
  const balanceLabel = balanceAsOf
    ? `Saldo al cierre · ${fmtCartolaDate(balanceAsOf)}`
    : "Saldo al cierre de cartola";

  // Account chips: pull from financial-summary if available, fall back to tx summary
  const hasAccounts = f && (f.checkingTotal || f.savingsTotal || f.creditCardDebt || f.investmentsTotal);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <PastelIcon icon={ArrowLeftRight} color="blue" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
            <p className="text-sm text-muted-foreground">
              Transacciones, cuentas y gastos compartidos
            </p>
          </div>
        </div>

        {/* Aviso de revisión cuando se llega desde la subida de cartola */}
        {fromReview && reviewDoc?.reviewStatus === "reviewed" ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">Movimientos revisados.</span>{" "}
              Esta importación ya fue marcada como revisada.
            </p>
          </div>
        ) : fromReview ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-snug">
                <span className="font-medium text-foreground">Revisa los movimientos importados.</span>{" "}
                Confirma que las fechas, montos y descripciones estén correctos. Si algo se ve raro,
                puedes eliminar el documento y subir una cartola digital directamente desde tu banco.
              </p>
              {reviewDoc?.reviewStatus === "required" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1.5"
                  onClick={() => markReviewed.mutate()}
                  disabled={markReviewed.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Marcar como revisado
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {/* Account chips */}
        {loadingTx && !s ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-36 rounded-xl shrink-0" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {hasAccounts ? (
              <>
                {(f!.checkingTotal ?? 0) > 0 && (
                  <AccountChip label="Cuenta corriente" amount={f!.checkingTotal!} icon={Wallet} color="text-blue-600 dark:text-blue-400" />
                )}
                {(f!.savingsTotal ?? 0) > 0 && (
                  <AccountChip label="Ahorro" amount={f!.savingsTotal!} icon={PiggyBank} color="text-emerald-600 dark:text-emerald-400" />
                )}
                {(f!.investmentsTotal ?? 0) > 0 && (
                  <AccountChip label="Inversiones" amount={f!.investmentsTotal!} icon={BarChart3} color="text-violet-600 dark:text-violet-400" />
                )}
                {(f!.creditCardDebt ?? 0) > 0 && (
                  <AccountChip label="Tarjeta crédito" amount={f!.creditCardDebt!} icon={CreditCard} color="text-red-500 dark:text-red-400" negative />
                )}
              </>
            ) : s && s.transactionCount > 0 ? (
              <>
                <AccountChip label="Ingresos" amount={s.totalIncome} icon={TrendingUp} color="text-emerald-600 dark:text-emerald-400" />
                <AccountChip label="Egresos" amount={s.totalExpenses} icon={TrendingDown} color="text-red-500 dark:text-red-400" negative />
                {s.currentBalance !== null && (
                  <AccountChip
                    label={balanceLabel}
                    amount={s.currentBalance}
                    icon={Wallet}
                    color={s.currentBalance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-500"}
                  />
                )}
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{s.transactionCount} transacciones</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {s.documentCount} cartola{s.documentCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Monthly flow chart — visible only on transacciones tab */}
        {activeTab === "transacciones" && <MonthlyFlowChart />}

        {/* Tab content */}
        {activeTab === "transacciones" && (
          <ParsedTransactionsTable mode="movimientos" initialCategory={initialCategory} initialReviewOnly={initialReviewOnly} />
        )}

        {activeTab === "dividir" && (
          <BillSplit embedded />
        )}
      </div>
    </div>
  );
}
