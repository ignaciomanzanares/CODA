/**
 * @finhealth-empresas/core-finance
 *
 * Core finance engine for SME financial management.
 * Provides:
 * - Cash management and forecasting
 * - Bank-to-invoice reconciliation
 * - Financial statement generation
 * - General ledger operations
 */

// Types
export * from "./types.js";

// Cash Management
export {
  calculateCashPosition,
  calculateDailyCashPositions,
  generateCashForecast,
  calculateCFOMetrics,
  type BankAccountInput,
  type BankTransactionInput,
  type BalanceSnapshotInput,
} from "./cash/cashService.js";

// Reconciliation
export {
  reconcile,
  confirmMatch,
  rejectMatch,
  type BankTransactionForMatch,
  type DTEDocumentForMatch,
} from "./reconciliation/matchEngine.js";

export {
  scoreMatch,
  scoreAmount,
  scoreDate,
  scoreRut,
  scoreReference,
  type MatchCandidate,
  type ScoringOptions,
  type MatchScore,
} from "./reconciliation/scoring.js";

// Financial Statements
export { generateIncomeStatement, type JournalEntryInput } from "./statements/incomeStatement.js";

export {
  generateCashFlowStatement,
  type CashTransactionInput,
  type CashFlowOptions,
} from "./statements/cashFlow.js";

export { generateBalanceSheet, type AccountBalanceInput } from "./statements/balanceSheet.js";

// Ledger
export {
  validateJournalEntry,
  createEntryFromBankTransaction,
  createEntryFromDTE,
  calculateAccountBalances,
  getTrialBalance,
  DEFAULT_CHART_OF_ACCOUNTS,
  type ChartOfAccountsEntry,
} from "./ledger/ledgerService.js";
