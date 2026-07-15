/**
 * Normalización de una cartola (JSON parsed_data) → accounts + transactions.
 *
 * Antes la cartola vivía sólo como JSON en score_document_uploads/document_uploads.
 * Esto la lleva a la tabla `transactions` (fuente de verdad para Movimientos y el
 * split bruto/real), creando/encontrando la `accounts` correcta por producto.
 *
 * Garantías:
 *  - Cuenta corriente vs tarjeta: por el nombre del banco.
 *  - Fecha: el año se infiere del PERÍODO de la cartola (no del año actual), así
 *    "02/06" de una cartola 2025 queda 2025-06-02 y no 2026-06-02.
 *  - external_id determinístico `score_upload:<documentId>:<index>` + source_document_id
 *    → reprocesar/re-subir el mismo doc NO duplica (se borra y reinserta).
 *  - Monto firmado (cargo negativo, abono positivo), consistente con el dashboard.
 *  - is_internal_transfer SÓLO por patrones de glosa claros (no por categoría genérica).
 *  - TC internacional: metadata USD (original_amount/currency, fx_rate, amount_clp).
 */
import { and, eq, like } from "drizzle-orm";
import { db, transactions, accounts } from "../../db/index.js";
import { storage } from "../../storage.js";
import { logger } from "../../logger.js";
import { isInternalTransferDesc } from "../../parsers/merchantCategorizer.js";

export interface NormalizeTx {
  fecha?: string;
  descripcion?: string;
  cargo?: number;
  abono?: number;
  categoria?: string;
  category_confidence?: number;
  category_rule_id?: string;
  categorizer_version?: string;
  es_transferencia?: boolean;
  /** TC internacional: monto/moneda nativos para conservar metadata USD. */
  montoUsd?: number;
  fxRate?: number;
}

export interface NormalizeCartolaInput {
  userId: string;
  documentId: string; // id del score_document_uploads
  banco: string | null;
  periodoDesde: string | null; // 'YYYY-MM-DD'
  periodoHasta: string | null;
  transacciones: NormalizeTx[];
}

// Fuente ÚNICA de la detección de transferencias internas por glosa:
// `isInternalTransferDesc` (merchantCategorizer), la misma que usan el categorizador
// y el predicado consolidado de exclusión (assistantContext). Marca sólo traspasos
// entre productos propios / pago de tarjeta / divisas; NO marca "PAGO COOPEUCH"
// (dividendo hipotecario = gasto real) ni transferencias a terceros.
export function isInternalByDescription(desc: string): boolean {
  return isInternalTransferDesc(desc ?? "");
}

/** Tipo/subtipo de cuenta a partir del nombre del banco. */
export function accountKindForBanco(banco: string): { type: string; subtype: string } {
  if (/tarjeta\s+(nacional|internacional)/i.test(banco)) {
    return { type: "credit", subtype: "credit_card" };
  }
  return { type: "depository", subtype: "checking" };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Devuelve 'YYYY-MM-DD' eligiendo el AÑO del período de la cartola tal que dd/mm
 * caiga dentro de [periodoDesde, periodoHasta]. Cubre cartolas que cruzan meses/años.
 */
export function resolveDateFromPeriod(
  day: number,
  month: number,
  periodoDesde: string | null,
  periodoHasta: string | null,
): string {
  const yHasta = periodoHasta ? parseInt(periodoHasta.slice(0, 4), 10) : null;
  const yDesde = periodoDesde ? parseInt(periodoDesde.slice(0, 4), 10) : null;
  // Preferir el año de `hasta` (las cartolas se nombran por el mes de cierre).
  const candidates = [...new Set([yHasta, yDesde].filter((y): y is number => y != null))];
  const start = periodoDesde ? Date.parse(`${periodoDesde}T00:00:00`) : -Infinity;
  const end = periodoHasta ? Date.parse(`${periodoHasta}T23:59:59`) : Infinity;
  for (const y of candidates) {
    const t = Date.parse(`${y}-${pad(month)}-${pad(day)}T12:00:00`);
    if (Number.isFinite(t) && t >= start && t <= end) return `${y}-${pad(month)}-${pad(day)}`;
  }
  const fallbackYear = yHasta ?? yDesde ?? new Date().getFullYear();
  return `${fallbackYear}-${pad(month)}-${pad(day)}`;
}

/** Extrae día/mes de una fecha 'YYYY-MM-DD' o 'dd/mm[/yyyy]'; ignora el año (puede venir mal). */
function dayMonth(fecha: string | undefined): { day: number; month: number } | null {
  if (!fecha) return null;
  let m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { day: parseInt(m[3], 10), month: parseInt(m[2], 10) };
  m = fecha.match(/^(\d{1,2})[/-](\d{1,2})/);
  if (m) return { day: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  return null;
}

/** Encuentra o crea la cuenta del usuario para este banco/producto. */
async function getOrCreateAccount(userId: string, banco: string): Promise<number> {
  const kind = accountKindForBanco(banco);
  const existing = await storage.getAccounts(userId);
  const match = existing.find(
    (a: { name?: string | null; type?: string | null; subtype?: string | null }) =>
      (a.name ?? "") === banco && a.type === kind.type && a.subtype === kind.subtype,
  );
  if (match) return match.id as number;
  const created = await storage.createAccount({
    userId,
    bankConnectionId: null,
    providerAccountId: null,
    name: banco,
    officialName: banco,
    type: kind.type,
    subtype: kind.subtype,
    currency: "CLP",
    mask: null,
    status: "active",
    openedAt: null,
  } as never);
  return created.id as number;
}

export interface NormalizeResult {
  accountId: number;
  inserted: number;
}

/**
 * Construye las filas de `transactions` a partir de un documento de cartola.
 * Pura (sin DB) para poder testear fechas, signo del monto, external_id
 * determinístico, flag interna y metadata USD. `accountId` y `isCredit` los
 * resuelve el caller (normalizeCartolaDoc) desde el banco.
 */
export function buildCartolaTransactionRows(
  input: NormalizeCartolaInput,
  accountId: number,
  banco: string,
): Record<string, unknown>[] {
  const isCredit = accountKindForBanco(banco).subtype === "credit_card";
  return input.transacciones.map((t, idx) => {
    const dm = dayMonth(t.fecha);
    const postedAt = dm
      ? resolveDateFromPeriod(dm.day, dm.month, input.periodoDesde, input.periodoHasta)
      : (input.periodoHasta ?? input.periodoDesde ?? new Date().toISOString().slice(0, 10));

    const cargo = t.cargo ?? 0;
    const abono = t.abono ?? 0;
    // Monto firmado: cargo (salida) negativo, abono (entrada) positivo.
    const amount = abono > 0 ? abono : -Math.abs(cargo);

    const desc = t.descripcion ?? "";
    const internal = isInternalByDescription(desc) ? 1 : 0;

    const base: Record<string, unknown> = {
      accountId,
      externalId: `score_upload:${input.documentId}:${idx}`,
      sourceDocumentId: input.documentId,
      postedAt,
      description: desc,
      merchantName: null,
      amount,
      currency: "CLP",
      amountClp: amount,
      category: t.categoria ?? null,
      categoryConfidence: t.category_confidence ?? null,
      categoryRuleId: t.category_rule_id ?? null,
      categorizerVersion: t.categorizer_version ?? null,
      isInternalTransfer: internal,
      pending: 0,
    };
    // Metadata USD para tarjeta internacional (no mezclar USD/CLP sin metadata).
    if (isCredit && /internacional/i.test(banco) && t.montoUsd != null) {
      base.originalAmount = t.montoUsd;
      base.originalCurrency = "USD";
      base.fxRate = t.fxRate ?? null;
    }
    return base;
  });
}

/**
 * Normaliza un documento de cartola a accounts/transactions. Idempotente: borra
 * las transacciones previas de este documentId antes de reinsertar.
 */
export async function normalizeCartolaDoc(
  input: NormalizeCartolaInput,
): Promise<NormalizeResult | null> {
  if (!db) return null;
  const banco = (input.banco ?? "").trim();
  if (!banco || !Array.isArray(input.transacciones) || input.transacciones.length === 0)
    return null;

  const accountId = await getOrCreateAccount(input.userId, banco);

  // Idempotencia: borrar lo derivado de este documento por external_id determinístico
  // (cubre tanto runs previos como el backfill manual, que no llenó source_document_id).
  await db
    .delete(transactions)
    .where(like(transactions.externalId, `score_upload:${input.documentId}:%`));

  const items = buildCartolaTransactionRows(input, accountId, banco);

  await storage.createTransactionsBulk(items as never);
  logger.info(
    { userId: input.userId, documentId: input.documentId, banco, count: items.length },
    "[normalizeCartola] normalizado",
  );
  return { accountId, inserted: items.length };
}

/** Borra las transacciones derivadas de un documento y marca cuentas vacías como inactivas. */
/** Cuenta las transacciones normalizadas derivadas de un score_document_upload. */
export async function countTransactionsForDocument(documentId: string): Promise<number> {
  if (!db) return 0;
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(like(transactions.externalId, `score_upload:${documentId}:%`));
  return rows.length;
}

export async function deleteTransactionsForDocument(
  userId: string,
  documentId: string,
): Promise<number> {
  if (!db) return 0;
  // Cuentas afectadas (para revisar si quedan vacías).
  const prefix = `score_upload:${documentId}:%`;
  const affected = await db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(like(transactions.externalId, prefix));
  const accountIds = [
    ...new Set(affected.map((r: { accountId: number }) => r.accountId as number)),
  ];

  const deleted = await db
    .delete(transactions)
    .where(like(transactions.externalId, prefix))
    .returning();

  // Si una cuenta del usuario queda sin transacciones, marcarla inactiva (no borrar).
  for (const accId of accountIds) {
    const [remain] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.accountId, accId))
      .limit(1);
    if (!remain) {
      await db
        .update(accounts)
        .set({ status: "inactive", updatedAt: new Date().toISOString() })
        .where(and(eq(accounts.id, accId), eq(accounts.userId, userId)));
    }
  }
  return deleted.length;
}
