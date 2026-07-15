/**
 * Ledger Service
 *
 * Manages journal entries and general ledger operations.
 * Creates entries from bank transactions and DTE documents.
 *
 * ASSUMPTIONS:
 * - Double-entry bookkeeping
 * - All entries must balance (debits = credits)
 * - Chart of accounts follows Chilean IFRS standards
 */

import type { JournalEntry, JournalLine } from "../types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ChartOfAccountsEntry {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
}

// Default chart of accounts for SME
export const DEFAULT_CHART_OF_ACCOUNTS: ChartOfAccountsEntry[] = [
  // Assets (1xxx)
  { code: "1000", name: "Caja", type: "asset" },
  { code: "1010", name: "Banco", type: "asset" },
  { code: "1100", name: "Cuentas por Cobrar", type: "asset" },
  { code: "1200", name: "Inventario", type: "asset" },
  { code: "1500", name: "Activo Fijo", type: "asset" },
  { code: "1600", name: "Depreciación Acumulada", type: "asset" },

  // Liabilities (2xxx)
  { code: "2000", name: "Cuentas por Pagar", type: "liability" },
  { code: "2100", name: "IVA por Pagar", type: "liability" },
  { code: "2200", name: "Sueldos por Pagar", type: "liability" },
  { code: "2500", name: "Préstamos Bancarios", type: "liability" },

  // Equity (3xxx)
  { code: "3000", name: "Capital", type: "equity" },
  { code: "3100", name: "Utilidades Retenidas", type: "equity" },
  { code: "3200", name: "Resultado del Ejercicio", type: "equity" },

  // Revenue (4xxx)
  { code: "4000", name: "Ingresos por Ventas", type: "revenue" },
  { code: "4100", name: "Ingresos por Servicios", type: "revenue" },

  // Cost of Sales (5xxx)
  { code: "5000", name: "Costo de Ventas", type: "expense" },

  // Operating Expenses (6xxx)
  { code: "6000", name: "Gastos de Administración", type: "expense" },
  { code: "6100", name: "Gastos de Ventas", type: "expense" },
  { code: "6200", name: "Sueldos y Salarios", type: "expense" },
  { code: "6300", name: "Arriendo", type: "expense" },
  { code: "6400", name: "Servicios Básicos", type: "expense" },
  { code: "6500", name: "Depreciación", type: "expense" },

  // Other Income (7xxx)
  { code: "7000", name: "Otros Ingresos", type: "revenue" },
  { code: "7100", name: "Ingresos Financieros", type: "revenue" },

  // Other Expenses (8xxx)
  { code: "8000", name: "Otros Gastos", type: "expense" },
  { code: "8100", name: "Gastos Financieros", type: "expense" },

  // Taxes (9xxx)
  { code: "9000", name: "Impuesto a la Renta", type: "expense" },
];

// =============================================================================
// JOURNAL ENTRY VALIDATION
// =============================================================================

/**
 * Validate that journal entry balances
 */
export function validateJournalEntry(entry: JournalEntry): { valid: boolean; error?: string } {
  if (!entry.lines || entry.lines.length === 0) {
    return { valid: false, error: "Journal entry must have at least one line" };
  }

  const totalDebits = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = entry.lines.reduce((sum, line) => sum + line.credit, 0);

  // Allow for small floating point differences
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return {
      valid: false,
      error: `Entry does not balance: Debits=${totalDebits}, Credits=${totalCredits}`,
    };
  }

  return { valid: true };
}

// =============================================================================
// ENTRY CREATION FROM SOURCE DOCUMENTS
// =============================================================================

interface BankTransactionSource {
  id: number;
  amount: number;
  transactionDate: string;
  transactionType: string;
  description: string;
}

/**
 * Create journal entry from bank transaction
 */
export function createEntryFromBankTransaction(
  companyId: number,
  transaction: BankTransactionSource,
): JournalEntry {
  const lines: JournalLine[] = [];
  const isCredit = transaction.amount > 0;
  const amount = Math.abs(transaction.amount);

  if (isCredit) {
    // Money received - debit bank, credit revenue/receivables
    lines.push({ accountCode: "1010", debit: amount, credit: 0, description: "Banco" });
    lines.push({ accountCode: "4000", debit: 0, credit: amount, description: "Ingresos" });
  } else {
    // Money paid - credit bank, debit expense/payables
    lines.push({ accountCode: "1010", debit: 0, credit: amount, description: "Banco" });
    lines.push({ accountCode: "6000", debit: amount, credit: 0, description: "Gastos" });
  }

  return {
    companyId,
    entryDate: transaction.transactionDate,
    description: transaction.description || "Bank transaction",
    reference: `BANK-${transaction.id}`,
    sourceType: "bank",
    sourceId: transaction.id,
    lines,
    isPosted: false,
  };
}

interface DTEDocumentSource {
  id: number;
  documentType: string;
  direction: "issued" | "received";
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  issueDate: string;
  folio: number;
  emitterName: string;
  receiverName: string;
}

/**
 * Create journal entry from DTE document
 */
export function createEntryFromDTE(companyId: number, document: DTEDocumentSource): JournalEntry {
  const lines: JournalLine[] = [];

  if (document.direction === "issued") {
    // We issued invoice - record receivable and revenue
    // Debit: Cuentas por Cobrar (total)
    // Credit: Ingresos (net)
    // Credit: IVA por Pagar (vat)
    lines.push({
      accountCode: "1100",
      debit: document.totalAmount,
      credit: 0,
      description: `Cuenta por cobrar - ${document.receiverName}`,
    });
    lines.push({
      accountCode: "4000",
      debit: 0,
      credit: document.netAmount,
      description: "Ingresos por venta",
    });
    lines.push({
      accountCode: "2100",
      debit: 0,
      credit: document.vatAmount,
      description: "IVA Débito Fiscal",
    });
  } else {
    // We received invoice - record payable and expense
    // Debit: Gastos (net)
    // Debit: IVA Crédito (to be recovered) - for simplicity, net against 2100
    // Credit: Cuentas por Pagar (total)
    lines.push({
      accountCode: "6000",
      debit: document.netAmount,
      credit: 0,
      description: `Gasto - ${document.emitterName}`,
    });
    lines.push({
      accountCode: "2100",
      debit: document.vatAmount,
      credit: 0,
      description: "IVA Crédito Fiscal",
    });
    lines.push({
      accountCode: "2000",
      debit: 0,
      credit: document.totalAmount,
      description: `Cuenta por pagar - ${document.emitterName}`,
    });
  }

  return {
    companyId,
    entryDate: document.issueDate,
    description: `${document.documentType} Folio ${document.folio}`,
    reference: `DTE-${document.documentType}-${document.folio}`,
    sourceType: "dte",
    sourceId: document.id,
    lines,
    isPosted: false,
  };
}

// =============================================================================
// ACCOUNT BALANCE CALCULATION
// =============================================================================

/**
 * Calculate account balances from journal entries
 */
export function calculateAccountBalances(entries: JournalEntry[]): Map<string, number> {
  const balances = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.isPosted) continue;

    for (const line of entry.lines) {
      const current = balances.get(line.accountCode) || 0;
      // Assets/Expenses increase with debits
      // Liabilities/Equity/Revenue increase with credits
      balances.set(line.accountCode, current + line.debit - line.credit);
    }
  }

  return balances;
}

/**
 * Get trial balance (all accounts with balances)
 */
export function getTrialBalance(
  entries: JournalEntry[],
  chartOfAccounts: ChartOfAccountsEntry[] = DEFAULT_CHART_OF_ACCOUNTS,
): { accountCode: string; accountName: string; debit: number; credit: number }[] {
  const balances = calculateAccountBalances(entries);
  const accountMap = new Map(chartOfAccounts.map((a) => [a.code, a]));

  const trialBalance: {
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  }[] = [];

  for (const [code, balance] of balances) {
    const account = accountMap.get(code);
    if (balance !== 0) {
      trialBalance.push({
        accountCode: code,
        accountName: account?.name || code,
        debit: balance > 0 ? balance : 0,
        credit: balance < 0 ? Math.abs(balance) : 0,
      });
    }
  }

  return trialBalance.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}
