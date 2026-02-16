/**
 * Mock OpenBanking Connector
 * 
 * Provides deterministic mock bank data for development and testing.
 * Data is scoped per companyId and cursors are deterministic.
 */

import type { OpenBankingConnector } from './interface.js';
import type { SyncResult, OpenBankingData, OpenBankingAccount, OpenBankingTransaction, OpenBankingBalance } from '../types.js';

/**
 * Generate deterministic mock accounts
 */
function generateMockAccounts(companyId: number): OpenBankingAccount[] {
  const base = companyId * 1000;
  return [
    {
      externalId: `BDC-ACC-${base}-001`,
      bankName: 'Banco de Chile',
      accountNumber: `${base}0001234`,
      accountType: 'checking',
      currency: 'CLP',
      isActive: true,
    },
  ];
}

/**
 * Generate deterministic mock transactions
 */
function generateMockTransactions(companyId: number): OpenBankingTransaction[] {
  const base = companyId * 1000;
  const accountExternalId = `BDC-ACC-${base}-001`;

  return [
    {
      externalId: `BDC-TXN-${base}-0001`,
      accountExternalId,
      transactionDate: '2024-11-25',
      postedDate: '2024-11-25',
      amount: 5950000,
      currency: 'CLP',
      description: 'Pago factura 1001',
      counterpartyName: 'Empresa ABC Ltda',
      counterpartyRut: '76.111.222-3',
      reference: '1001',
      status: 'posted',
      category: 'income',
    },
    {
      externalId: `BDC-TXN-${base}-0002`,
      accountExternalId,
      transactionDate: '2024-11-28',
      postedDate: '2024-11-28',
      amount: -1190000,
      currency: 'CLP',
      description: 'Pago proveedor CloudHost',
      counterpartyName: 'CloudHost SA',
      counterpartyRut: '96.444.555-6',
      reference: null,
      status: 'posted',
      category: 'expense',
    },
    {
      externalId: `BDC-TXN-${base}-0003`,
      accountExternalId,
      transactionDate: '2024-12-01',
      postedDate: '2024-12-01',
      amount: 3570000,
      currency: 'CLP',
      description: 'Pago cliente Corp XYZ',
      counterpartyName: 'Corp XYZ SA',
      counterpartyRut: '96.222.333-4',
      reference: '1002',
      status: 'posted',
      category: 'income',
    },
  ];
}

/**
 * Generate deterministic mock balances
 */
function generateMockBalances(companyId: number): OpenBankingBalance[] {
  const base = companyId * 1000;
  const accountExternalId = `BDC-ACC-${base}-001`;

  return [
    {
      accountExternalId,
      balanceDate: '2024-12-01',
      availableBalance: 15000000,
      currentBalance: 15000000,
    },
  ];
}

export class MockOpenBankingConnector implements OpenBankingConnector {
  private cursors: Map<number, string> = new Map();

  async syncFull(companyId: number): Promise<SyncResult<OpenBankingData>> {
    const accounts = generateMockAccounts(companyId);
    const transactions = generateMockTransactions(companyId);
    const balances = generateMockBalances(companyId);
    
    const cursor = `ob-full-${companyId}`;
    this.cursors.set(companyId, cursor);

    return {
      success: true,
      data: [{ accounts, transactions, balances }],
      cursor,
      hasMore: false,
      syncedAt: new Date().toISOString(),
      errors: [],
    };
  }

  async syncIncremental(companyId: number, cursor: string): Promise<SyncResult<OpenBankingData>> {
    const newCursor = `ob-incr-${companyId}`;
    this.cursors.set(companyId, newCursor);

    return {
      success: true,
      data: [{ accounts: [], transactions: [], balances: [] }],
      cursor: newCursor,
      hasMore: false,
      syncedAt: new Date().toISOString(),
      errors: [],
    };
  }

  async getLastCursor(companyId: number): Promise<string | null> {
    return this.cursors.get(companyId) ?? null;
  }
}

/**
 * Factory function to create the mock connector
 */
export function createMockOpenBankingConnector(): OpenBankingConnector {
  return new MockOpenBankingConnector();
}
