// ─── Dashboard Home types ───────────────────────────────────────────────────
// Strict TypeScript types for the redesigned dashboard (3-layer structure).
// All monetary values are integer CLP unless noted otherwise.

import type { LucideIcon } from "lucide-react";

/** Period selector for the dashboard hero */
export type DashboardPeriod = "today" | "week" | "month";

/** A single parsed transaction from cartola data */
export interface DashboardTransaction {
  id: string;             // "{documentUploadId}-{index}" for PATCH endpoint
  fecha: string;          // ISO date string YYYY-MM-DD
  descripcion: string;
  monto: number;          // CLP, always positive
  tipo: "ingreso" | "egreso";
  categoria: string;      // raw category from parser (alimentacion, transporte, etc.)
  isInternalTransfer?: boolean;
}

/** Subcategory within a CategoryGroup */
export interface Subcategory {
  key: string;
  label: string;
  total: number;          // CLP
  transactions: DashboardTransaction[];
}

/** One of the 5 collapsible category cards */
export interface CategoryGroup {
  key: CategoryGroupKey;
  label: string;
  icon: LucideIcon;
  color: "green" | "blue" | "purple" | "orange" | "red";
  total: number;              // CLP sum of all subcategories
  prevMonthTotal: number | null; // CLP sum from previous month (null if no data)
  pctOfIncome: number;        // 0-100
  subcategories: Subcategory[];
  /** Last 30 days of daily spending for sparkline */
  sparklineData: number[];
  /** Top 3 transactions by amount (desc) */
  topTransactions: DashboardTransaction[];
}

export type CategoryGroupKey =
  | "ingresos"
  | "esenciales"
  | "personales"
  | "ocio"
  | "financieros";

/** Donut segment for the flow chart */
export interface FlowSegment {
  key: CategoryGroupKey;
  label: string;
  value: number;          // CLP
  color: string;          // hex
}

/** A single dynamic insight generated from real data */
export interface DashboardInsight {
  type: "positive" | "warning" | "alert" | "info";
  icon: string;
  title: string;
  body: string;
}

/** Complete data shape returned by useDashboardData */
export interface DashboardData {
  /** Whether we have any cartola data at all */
  hasData: boolean;

  /** Human-readable label for the active period, e.g. "Marzo 2026" */
  periodLabel: string;

  // ── Capa 1: Hero ──
	  score: number | null;                   // 0-100 transactional score
	  scoreDelta: number | null;              // vs previous period
	  scoreMaxHistory: { date: string; score: number }[];
	  scoreInsights: string[];                // text insights from scoring engine
	  scoreConfidence: "baja" | "media" | "alta" | null;
	  scoreObservedMonths: number | null;

  // ── Credit score (CMF, 0-850) ──
  creditScore: number | null;
  creditScoreAvailable: boolean;
  creditScoreUnavailableReason: string | null;
  creditScoreMessage: string | null;
  creditScoreSource: { label: string; uploadedAt: string | null } | null;
  creditScoreDelta: number | null;
  creditScoreDate: string | null;         // ISO date of last calculation

  availableUntilEndOfMonth: number | null;  // CLP
  totalIncome: number;
  totalExpenses: number;
  projectedIncome: number;
  committedExpenses: number;
  savingsGoalAmount: number;              // default 20% of income

  insight: DashboardInsight | null;       // single rotative insight

  // ── Capa 2: Flow ──
  flowSegments: FlowSegment[];           // donut data (expense groups only)
  pctIncomeSpent: number;                // 0-100, center of donut
  savingsNet: number;                    // income - expenses
  savingsRate: number;                   // 0-100
  savingsGoalPct: number;               // 0-100 (progress toward goal)

  // ── Capa 3: Detail ──
  categoryGroups: CategoryGroup[];

  // ── Patrimonio ──
  patrimonio: {
    inversionesLiquidas: number;
    cuentasVista: number;
    totalPatrimonioNeto: number;
  } | null;

  // ── Cola de revisión de categorías ──
  /** Movimientos con categoría por revisar (mismo flag que el badge de Movimientos). */
  pendingReviewCount: number;
}
