/**
 * Core Finance Types
 *
 * Type definitions for the finance engine.
 */

// =============================================================================
// CASH MANAGEMENT
// =============================================================================

export interface CashPosition {
  date: string; // YYYY-MM-DD
  totalBalance: number;
  byAccount: AccountBalance[];
  currency: string;
}

export interface AccountBalance {
  accountId: number;
  bankName: string;
  accountType: string;
  balance: number;
  lastUpdated: string;
}

export interface CashForecast {
  date: string;
  projectedBalance: number;
  expectedInflows: number;
  expectedOutflows: number;
  confidence: number; // 0-1
}

// =============================================================================
// RECONCILIATION
// =============================================================================

export interface ReconciliationMatch {
  bankTransactionId: number;
  dteDocumentId: number;
  score: number; // 0-100
  matchType: "exact" | "fuzzy" | "manual";
  matchedFields: string[];
  amountDifference: number;
  status: "proposed" | "confirmed" | "rejected";
}

export interface ReconciliationResult {
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  matches: ReconciliationMatch[];
  unmatchedTransactions: number[];
  unmatchedDocuments: number[];
  matchRate: number; // percentage
}

// =============================================================================
// FINANCIAL STATEMENTS
// =============================================================================

export interface IncomeStatement {
  periodStart: string;
  periodEnd: string;
  revenue: LineItem[];
  costOfSales: LineItem[];
  grossProfit: number;
  operatingExpenses: LineItem[];
  operatingIncome: number;
  otherIncome: LineItem[];
  otherExpenses: LineItem[];
  incomeBeforeTax: number;
  taxExpense: number;
  netIncome: number;
}

export interface LineItem {
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operatingActivities: CashFlowSection;
  investingActivities: CashFlowSection;
  financingActivities: CashFlowSection;
  netCashChange: number;
  beginningCash: number;
  endingCash: number;
}

export interface CashFlowSection {
  items: LineItem[];
  total: number;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

export interface BalanceSheetSection {
  current: LineItem[];
  nonCurrent: LineItem[];
  totalCurrent: number;
  totalNonCurrent: number;
  total: number;
}

// =============================================================================
// LEDGER / JOURNAL ENTRIES
// =============================================================================

export interface JournalEntry {
  id?: number;
  companyId: number;
  entryDate: string;
  description: string;
  reference: string | null;
  sourceType: "bank" | "dte" | "manual" | "adjustment";
  sourceId: number | null;
  lines: JournalLine[];
  isPosted: boolean;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

// =============================================================================
// CFO METRICS
// =============================================================================

export interface CFOMetrics {
  cashPosition: number;
  burnRate: number;
  runway: number; // months
  receivablesDays: number;
  payablesDays: number;
  workingCapital: number;
  currentRatio: number;
  quickRatio: number;
}
