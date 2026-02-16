/**
 * Cash Flow Statement Generator
 * 
 * Generates cash flow statements using the direct method.
 * Categorizes cash movements into operating, investing, and financing.
 * 
 * ASSUMPTIONS:
 * - Direct method (uses actual cash transactions)
 * - Categories based on transaction descriptions and types
 */

import type { CashFlowStatement, CashFlowSection, LineItem } from '../types.js';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface CashTransactionInput {
  id: number;
  amount: number;
  transactionDate: string;
  transactionType: string;
  description: string;
  category?: string;
}

export interface CashFlowOptions {
  beginningCash: number;
}

// =============================================================================
// CASH FLOW CATEGORIZATION
// =============================================================================

type CashFlowCategory = 'operating' | 'investing' | 'financing';

const CATEGORY_KEYWORDS: Record<CashFlowCategory, string[]> = {
  operating: [
    'customer', 'client', 'payment', 'invoice', 'revenue', 'income',
    'salary', 'payroll', 'rent', 'utilities', 'supplier', 'vendor',
    'expense', 'service', 'subscription'
  ],
  investing: [
    'equipment', 'asset', 'investment', 'acquisition', 'property',
    'software', 'license', 'capital', 'purchase fixed'
  ],
  financing: [
    'loan', 'credit', 'debt', 'dividend', 'equity', 'capital contribution',
    'interest', 'repayment', 'borrowing'
  ],
};

function categorizeTransaction(txn: CashTransactionInput): CashFlowCategory {
  if (txn.category) {
    if (['operating', 'investing', 'financing'].includes(txn.category)) {
      return txn.category as CashFlowCategory;
    }
  }

  const desc = (txn.description || '').toLowerCase();
  const type = (txn.transactionType || '').toLowerCase();
  const combined = `${desc} ${type}`;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        return category as CashFlowCategory;
      }
    }
  }

  // Default to operating
  return 'operating';
}

// =============================================================================
// CASH FLOW STATEMENT GENERATION
// =============================================================================

/**
 * Generate cash flow statement from transactions
 */
export function generateCashFlowStatement(
  transactions: CashTransactionInput[],
  periodStart: string,
  periodEnd: string,
  options: CashFlowOptions
): CashFlowStatement {
  // Filter by period
  const periodTxns = transactions.filter(t =>
    t.transactionDate >= periodStart && t.transactionDate <= periodEnd
  );

  // Categorize transactions
  const operating: CashTransactionInput[] = [];
  const investing: CashTransactionInput[] = [];
  const financing: CashTransactionInput[] = [];

  for (const txn of periodTxns) {
    const category = categorizeTransaction(txn);
    switch (category) {
      case 'operating':
        operating.push(txn);
        break;
      case 'investing':
        investing.push(txn);
        break;
      case 'financing':
        financing.push(txn);
        break;
    }
  }

  // Build sections
  const operatingSection = buildSection(operating);
  const investingSection = buildSection(investing);
  const financingSection = buildSection(financing);

  const netCashChange = operatingSection.total + investingSection.total + financingSection.total;
  const endingCash = options.beginningCash + netCashChange;

  return {
    periodStart,
    periodEnd,
    operatingActivities: operatingSection,
    investingActivities: investingSection,
    financingActivities: financingSection,
    netCashChange,
    beginningCash: options.beginningCash,
    endingCash,
  };
}

/**
 * Build a cash flow section from transactions
 */
function buildSection(transactions: CashTransactionInput[]): CashFlowSection {
  // Group by description/type
  const byType = new Map<string, number>();

  for (const txn of transactions) {
    const key = normalizeDescription(txn.description || txn.transactionType || 'Other');
    const existing = byType.get(key) || 0;
    byType.set(key, existing + txn.amount);
  }

  const items: LineItem[] = Array.from(byType.entries()).map(([key, amount]) => ({
    accountCode: '',
    accountName: key,
    amount,
  }));

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return { items, total };
}

/**
 * Normalize description for grouping
 */
function normalizeDescription(desc: string): string {
  // Capitalize first letter
  return desc.charAt(0).toUpperCase() + desc.slice(1).toLowerCase();
}
