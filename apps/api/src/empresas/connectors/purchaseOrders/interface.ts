/**
 * Purchase Orders Connector Interface
 *
 * Abstracts internal purchase order system ingestion.
 * Maps POs to expected payments for cash forecasting.
 */

import type { Connector, SyncResult, PurchaseOrder } from "../types.js";

export interface PurchaseOrdersConnector extends Connector<PurchaseOrder> {
  /**
   * Sync all purchase orders for a company
   */
  syncFull(companyId: number): Promise<SyncResult<PurchaseOrder>>;
  syncIncremental(companyId: number, cursor: string): Promise<SyncResult<PurchaseOrder>>;
}

export { PurchaseOrder };
