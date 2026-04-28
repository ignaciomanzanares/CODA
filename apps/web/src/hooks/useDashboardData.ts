// ─── useDashboardData ───────────────────────────────────────────────────────
// Composes existing cartola-based API endpoints into DashboardData.
//
// Data reality (pre-open-banking):
// - All financial data comes from user-uploaded cartolas (PDF bank statements)
// - /api/transactions/parsed returns normalized transactions from cartolas
//   with SIGNED monto (negative = egreso) and tipo: 'ingreso'|'egreso'
// - /api/transactions/summary returns aggregated totals from cartolas
// - /api/transactions/insights returns smart insights from cartolas
// - /api/transactional-score returns 0-100 score computed from cartolas
// - /api/score-history returns credit_score_history entries (mixed maxScore)
// - /api/financial-summary returns account balances (empty when no open banking)
//
// NO demo data. Returns hasData: false when no cartolas exist.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { getPersonalToken, useAuth } from "@/lib/auth";
import {
  CATEGORY_TAXONOMY,
  resolveGroupKey,
  categoryLabel,
  getTaxonomyEntry,
} from "@/lib/categoryTaxonomy";
import type {
  DashboardPeriod,
  DashboardData,
  DashboardTransaction,
  CategoryGroup,
  CategoryGroupKey,
  FlowSegment,
  Subcategory,
  DashboardInsight,
} from "@/types/dashboard";

// ── Raw API response shapes (matching actual backend responses) ─────────────

interface RawParsedTx {
  id: string;
  fecha: string;           // YYYY-MM-DD
  descripcion: string;
  monto: number;           // SIGNED: positive = ingreso, negative = egreso
  tipo: "ingreso" | "egreso";
  saldo: number | null;
  banco: string | null;
  categoria: string;
}

interface RawParsedResponse {
  transactions: RawParsedTx[];
  count: number;
}

interface RawSummary {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    currentBalance: number | null;
    transactionCount: number;
    documentCount: number;
    avgMonthlyIncome: number;
    avgMonthlyExpenses: number;
  };
  categoryBreakdown: Record<string, { count: number; total: number }>;
  monthlyData: { month: string; income: number; expenses: number }[];
}

interface RawInsights {
  spendingByCategory: { categoria: string; total: number; pct: number }[];
  insights: DashboardInsight[];
  totalEgresos: number;
  totalIngresos: number;
}

interface RawScoreResult {
  transactionalScore: number | null;
  mainInsights?: string[];
  metrics?: Record<string, number | boolean | undefined>;
  lastUpdated?: string;
}

interface RawScoreHistoryEntry {
  id: number;
  score: number;
  maxScore: number;
  calculatedAt: string;
}

interface RawCreditScore {
  score: number | null;
  maxScore: number;
  paymentHistory: string;
  utilization: string;
  ageOfCredit: string;
}

interface RawFinancialSummary {
  summary: {
    totalBalance: number;
    netWorth: number;
    accountCount: number;
  };
  accountsByType: {
    checking: { count: number; total: number };
    savings: { count: number; total: number };
    investments: { count: number; total: number };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T | null> {
  const token = getPersonalToken();
  if (!token) return null;
  try {
    return await apiFetch(path, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
}

/** Convert a raw parsed transaction (signed monto) to our dashboard format (unsigned) */
function toDisplayTx(raw: RawParsedTx): DashboardTransaction {
  return {
    id: raw.id,
    fecha: raw.fecha,
    descripcion: raw.descripcion,
    monto: Math.abs(raw.monto), // Always positive — tipo indicates direction
    tipo: raw.tipo,
    categoria: raw.categoria || "otro",
  };
}

/**
 * Find all distinct months that have transaction data, sorted newest first.
 */
function findDataMonths(txs: DashboardTransaction[]): { year: number; month: number }[] {
  const set = new Set<string>();
  for (const tx of txs) {
    const d = new Date(tx.fecha + "T12:00:00");
    set.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return [...set]
    .map((s) => {
      const [y, m] = s.split("-").map(Number);
      return { year: y, month: m };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

interface PeriodResult {
  filtered: DashboardTransaction[];
  label: string;
  /** How many distinct months of data exist (for navigation bounds) */
  totalMonths: number;
}

/**
 * Filter transactions by period relative to the DATA's date range, not today.
 * "Mes" = month at `monthOffset` from latest (0 = latest, -1 = previous…).
 * "Semana" = last 7 days of data.
 * "Hoy" = last day of data.
 */
function filterByPeriod(
  txs: DashboardTransaction[],
  period: DashboardPeriod,
  monthOffset: number = 0,
): PeriodResult {
  if (txs.length === 0) return { filtered: [], label: "", totalMonths: 0 };

  const dataMonths = findDataMonths(txs); // sorted newest-first
  const totalMonths = dataMonths.length;

  switch (period) {
    case "month": {
      // monthOffset: 0 = latest, -1 = one month back, etc.
      const idx = Math.min(Math.abs(monthOffset), totalMonths - 1);
      const target = dataMonths[idx];
      const monthStart = `${target.year}-${String(target.month + 1).padStart(2, "0")}-01`;
      const endDate = new Date(target.year, target.month + 1, 0);
      const monthEnd = endDate.toISOString().slice(0, 10);
      const filtered = txs.filter((t) => t.fecha >= monthStart && t.fecha <= monthEnd);
      const label = new Date(target.year, target.month, 15)
        .toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      return { filtered, label: label.charAt(0).toUpperCase() + label.slice(1), totalMonths };
    }
    case "week": {
      let latestDate = txs[0].fecha;
      for (const tx of txs) {
        if (tx.fecha > latestDate) latestDate = tx.fecha;
      }
      const end = new Date(latestDate + "T12:00:00");
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const startStr = start.toISOString().slice(0, 10);
      const filtered = txs.filter((t) => t.fecha >= startStr && t.fecha <= latestDate);
      const fmtShort = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
      return { filtered, label: `${fmtShort(start)} – ${fmtShort(end)}`, totalMonths };
    }
    case "today": {
      let latestDate = txs[0].fecha;
      for (const tx of txs) {
        if (tx.fecha > latestDate) latestDate = tx.fecha;
      }
      const filtered = txs.filter((t) => t.fecha === latestDate);
      const d = new Date(latestDate + "T12:00:00");
      const label = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
      return { filtered, label: label.charAt(0).toUpperCase() + label.slice(1), totalMonths };
    }
    default:
      return { filtered: txs, label: "", totalMonths };
  }
}

/** Build sparkline: daily totals for last 30 days (or last 30 days of data) */
function buildSparkline(txs: DashboardTransaction[]): number[] {
  if (txs.length === 0) return [];
  const now = new Date();
  const days = new Array<number>(30).fill(0);
  for (const tx of txs) {
    if (tx.tipo !== "egreso") continue;
    const txDate = new Date(tx.fecha + "T12:00:00");
    const daysAgo = Math.floor((now.getTime() - txDate.getTime()) / 86400000);
    if (daysAgo >= 0 && daysAgo < 30) {
      days[29 - daysAgo] += tx.monto;
    }
  }
  return days;
}

/**
 * Pick the most relevant insight to show.
 * Priority: alert > warning > info > positive.
 * Within the same priority, rotate by hour so the user sees different
 * insights throughout the day (not the same one all day).
 */
function pickInsight(insights: DashboardInsight[]): DashboardInsight | null {
  if (!insights.length) return null;

  const priority: Record<string, number> = {
    alert: 0,
    warning: 1,
    info: 2,
    positive: 3,
  };

  // Sort by priority (most urgent first)
  const sorted = [...insights].sort(
    (a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9),
  );

  // Pick from the top-priority group, rotating by hour
  const topType = sorted[0].type;
  const topGroup = sorted.filter((i) => i.type === topType);
  return topGroup[new Date().getHours() % topGroup.length];
}

// ── Main Hook ───────────────────────────────────────────────────────────────

export function useDashboardData(period: DashboardPeriod = "month", monthOffset: number = 0): {
  data: DashboardData | null;
  isLoading: boolean;
  error: Error | null;
  /** Number of distinct months with data (for navigation bounds) */
  totalMonths: number;
} {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const enabled = isAuthenticated && !authLoading;

  // Fetch all APIs in parallel
  const parsedTx = useQuery<RawParsedResponse | null>({
    queryKey: ["/api/transactions/parsed"],
    queryFn: () => fetchJson<RawParsedResponse>("/api/transactions/parsed"),
    enabled,
    staleTime: 60_000,
  });

  const summary = useQuery<RawSummary | null>({
    queryKey: ["/api/transactions/summary"],
    queryFn: () => fetchJson<RawSummary>("/api/transactions/summary"),
    enabled,
    staleTime: 60_000,
  });

  const insights = useQuery<RawInsights | null>({
    queryKey: ["/api/transactions/insights"],
    queryFn: () => fetchJson<RawInsights>("/api/transactions/insights"),
    enabled,
    staleTime: 60_000,
  });

  const score = useQuery<RawScoreResult | null>({
    queryKey: ["/api/transactional-score"],
    queryFn: () => fetchJson<RawScoreResult>("/api/transactional-score"),
    enabled,
    staleTime: 120_000,
    retry: false,
  });

  const scoreHistory = useQuery<{ history: RawScoreHistoryEntry[] } | null>({
    queryKey: ["/api/score-history"],
    queryFn: () => fetchJson<{ history: RawScoreHistoryEntry[] }>("/api/score-history"),
    enabled,
    staleTime: 120_000,
  });

  const creditScoreQuery = useQuery<RawCreditScore | null>({
    queryKey: ["/api/credit-score"],
    queryFn: () => fetchJson<RawCreditScore>("/api/credit-score"),
    enabled,
    staleTime: 120_000,
  });

  const financialSummary = useQuery<RawFinancialSummary | null>({
    queryKey: ["financial-summary"],
    queryFn: () => fetchJson<RawFinancialSummary>("/api/financial-summary"),
    enabled,
    staleTime: 60_000,
  });

  const isLoading = parsedTx.isLoading || summary.isLoading || score.isLoading;
  const error = parsedTx.error || summary.error || score.error;

  // ── Build empty state ──────────────────────────────────────────────────
  if (isLoading || !enabled) {
    return { data: null, isLoading: true, error: null, totalMonths: 0 };
  }

  const docCount = summary.data?.summary?.documentCount ?? 0;
  const hasData = docCount > 0;

  if (!hasData) {
    return {
      data: {
        hasData: false,
        periodLabel: "",
        score: null,
        scoreDelta: null,
        scoreMaxHistory: [],
        creditScore: null,
        creditScoreDelta: null,
        creditScoreDate: null,
        availableUntilEndOfMonth: null,
        totalIncome: 0,
        totalExpenses: 0,
        projectedIncome: 0,
        committedExpenses: 0,
        savingsGoalAmount: 0,
        insight: null,
        flowSegments: [],
        pctIncomeSpent: 0,
        savingsNet: 0,
        savingsRate: 0,
        savingsGoalPct: 0,
        categoryGroups: [],
        patrimonio: null,
      },
      isLoading: false,
      error: null,
      totalMonths: 0,
    };
  }

  // ── Parse transactions ─────────────────────────────────────────────────
  const rawTxList = parsedTx.data?.transactions ?? [];
  const allTx = rawTxList.map(toDisplayTx);
  const { filtered: periodTx, label: periodLabel, totalMonths } = filterByPeriod(allTx, period, monthOffset);

  // ── Capa 1: Hero ──────────────────────────────────────────────────────

  const totalIncome = periodTx
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + t.monto, 0);
  const totalExpenses = periodTx
    .filter((t) => t.tipo === "egreso")
    .reduce((s, t) => s + t.monto, 0);

  // For "available until end of month": use this period's actual data.
  // With cartolas only (no live balance), this is an approximation.
  const projectedIncome = totalIncome;
  const committedExpenses = totalExpenses;
  const SAVINGS_GOAL_RATE = 20;
  const savingsGoalAmount = Math.round(projectedIncome * (SAVINGS_GOAL_RATE / 100));
  const availableRaw = projectedIncome - committedExpenses - savingsGoalAmount;
  const availableUntilEndOfMonth = Math.max(0, availableRaw);

  // ── Score (transactional only, 0-100) ──────────────────────────────────
  const currentScore = score.data?.transactionalScore ?? null;

  // Delta: only compare against OTHER transactional score entries (maxScore=100).
  // The credit_score_history table mixes both transactional (max=100) and
  // credit (max=850) entries. Comparing across types gives nonsense like -751.
  const allHistory = scoreHistory.data?.history ?? [];
  const transactionalHistory = allHistory
    .filter((h) => h.maxScore === 100)
    .sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt));

  let scoreDelta: number | null = null;
  if (currentScore !== null && transactionalHistory.length >= 2) {
    // Compare current score to the second-to-last entry
    const previous = transactionalHistory[transactionalHistory.length - 2];
    scoreDelta = currentScore - previous.score;
  }

  const scoreMaxHistory = transactionalHistory.map((h) => ({
    date: h.calculatedAt,
    score: h.score,
  }));

  // ── Credit score (CMF, from /api/credit-score, separate table) ──────
  const creditScore = creditScoreQuery.data?.score ?? null;
  // No delta available from this endpoint (single row per user, no history)
  const creditScoreDelta: number | null = null;
  const creditScoreDate: string | null = null;

  // ── Insight ────────────────────────────────────────────────────────────
  const allInsights = insights.data?.insights ?? [];
  const insight = pickInsight(allInsights);

  // ── Capa 2: Flow ──────────────────────────────────────────────────────

  const expenseTx = periodTx.filter((t) => t.tipo === "egreso");

  // Group expense transactions by taxonomy group
  const groupedExpenses = new Map<CategoryGroupKey, DashboardTransaction[]>();
  for (const tx of expenseTx) {
    const gk = resolveGroupKey(tx.categoria);
    if (gk === "ingresos") continue;
    const arr = groupedExpenses.get(gk) ?? [];
    arr.push(tx);
    groupedExpenses.set(gk, arr);
  }

  const flowSegments: FlowSegment[] = [];
  for (const entry of CATEGORY_TAXONOMY) {
    if (entry.key === "ingresos") continue;
    const txs = groupedExpenses.get(entry.key) ?? [];
    const value = txs.reduce((s, t) => s + t.monto, 0);
    if (value > 0) {
      flowSegments.push({
        key: entry.key,
        label: entry.label,
        value,
        color: entry.chartColor,
      });
    }
  }

  const pctIncomeSpent =
    totalIncome > 0 ? Math.min(999, Math.round((totalExpenses / totalIncome) * 100)) : 0;
  const savingsNet = totalIncome - totalExpenses;
  const savingsRate =
    totalIncome > 0 ? Math.round((savingsNet / totalIncome) * 100) : 0;
  const savingsGoalProgress =
    savingsGoalAmount > 0
      ? Math.min(100, Math.round((Math.max(0, savingsNet) / savingsGoalAmount) * 100))
      : 0;

  // ── Capa 3: Category Groups ───────────────────────────────────────────

  // Previous month data for month-over-month comparison
  const prevMonthResult = period === "month" && totalMonths > 1
    ? filterByPeriod(allTx, "month", monthOffset - 1)
    : null;
  const prevMonthTx = prevMonthResult?.filtered ?? [];

  // Group previous month expenses by taxonomy group
  const prevGroupedExpenses = new Map<CategoryGroupKey, number>();
  for (const tx of prevMonthTx) {
    if (tx.tipo !== "egreso") continue;
    const gk = resolveGroupKey(tx.categoria);
    if (gk === "ingresos") continue;
    prevGroupedExpenses.set(gk, (prevGroupedExpenses.get(gk) ?? 0) + tx.monto);
  }
  // Previous month income total
  const prevMonthIncome = prevMonthTx
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + t.monto, 0);

  const incomeTx = periodTx.filter((t) => t.tipo === "ingreso");

  function buildCategoryGroup(key: CategoryGroupKey): CategoryGroup {
    const entry = getTaxonomyEntry(key);
    const txs = key === "ingresos" ? incomeTx : (groupedExpenses.get(key) ?? []);
    const total = txs.reduce((s, t) => s + t.monto, 0);

    // Previous month total for comparison
    const prevMonthTotal = prevMonthTx.length > 0
      ? (key === "ingresos" ? prevMonthIncome : (prevGroupedExpenses.get(key) ?? 0))
      : null;

    // Subcategories
    const subMap = new Map<string, DashboardTransaction[]>();
    for (const tx of txs) {
      const arr = subMap.get(tx.categoria) ?? [];
      arr.push(tx);
      subMap.set(tx.categoria, arr);
    }

    const subcategories: Subcategory[] = [...subMap.entries()]
      .map(([cat, catTxs]) => ({
        key: cat,
        label: categoryLabel(cat),
        total: catTxs.reduce((s, t) => s + t.monto, 0),
        transactions: catTxs.sort((a, b) => b.monto - a.monto),
      }))
      .sort((a, b) => b.total - a.total);

    const topTransactions = [...txs].sort((a, b) => b.monto - a.monto).slice(0, 3);

    // Sparkline from ALL transactions (not just period-filtered)
    const allGroupTx =
      key === "ingresos"
        ? allTx.filter((t) => t.tipo === "ingreso")
        : allTx.filter(
            (t) => t.tipo === "egreso" && resolveGroupKey(t.categoria) === key,
          );
    const sparklineData = buildSparkline(allGroupTx);

    return {
      key,
      label: entry.label,
      icon: entry.icon,
      color: entry.color,
      total,
      prevMonthTotal,
      pctOfIncome: totalIncome > 0 ? Math.round((total / totalIncome) * 100) : 0,
      subcategories,
      sparklineData,
      topTransactions,
    };
  }

  const categoryGroups = CATEGORY_TAXONOMY.map((e) => buildCategoryGroup(e.key));

  // ── Patrimonio ────────────────────────────────────────────────────────
  // Only show patrimonio when user has linked bank accounts (open banking).
  // With cartola-only data, the "patrimonio neto" is just the saldo final
  // from the last cartola — showing it separately with $0 inversiones/$0
  // cuentas is misleading and useless.
  const fs = financialSummary.data;
  const hasLinkedAccounts = (fs?.summary?.accountCount ?? 0) > 0;
  const patrimonio = hasLinkedAccounts && fs
    ? {
        inversionesLiquidas: fs.accountsByType?.investments?.total ?? 0,
        cuentasVista:
          (fs.accountsByType?.checking?.total ?? 0) +
          (fs.accountsByType?.savings?.total ?? 0),
        totalPatrimonioNeto: fs.summary?.netWorth ?? 0,
      }
    : null;

  return {
    data: {
      hasData: true,
      periodLabel,
      score: currentScore,
      scoreDelta,
      scoreMaxHistory,
      creditScore,
      creditScoreDelta,
      creditScoreDate,
      availableUntilEndOfMonth,
      totalIncome,
      totalExpenses,
      projectedIncome,
      committedExpenses,
      savingsGoalAmount,
      insight,
      flowSegments,
      pctIncomeSpent,
      savingsNet,
      savingsRate,
      savingsGoalPct: savingsGoalProgress,
      categoryGroups,
      patrimonio,
    },
    isLoading: false,
    error: error as Error | null,
    totalMonths,
  };
}
