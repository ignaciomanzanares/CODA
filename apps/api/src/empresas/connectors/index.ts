/**
 * @finhealth-empresas/connectors
 *
 * Domain connectors for external data ingestion.
 * Provides abstractions for:
 * - OpenBanking (bank accounts, transactions, balances)
 * - SII DTE (Chilean electronic documents)
 * - Purchase Orders (internal PO system)
 *
 * All connectors follow the same pattern:
 * 1. Interface defines the contract
 * 2. Mock implementation provides deterministic test data
 * 3. Real implementations (future) connect to actual APIs
 */

// Types
export * from "./types.js";

// OpenBanking
export type { OpenBankingConnector } from "./openbanking/interface.js";
export { MockOpenBankingConnector, createMockOpenBankingConnector } from "./openbanking/mock.js";

// SII DTE
export type { SIIConnector } from "./sii/interface.js";
export { MockSIIConnector, createMockSIIConnector } from "./sii/mock.js";

// Purchase Orders
export type { PurchaseOrdersConnector } from "./purchaseOrders/interface.js";
export {
  MockPurchaseOrdersConnector,
  createMockPurchaseOrdersConnector,
} from "./purchaseOrders/mock.js";
