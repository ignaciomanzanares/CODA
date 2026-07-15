/**
 * Open Banking Connector Interface
 *
 * Abstracts bank account, transaction, and balance data ingestion.
 * Implementations can be mock (for development/testing) or real (production).
 */

import type { Connector, SyncResult, OpenBankingData } from "../types.js";

export interface OpenBankingConnector extends Connector<OpenBankingData> {
  /**
   * Sync accounts, transactions, and balances for a company
   */
  syncFull(companyId: number): Promise<SyncResult<OpenBankingData>>;
  syncIncremental(companyId: number, cursor: string): Promise<SyncResult<OpenBankingData>>;
}

export { OpenBankingData };
