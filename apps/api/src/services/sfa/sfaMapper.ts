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
import { type SfaTransaction, type SfaTransactionsResponse, minorUnits } from './sfaTypes.js';

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
