/**
 * Balance Sheet Generator
 * 
 * Generates balance sheet from journal entries and account balances.
 * Groups into assets, liabilities, and equity.
 * 
 * ASSUMPTIONS:
 * - Chilean IFRS-based chart of accounts
 * - Account codes:
 *   - 1xxx: Assets
 *     - 10xx-14xx: Current Assets
 *     - 15xx-19xx: Non-Current Assets
 *   - 2xxx: Liabilities
 *     - 20xx-24xx: Current Liabilities
 *     - 25xx-29xx: Non-Current Liabilities
 *   - 3xxx: Equity
 */

import type { BalanceSheet, BalanceSheetSection, LineItem } from '../types.js';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface AccountBalanceInput {
  accountCode: string;
  accountName: string;
  balance: number; // Positive = debit balance, Negative = credit balance
}

// =============================================================================
// BALANCE SHEET GENERATION
// =============================================================================

/**
 * Generate balance sheet from account balances
 */
export function generateBalanceSheet(
  accounts: AccountBalanceInput[],
  asOfDate: string
): BalanceSheet {
  // Separate by type
  const assets = accounts.filter(a => a.accountCode.startsWith('1'));
  const liabilities = accounts.filter(a => a.accountCode.startsWith('2'));
  const equity = accounts.filter(a => a.accountCode.startsWith('3'));

  // Build sections
  const assetsSection = buildAssetSection(assets);
  const liabilitiesSection = buildLiabilitySection(liabilities);
  const equitySection = buildEquitySection(equity);

  return {
    asOfDate,
    assets: assetsSection,
    liabilities: liabilitiesSection,
    equity: equitySection,
    totalAssets: assetsSection.total,
    totalLiabilitiesAndEquity: liabilitiesSection.total + equitySection.total,
  };
}

/**
 * Build asset section
 */
function buildAssetSection(accounts: AccountBalanceInput[]): BalanceSheetSection {
  const current = accounts
    .filter(a => parseInt(a.accountCode.substring(0, 2)) <= 14)
    .map(toLineItem);

  const nonCurrent = accounts
    .filter(a => parseInt(a.accountCode.substring(0, 2)) > 14)
    .map(toLineItem);

  const totalCurrent = sumBalances(current);
  const totalNonCurrent = sumBalances(nonCurrent);

  return {
    current,
    nonCurrent,
    totalCurrent,
    totalNonCurrent,
    total: totalCurrent + totalNonCurrent,
  };
}

/**
 * Build liability section
 */
function buildLiabilitySection(accounts: AccountBalanceInput[]): BalanceSheetSection {
  const current = accounts
    .filter(a => parseInt(a.accountCode.substring(0, 2)) <= 24)
    .map(toLineItem);

  const nonCurrent = accounts
    .filter(a => parseInt(a.accountCode.substring(0, 2)) > 24)
    .map(toLineItem);

  const totalCurrent = sumBalances(current);
  const totalNonCurrent = sumBalances(nonCurrent);

  return {
    current,
    nonCurrent,
    totalCurrent,
    totalNonCurrent,
    total: totalCurrent + totalNonCurrent,
  };
}

/**
 * Build equity section
 */
function buildEquitySection(accounts: AccountBalanceInput[]): BalanceSheetSection {
  // Equity doesn't have current/non-current distinction
  const items = accounts.map(toLineItem);
  const total = sumBalances(items);

  return {
    current: [],
    nonCurrent: items,
    totalCurrent: 0,
    totalNonCurrent: total,
    total,
  };
}

/**
 * Convert account balance to line item
 */
function toLineItem(account: AccountBalanceInput): LineItem {
  return {
    accountCode: account.accountCode,
    accountName: account.accountName,
    // Use absolute value for display, sign indicates debit/credit
    amount: Math.abs(account.balance),
  };
}

/**
 * Sum line item amounts
 */
function sumBalances(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
