/**
 * Income Statement Generator
 * 
 * Generates income statements from journal entries.
 * Groups by revenue, cost of sales, and operating expenses.
 * 
 * ASSUMPTIONS:
 * - Chilean IFRS-based chart of accounts
 * - Account codes:
 *   - 4xxx: Revenue
 *   - 5xxx: Cost of Sales
 *   - 6xxx: Operating Expenses
 *   - 7xxx: Other Income
 *   - 8xxx: Other Expenses
 *   - 9xxx: Taxes
 */

import type { IncomeStatement, LineItem } from '../types.js';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface JournalEntryInput {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  entryDate: string;
}

// =============================================================================
// INCOME STATEMENT GENERATION
// =============================================================================

/**
 * Generate income statement from journal entries
 */
export function generateIncomeStatement(
  entries: JournalEntryInput[],
  periodStart: string,
  periodEnd: string
): IncomeStatement {
  // Filter entries by period
  const periodEntries = entries.filter(e => 
    e.entryDate >= periodStart && e.entryDate <= periodEnd
  );

  // Group entries by account type
  const revenue = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('4')),
    'credit' // Revenue is credit
  );

  const costOfSales = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('5')),
    'debit' // COGS is debit
  );

  const operatingExpenses = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('6')),
    'debit' // Expenses are debit
  );

  const otherIncome = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('7')),
    'credit'
  );

  const otherExpenses = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('8')),
    'debit'
  );

  const taxEntries = aggregateByAccount(
    periodEntries.filter(e => e.accountCode.startsWith('9')),
    'debit'
  );

  // Calculate totals
  const totalRevenue = sumLineItems(revenue);
  const totalCOGS = sumLineItems(costOfSales);
  const grossProfit = totalRevenue - totalCOGS;

  const totalOpex = sumLineItems(operatingExpenses);
  const operatingIncome = grossProfit - totalOpex;

  const totalOtherIncome = sumLineItems(otherIncome);
  const totalOtherExpenses = sumLineItems(otherExpenses);
  const incomeBeforeTax = operatingIncome + totalOtherIncome - totalOtherExpenses;

  const taxExpense = sumLineItems(taxEntries);
  const netIncome = incomeBeforeTax - taxExpense;

  return {
    periodStart,
    periodEnd,
    revenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    otherIncome,
    otherExpenses,
    incomeBeforeTax,
    taxExpense,
    netIncome,
  };
}

/**
 * Aggregate entries by account
 */
function aggregateByAccount(
  entries: JournalEntryInput[],
  amountType: 'debit' | 'credit'
): LineItem[] {
  const byAccount = new Map<string, { name: string; amount: number }>();

  for (const entry of entries) {
    const existing = byAccount.get(entry.accountCode) || { 
      name: entry.accountName, 
      amount: 0 
    };
    
    // Add the appropriate amount
    existing.amount += amountType === 'debit' 
      ? (entry.debit - entry.credit)
      : (entry.credit - entry.debit);
    
    byAccount.set(entry.accountCode, existing);
  }

  return Array.from(byAccount.entries()).map(([code, data]) => ({
    accountCode: code,
    accountName: data.name,
    amount: Math.abs(data.amount),
  }));
}

/**
 * Sum line items
 */
function sumLineItems(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
