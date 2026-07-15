/**
 * Common types for all connectors
 *
 * Design Principles:
 * - All connectors are idempotent (re-running produces same result)
 * - All connectors store raw payloads for audit
 * - All connectors support incremental sync via cursor
 */

import { z } from "zod";

// =============================================================================
// SYNC RESULT TYPES
// =============================================================================

export interface SyncResult<T> {
  success: boolean;
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  syncedAt: string;
  errors: SyncError[];
}

export interface SyncError {
  code: string;
  message: string;
  entityId?: string;
  retryable: boolean;
}

// =============================================================================
// CONNECTOR INTERFACE
// =============================================================================

export interface Connector<T> {
  /**
   * Perform a full sync of all data from the source
   * Should be idempotent - running twice produces the same result
   */
  syncFull(companyId: number): Promise<SyncResult<T>>;

  /**
   * Perform an incremental sync from a cursor position
   * Used for efficient updates after initial full sync
   */
  syncIncremental(companyId: number, cursor: string): Promise<SyncResult<T>>;

  /**
   * Get the last sync cursor for a company
   */
  getLastCursor(companyId: number): Promise<string | null>;
}

// =============================================================================
// OPEN BANKING TYPES
// =============================================================================

export const OpenBankingAccountSchema = z.object({
  externalId: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountType: z.enum(["checking", "savings", "credit"]),
  currency: z.string().default("CLP"),
  isActive: z.boolean().default(true),
});

export type OpenBankingAccount = z.infer<typeof OpenBankingAccountSchema>;

export const OpenBankingTransactionSchema = z.object({
  externalId: z.string(),
  accountExternalId: z.string(),
  transactionDate: z.string(), // ISO date
  postedDate: z.string().nullable(),
  amount: z.number(),
  currency: z.string().default("CLP"),
  description: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  counterpartyRut: z.string().nullable(),
  reference: z.string().nullable(),
  status: z.enum(["pending", "posted", "reversed"]),
  category: z.string().nullable(),
});

export type OpenBankingTransaction = z.infer<typeof OpenBankingTransactionSchema>;

export const OpenBankingBalanceSchema = z.object({
  accountExternalId: z.string(),
  balanceDate: z.string(), // ISO date
  availableBalance: z.number().nullable(),
  currentBalance: z.number().nullable(),
});

export type OpenBankingBalance = z.infer<typeof OpenBankingBalanceSchema>;

export interface OpenBankingData {
  accounts: OpenBankingAccount[];
  transactions: OpenBankingTransaction[];
  balances: OpenBankingBalance[];
}

// =============================================================================
// SII DTE TYPES
// =============================================================================

export const DTEDocumentSchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "debit_note"]),
  direction: z.enum(["issued", "received"]),
  folio: z.number(),
  emitterRut: z.string(),
  emitterName: z.string().nullable(),
  receiverRut: z.string(),
  receiverName: z.string().nullable(),
  issueDate: z.string(), // ISO date
  netAmount: z.number(),
  vatAmount: z.number().default(0),
  totalAmount: z.number(),
  currency: z.string().default("CLP"),
  status: z.enum(["valid", "cancelled", "pending"]).default("valid"),
  references: z.string().nullable(),
});

export type DTEDocument = z.infer<typeof DTEDocumentSchema>;

// =============================================================================
// PURCHASE ORDER TYPES
// =============================================================================

export const PurchaseOrderSchema = z.object({
  poNumber: z.string(),
  customerRut: z.string(),
  customerName: z.string().nullable(),
  currency: z.string().default("CLP"),
  totalAmount: z.number(),
  invoicedAmount: z.number().default(0),
  expectedInvoiceDate: z.string().nullable(), // ISO date
  status: z.enum(["open", "partially_invoiced", "fully_invoiced", "cancelled"]).default("open"),
  notes: z.string().nullable(),
});

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

// =============================================================================
// RAW PAYLOAD TYPES (for audit)
// =============================================================================

export interface RawPayload {
  companyId: number;
  source: "openbanking" | "sii" | "purchase_orders";
  syncType: "full" | "incremental";
  cursor: string | null;
  payload: string; // JSON stringified
  syncedAt: string;
}
