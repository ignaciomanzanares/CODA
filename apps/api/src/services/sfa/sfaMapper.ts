/**
 * Mapeo entre el modelo interno de movimientos de CODA y el formato SFA (CMF Chile).
 *
 * Doble dirección, para dejar el sistema listo para la entrada en vigencia del SFA:
 *  - toSfaTransaction / buildSfaTransactionsResponse: interno → SFA. Permite renderizar las
 *    cartolas PDF ya normalizadas en el formato exacto del SFA (validación + demo de readiness).
 *  - fromSfaTransaction: SFA → OBTransaction. Es lo que usará el conector SFA real (cuando CODA
 *    consuma las APIs como PSBI): la respuesta de la API cae en el mismo modelo OB que ya
 *    alimenta normalizeCartola/scoring, sin reescribir nada aguas abajo.
 *
 * Convención de signo: el SFA usa `amount` positivo + `transactionType` ("Débito"/"Crédito");
 * el modelo interno usa `amount` firmado (salida negativa, entrada positiva).
 */
import type { OBTransaction } from '../../connectors/openbanking/mockProvider.js';
import {
  type SfaTransaction, type SfaTransactionsResponse, minorUnits,
  type SfaLoan, type SfaLoanBalance,
} from './sfaTypes.js';

/** Redondea al número de decimales de la moneda (CLP→entero, USD→2, etc.). */
function roundToCurrency(amount: number, currency: string): number {
  const f = 10 ** minorUnits(currency);
  return Math.round(amount * f) / f;
}

/** ISO 8601 en UTC sin milisegundos ("2025-02-10T10:00:00Z"), tolerando fecha-only o datetime. */
function toIso8601Utc(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Movimiento interno (fila de `transactions` o equivalente) con monto firmado. */
export interface InternalTx {
  id?: number | string;
  externalId?: string | null;
  postedAt: string | Date;
  description?: string | null;
  amount: number; // firmado: salida negativa, entrada positiva
  currency?: string | null;
  balanceAfter?: number | null;
}

/** Interno → SFA. amount queda positivo; el signo va en transactionType. */
export function toSfaTransaction(tx: InternalTx): SfaTransaction {
  const signed = Number(tx.amount) || 0;
  const currency = (tx.currency || 'CLP').toUpperCase();
  const out: SfaTransaction = {
    transactionID: tx.externalId ? String(tx.externalId) : String(tx.id ?? ''),
    bookingDateTime: toIso8601Utc(tx.postedAt),
    transactionType: signed < 0 ? 'Débito' : 'Crédito',
    amount: roundToCurrency(Math.abs(signed), currency),
    currency,
    description: tx.description ?? '',
  };
  if (tx.balanceAfter != null && Number.isFinite(Number(tx.balanceAfter))) {
    out.balanceAfter = roundToCurrency(Number(tx.balanceAfter), currency);
  }
  return out;
}

/** SFA → OBTransaction (lo que consumirá el conector SFA real). Restituye el signo. */
export function fromSfaTransaction(t: SfaTransaction): OBTransaction {
  const abs = Math.abs(Number(t.amount) || 0);
  return {
    externalId: t.transactionID,
    postedAt: new Date(t.bookingDateTime),
    description: t.description,
    amount: t.transactionType === 'Débito' ? -abs : abs,
    currency: t.currency,
    raw: t,
  };
}

export interface SfaResponseOpts {
  baseUrl: string; // p.ej. https://host/accounts/v1/accounts/ACC123/transactions
  page?: number; // 1-based
  pageSize?: number;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
}

function buildLink(opts: SfaResponseOpts, page: number, pageSize: number): string {
  const qs = new URLSearchParams();
  if (opts.fromDate) qs.set('fromDate', opts.fromDate);
  if (opts.toDate) qs.set('toDate', opts.toDate);
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  return `${opts.baseUrl}?${qs.toString()}`;
}

/**
 * Construye la respuesta SFA completa (data/links/meta) desde movimientos internos.
 * Ordena cronológicamente ascendente (como el ejemplo oficial) y pagina 1-based.
 */
export function buildSfaTransactionsResponse(txs: InternalTx[], opts: SfaResponseOpts): SfaTransactionsResponse {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 25);

  const all = [...txs].sort(
    (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime(),
  );
  const totalRecords = all.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const start = (page - 1) * pageSize;
  const slice = all.slice(start, start + pageSize);

  const links: SfaTransactionsResponse['links'] = { self: buildLink(opts, page, pageSize) };
  if (page < totalPages) links.next = buildLink(opts, page + 1, pageSize);
  if (page > 1) links.prev = buildLink(opts, page - 1, pageSize);

  return {
    data: { transactions: slice.map(toSfaTransaction) },
    links,
    meta: { totalRecords, totalPages },
  };
}

// ============================================================================
// OPERACIONES DE CRÉDITO (SFA → modelo de deuda interno, para el evaluador de riesgo CMF)
// ============================================================================

/** tipo_credito del CMF a partir del loanType del SFA. */
export function loanTypeToCmf(loanType: string): 'vivienda' | 'consumo' | 'comercial' | 'otro' {
  switch ((loanType || '').toUpperCase()) {
    case 'HIPOTECARIO': return 'vivienda';
    case 'CONSUMO': return 'consumo';
    case 'COMERCIAL': return 'comercial';
    default: return 'otro';
  }
}

/** Operación de crédito normalizada (interna), combinando datos generales + saldo del SFA. */
export interface CreditOperation {
  loanId: string;
  institucion: string; // productName (el nombre del IPI viene por otra vía en el SFA)
  tipoCredito: 'vivienda' | 'consumo' | 'comercial' | 'otro';
  currency: string;
  vigente: boolean;
  /** Deuda total exigible = capital vigente + interés devengado + interés de mora. */
  totalOutstanding: number;
  outstandingPrincipal: number;
  accruedInterest: number;
  accruedLateInterest: number;
  /** mora: hay interés por atraso devengado. */
  tieneMora: boolean;
  nextInstallment?: { amount: number; dueDate: string };
  lastPayment?: { amount: number; date: string };
  interestRate?: number;
  rateType?: string;
}

/** SFA loan (+ balance opcional) → operación de crédito interna. */
export function fromSfaLoan(loan: SfaLoan, balance?: SfaLoanBalance): CreditOperation {
  const currency = (loan.currency || balance?.currency || 'CLP').toUpperCase();
  const principal = balance?.outstandingPrincipal ?? 0;
  const interest = balance?.accruedInterest ?? 0;
  const lateInterest = balance?.accruedLateInterest ?? 0;
  const op: CreditOperation = {
    loanId: loan.loanID,
    institucion: loan.productName,
    tipoCredito: loanTypeToCmf(loan.loanType),
    currency,
    vigente: (loan.status || '').toUpperCase() === 'VIGENTE',
    outstandingPrincipal: principal,
    accruedInterest: interest,
    accruedLateInterest: lateInterest,
    totalOutstanding: principal + interest + lateInterest,
    tieneMora: lateInterest > 0 || (loan.status || '').toUpperCase() === 'MOROSO',
    interestRate: loan.interestRate,
    rateType: loan.rateType,
  };
  if (balance) {
    if (balance.nextInstallmentAmount != null) op.nextInstallment = { amount: balance.nextInstallmentAmount, dueDate: balance.nextInstallmentDueDate };
    if (balance.lastPaymentAmount != null) op.lastPayment = { amount: balance.lastPaymentAmount, date: balance.lastPaymentDate };
  }
  return op;
}

/** Señales de deuda para el evaluador de riesgo, agregando operaciones SFA (reemplaza al PDF CMF). */
export interface CreditDebtSignals {
  deudaTotal: number;
  tieneDeuda: boolean;
  tieneMora: boolean;
  numOperaciones: number;
  porTipo: Record<string, number>;
}

export function aggregateCreditSignals(ops: CreditOperation[]): CreditDebtSignals {
  const porTipo: Record<string, number> = {};
  let deudaTotal = 0;
  let tieneMora = false;
  for (const op of ops) {
    deudaTotal += op.totalOutstanding;
    if (op.tieneMora) tieneMora = true;
    porTipo[op.tipoCredito] = (porTipo[op.tipoCredito] ?? 0) + op.totalOutstanding;
  }
  return {
    deudaTotal: Math.round(deudaTotal),
    tieneDeuda: deudaTotal > 0,
    tieneMora,
    numOperaciones: ops.length,
    porTipo,
  };
}
