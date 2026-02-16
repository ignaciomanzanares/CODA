/**
 * Mock SII DTE Connector
 * 
 * Provides deterministic mock DTE documents for development and testing.
 * Simulates a typical Chilean SME with:
 * - Issued invoices to customers
 * - Received invoices from suppliers
 * - Credit notes for returns/adjustments
 * 
 * ASSUMPTIONS:
 * - Company RUT is 76.123.456-7 (TechPyme Chile SpA)
 * - 19% VAT rate
 * - All amounts in CLP
 * - Documents from November-December 2024
 */

import type { SIIConnector } from './interface.js';
import type { SyncResult, DTEDocument } from '../types.js';

// =============================================================================
// DETERMINISTIC MOCK DATA
// =============================================================================

/**
 * Generate deterministic mock DTE documents
 * Creates a realistic mix of issued and received invoices
 */
function generateMockDTEDocuments(companyId: number): DTEDocument[] {
  const companyRut = '76.123.456-7';
  const companyName = 'TechPyme Chile SpA';

  const documents: DTEDocument[] = [
    // ISSUED INVOICES (company as emitter = revenue)
    {
      documentType: 'invoice',
      direction: 'issued',
      folio: 1001,
      emitterRut: companyRut,
      emitterName: companyName,
      receiverRut: '76.111.222-3',
      receiverName: 'Empresa ABC Ltda',
      issueDate: '2024-11-28',
      netAmount: 5000000,
      vatAmount: 950000,
      totalAmount: 5950000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'issued',
      folio: 1002,
      emitterRut: companyRut,
      emitterName: companyName,
      receiverRut: '96.222.333-4',
      receiverName: 'Corp XYZ SA',
      issueDate: '2024-12-01',
      netAmount: 3000000,
      vatAmount: 570000,
      totalAmount: 3570000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'issued',
      folio: 1003,
      emitterRut: companyRut,
      emitterName: companyName,
      receiverRut: '77.888.999-0',
      receiverName: 'Cliente Nuevo SpA',
      issueDate: '2024-12-10',
      netAmount: 2500000,
      vatAmount: 475000,
      totalAmount: 2975000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'issued',
      folio: 1004,
      emitterRut: companyRut,
      emitterName: companyName,
      receiverRut: '96.666.777-8',
      receiverName: 'MegaCorp Chile',
      issueDate: '2024-12-12',
      netAmount: 4200000,
      vatAmount: 798000,
      totalAmount: 4998000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    
    // RECEIVED INVOICES (company as receiver = expenses)
    {
      documentType: 'invoice',
      direction: 'received',
      folio: 5501,
      emitterRut: '96.444.555-6',
      emitterName: 'CloudHost SA',
      receiverRut: companyRut,
      receiverName: companyName,
      issueDate: '2024-11-30',
      netAmount: 1000000,
      vatAmount: 190000,
      totalAmount: 1190000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'received',
      folio: 8823,
      emitterRut: '96.800.570-7',
      emitterName: 'Enel Distribucion',
      receiverRut: companyRut,
      receiverName: companyName,
      issueDate: '2024-11-28',
      netAmount: 105042,
      vatAmount: 19958,
      totalAmount: 125000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'received',
      folio: 12456,
      emitterRut: '76.999.000-1',
      emitterName: 'Inmobiliaria Centro',
      receiverRut: companyRut,
      receiverName: companyName,
      issueDate: '2024-12-01',
      netAmount: 168067,
      vatAmount: 31933,
      totalAmount: 200000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    {
      documentType: 'invoice',
      direction: 'received',
      folio: 3344,
      emitterRut: '76.555.666-7',
      emitterName: 'Office Supplies Ltda',
      receiverRut: companyRut,
      receiverName: companyName,
      issueDate: '2024-12-05',
      netAmount: 84034,
      vatAmount: 15966,
      totalAmount: 100000,
      currency: 'CLP',
      status: 'valid',
      references: null,
    },
    
    // CREDIT NOTE (adjustment to issued invoice)
    {
      documentType: 'credit_note',
      direction: 'issued',
      folio: 50,
      emitterRut: companyRut,
      emitterName: companyName,
      receiverRut: '76.111.222-3',
      receiverName: 'Empresa ABC Ltda',
      issueDate: '2024-12-05',
      netAmount: 500000,
      vatAmount: 95000,
      totalAmount: 595000,
      currency: 'CLP',
      status: 'valid',
      references: JSON.stringify({ originalFolio: 1001 }),
    },
  ];

  return documents;
}

// =============================================================================
// MOCK CONNECTOR IMPLEMENTATION
// =============================================================================

export class MockSIIConnector implements SIIConnector {
  private cursors: Map<number, string> = new Map();

  async syncFull(companyId: number): Promise<SyncResult<DTEDocument>> {
    const documents = generateMockDTEDocuments(companyId);
    const cursor = `sii-full-${companyId}`;
    
    this.cursors.set(companyId, cursor);

    return {
      success: true,
      data: documents,
      cursor,
      hasMore: false,
      syncedAt: new Date().toISOString(),
      errors: [],
    };
  }

  async syncIncremental(companyId: number, cursor: string): Promise<SyncResult<DTEDocument>> {
    // For mock, incremental returns empty (no new documents since full sync)
    const newCursor = `sii-incr-${companyId}`;
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
export function createMockSIIConnector(): SIIConnector {
  return new MockSIIConnector();
}
