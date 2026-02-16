/**
 * SII DTE Connector Interface
 * 
 * Abstracts Chilean SII electronic document ingestion.
 * Handles invoices, credit notes, and debit notes (issued and received).
 */

import type { Connector, SyncResult, DTEDocument } from '../types.js';

export interface SIIConnector extends Connector<DTEDocument> {
  /**
   * Sync all DTE documents for a company
   */
  syncFull(companyId: number): Promise<SyncResult<DTEDocument>>;
  syncIncremental(companyId: number, cursor: string): Promise<SyncResult<DTEDocument>>;
}

export { DTEDocument };
