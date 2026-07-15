/**
 * Cash Service
 *
 * Manages daily cash position and forecasting.
 * Aggregates balances across all bank accounts.
 *
 * ASSUMPTIONS:
 * - All amounts in CLP
 * - Daily granularity for cash tracking
 * - Forecast based on historical patterns + known obligations
 */

import type { CashPosition, AccountBalance, CashForecast, CFOMetrics } from "../types.js";

// =============================================================================
// TYPES FOR DATABASE INPUT
// =============================================================================

export interface BankAccountInput {
  id: number;
  bankName: string;
  accountType: string;
  currentBalance: number;
  lastSynced: string | null;
}

export interface BankTransactionInput {
  id: number;
  transactionDate: string;
  amount: number;
  transactionType: string;
}

export interface BalanceSnapshotInput {
  date: string;
  balance: number;
  bankAccountId: number;
}

// =============================================================================
// CASH POSITION
// =============================================================================

/**
 * Calculate current cash position across all accounts
 */
export function calculateCashPosition(
  accounts: BankAccountInput[],
  asOfDate: string = new Date().toISOString().split("T")[0],
): CashPosition {
  const accountBalances: AccountBalance[] = accounts.map((acc) => ({
    accountId: acc.id,
    bankName: acc.bankName,
    accountType: acc.accountType,
    balance: acc.currentBalance,
    lastUpdated: acc.lastSynced || asOfDate,
  }));

  const totalBalance = accountBalances.reduce((sum, acc) => sum + acc.balance, 0);

  return {
    date: asOfDate,
    totalBalance,
    byAccount: accountBalances,
    currency: "CLP",
  };
}

/**
 * Calculate daily cash positions from balance snapshots
 */
export function calculateDailyCashPositions(
  snapshots: BalanceSnapshotInput[],
  accounts: BankAccountInput[],
): CashPosition[] {
  // Group snapshots by date
  const byDate = new Map<string, BalanceSnapshotInput[]>();

  for (const snapshot of snapshots) {
    const existing = byDate.get(snapshot.date) || [];
    existing.push(snapshot);
    byDate.set(snapshot.date, existing);
  }

  // Build account lookup
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Calculate position for each date
  const positions: CashPosition[] = [];

  for (const [date, dateSnapshots] of byDate) {
    const accountBalances: AccountBalance[] = dateSnapshots.map((snap) => {
      const account = accountMap.get(snap.bankAccountId);
      return {
        accountId: snap.bankAccountId,
        bankName: account?.bankName || "Unknown",
        accountType: account?.accountType || "Unknown",
        balance: snap.balance,
        lastUpdated: date,
      };
    });

    positions.push({
      date,
      totalBalance: accountBalances.reduce((sum, acc) => sum + acc.balance, 0),
      byAccount: accountBalances,
      currency: "CLP",
    });
  }

  // Sort by date
  return positions.sort((a, b) => a.date.localeCompare(b.date));
}

// =============================================================================
// CASH FORECASTING
// =============================================================================

/**
 * Generate cash flow forecast based on historical transactions and known obligations
 */
export function generateCashForecast(
  currentBalance: number,
  historicalTransactions: BankTransactionInput[],
  daysAhead: number = 30,
): CashForecast[] {
  // Calculate average daily cash flows
  const { avgDailyInflow, avgDailyOutflow } = calculateAverageDailyFlows(historicalTransactions);

  const forecasts: CashForecast[] = [];
  let projectedBalance = currentBalance;
  const today = new Date();

  for (let i = 1; i <= daysAhead; i++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + i);

    // Simple projection with decreasing confidence
    const expectedInflows = avgDailyInflow;
    const expectedOutflows = avgDailyOutflow;
    const netChange = expectedInflows - expectedOutflows;

    projectedBalance += netChange;

    // Confidence decreases further into the future
    const confidence = Math.max(0.3, 1 - (i / daysAhead) * 0.7);

    forecasts.push({
      date: forecastDate.toISOString().split("T")[0],
      projectedBalance: Math.round(projectedBalance),
      expectedInflows: Math.round(expectedInflows),
      expectedOutflows: Math.round(expectedOutflows),
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return forecasts;
}

/**
 * Calculate average daily inflows and outflows from historical transactions
 */
function calculateAverageDailyFlows(transactions: BankTransactionInput[]): {
  avgDailyInflow: number;
  avgDailyOutflow: number;
} {
  if (transactions.length === 0) {
    return { avgDailyInflow: 0, avgDailyOutflow: 0 };
  }

  // Group by date
  const byDate = new Map<string, { inflows: number; outflows: number }>();

  for (const txn of transactions) {
    const date = txn.transactionDate;
    const existing = byDate.get(date) || { inflows: 0, outflows: 0 };

    if (txn.amount > 0) {
      existing.inflows += txn.amount;
    } else {
      existing.outflows += Math.abs(txn.amount);
    }

    byDate.set(date, existing);
  }

  const days = byDate.size || 1;
  let totalInflows = 0;
  let totalOutflows = 0;

  for (const { inflows, outflows } of byDate.values()) {
    totalInflows += inflows;
    totalOutflows += outflows;
  }

  return {
    avgDailyInflow: totalInflows / days,
    avgDailyOutflow: totalOutflows / days,
  };
}

// =============================================================================
// CFO METRICS
// =============================================================================

/**
 * Calculate key CFO metrics
 */
export function calculateCFOMetrics(
  cashPosition: number,
  transactions: BankTransactionInput[],
  receivables: number,
  payables: number,
  monthlyRevenue: number,
): CFOMetrics {
  // Calculate burn rate (average monthly net outflow)
  const { avgDailyInflow, avgDailyOutflow } = calculateAverageDailyFlows(transactions);
  const monthlyBurn = (avgDailyOutflow - avgDailyInflow) * 30;
  const burnRate = Math.max(0, monthlyBurn);

  // Runway in months
  const runway = burnRate > 0 ? cashPosition / burnRate : 999;

  // Days calculations (simplified)
  const dailyRevenue = monthlyRevenue / 30;
  const dailyExpenses = avgDailyOutflow || 1;

  const receivablesDays = dailyRevenue > 0 ? receivables / dailyRevenue : 0;
  const payablesDays = dailyExpenses > 0 ? payables / dailyExpenses : 0;

  // Working capital
  const currentAssets = cashPosition + receivables;
  const currentLiabilities = payables || 1;
  const workingCapital = currentAssets - currentLiabilities;

  // Ratios
  const currentRatio = currentAssets / currentLiabilities;
  const quickRatio = cashPosition / currentLiabilities;

  return {
    cashPosition,
    burnRate: Math.round(burnRate),
    runway: Math.round(runway * 10) / 10,
    receivablesDays: Math.round(receivablesDays),
    payablesDays: Math.round(payablesDays),
    workingCapital: Math.round(workingCapital),
    currentRatio: Math.round(currentRatio * 100) / 100,
    quickRatio: Math.round(quickRatio * 100) / 100,
  };
}
