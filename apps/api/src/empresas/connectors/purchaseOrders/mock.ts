/**
 * Mock Purchase Orders Connector
 *
 * Provides deterministic mock purchase orders for development and testing.
 * Simulates typical SME purchasing with awarded POs (unbilled obligations).
 *
 * ASSUMPTIONS:
 * - All amounts in CLP
 * - Mix of open, partially invoiced, and fully invoiced POs
 */

import type { PurchaseOrdersConnector } from "./interface.js";
import type { SyncResult, PurchaseOrder } from "../types.js";

// =============================================================================
// DETERMINISTIC MOCK DATA
// =============================================================================

/**
 * Generate deterministic mock purchase orders
 */
function generateMockPurchaseOrders(companyId: number): PurchaseOrder[] {
  const baseId = `PO-${companyId}`;

  const purchaseOrders: PurchaseOrder[] = [
    // Open POs (not yet invoiced)
    {
      poNumber: `${baseId}-001`,
      customerRut: "76.111.222-3",
      customerName: "Empresa ABC Ltda",
      currency: "CLP",
      totalAmount: 12000000,
      invoicedAmount: 0,
      expectedInvoiceDate: "2025-01-15",
      status: "open",
      notes: "Annual software license contract",
    },
    {
      poNumber: `${baseId}-002`,
      customerRut: "96.222.333-4",
      customerName: "Corp XYZ SA",
      currency: "CLP",
      totalAmount: 8500000,
      invoicedAmount: 0,
      expectedInvoiceDate: "2025-01-20",
      status: "open",
      notes: "Consulting services Q1 2025",
    },

    // Partially invoiced POs
    {
      poNumber: `${baseId}-003`,
      customerRut: "77.888.999-0",
      customerName: "Cliente Nuevo SpA",
      currency: "CLP",
      totalAmount: 6000000,
      invoicedAmount: 2975000,
      expectedInvoiceDate: "2025-02-01",
      status: "partially_invoiced",
      notes: "Multi-phase implementation project",
    },
    {
      poNumber: `${baseId}-004`,
      customerRut: "96.666.777-8",
      customerName: "MegaCorp Chile",
      currency: "CLP",
      totalAmount: 15000000,
      invoicedAmount: 4998000,
      expectedInvoiceDate: "2025-02-15",
      status: "partially_invoiced",
      notes: "Enterprise platform deployment",
    },

    // Fully invoiced POs
    {
      poNumber: `${baseId}-005`,
      customerRut: "76.444.555-6",
      customerName: "Tech Solutions Ltda",
      currency: "CLP",
      totalAmount: 5950000,
      invoicedAmount: 5950000,
      expectedInvoiceDate: null,
      status: "fully_invoiced",
      notes: "Completed project - fully billed",
    },

    // Cancelled PO
    {
      poNumber: `${baseId}-006`,
      customerRut: "76.999.888-7",
      customerName: "Old Client SA",
      currency: "CLP",
      totalAmount: 3000000,
      invoicedAmount: 0,
      expectedInvoiceDate: null,
      status: "cancelled",
      notes: "Client cancelled project",
    },
  ];

  return purchaseOrders;
}

// =============================================================================
// MOCK CONNECTOR IMPLEMENTATION
// =============================================================================

export class MockPurchaseOrdersConnector implements PurchaseOrdersConnector {
  private cursors: Map<number, string> = new Map();

  async syncFull(companyId: number): Promise<SyncResult<PurchaseOrder>> {
    const orders = generateMockPurchaseOrders(companyId);
    const cursor = `po-full-${companyId}`;

    this.cursors.set(companyId, cursor);

    return {
      success: true,
      data: orders,
      cursor,
      hasMore: false,
      syncedAt: new Date().toISOString(),
      errors: [],
    };
  }

  async syncIncremental(companyId: number, cursor: string): Promise<SyncResult<PurchaseOrder>> {
    // For mock, incremental returns empty
    const newCursor = `po-incr-${companyId}`;
    this.cursors.set(companyId, newCursor);

    return {
      success: true,
      data: [],
      cursor: newCursor,
      hasMore: false,
      syncedAt: new Date().toISOString(),
      errors: [],
    };
  }

  async getLastCursor(companyId: number): Promise<string | null> {
    return this.cursors.get(companyId) || null;
  }
}

/**
 * Factory function to create the mock connector
 */
export function createMockPurchaseOrdersConnector(): PurchaseOrdersConnector {
  return new MockPurchaseOrdersConnector();
}
