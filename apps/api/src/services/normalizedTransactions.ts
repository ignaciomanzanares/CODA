/**
 * Lector único de la FUENTE DE VERDAD para métricas: la tabla `transactions`
 * (normalizada desde las cartolas) + `accounts`. Todas las superficies de métricas
 * (summary, monthly-comparison, monthly-flow, insights, financial-health,
 * product matching, assistant context) deben leer de aquí, NO de
 * `document_uploads.parsed_data` (que queda sólo como auditoría/legacy).
 *
 * Cada fila se entrega en una forma uniforme que sirve a la vez para:
 *  - agregación (amount firmado + magnitudes cargo/abono + tipo + month/day);
 *  - el predicado consolidado `isInternalTransferTx` (lee la columna autoritativa
 *    `is_internal_transfer` y, como respaldo, description/category).
 */
import { storage } from "../storage.js";

export interface NormalizedTx {
  id: string;
  accountId: number;
  postedAt: string; // YYYY-MM-DD (año ya corregido por normalizeCartola)
  month: string; // YYYY-MM
  day: number; // 1-31
  amount: number; // firmado: cargo negativo, abono positivo
  cargo: number; // magnitud del egreso (>= 0)
  abono: number; // magnitud del ingreso (>= 0)
  tipo: "ingreso" | "egreso";
  descripcion: string;
  description: string; // alias para isInternalTransferTx
  categoria: string;
  category: string; // categoría cruda (para el predicado por etiqueta)
  isInternalTransfer: boolean;
  is_internal_transfer: number; // 0/1 — señal autoritativa para el predicado
  accountName: string | null;
  accountType: string | null;
  accountSubtype: string | null;
  product: string;
  productLabel: string;
}

export interface NormalizedAccount {
  id: number;
  name?: string | null;
  type?: string | null;
  subtype?: string | null;
  status?: string | null;
}

/** Producto legible + clave de filtro (Cuenta corriente / TC Nacional / TC Internacional). */
export function productOf(a: { name?: string | null; subtype?: string | null } | undefined): {
  key: string;
  label: string;
} {
  const name = a?.name ?? "Cuenta";
  if (a?.subtype === "credit_card") {
    if (/internacional/i.test(name))
      return { key: "tc_internacional", label: `${name} · Tarjeta crédito` };
    if (/nacional/i.test(name)) return { key: "tc_nacional", label: `${name} · Tarjeta crédito` };
    return { key: "tc", label: `${name} · Tarjeta crédito` };
  }
  return { key: "checking", label: `${name} · Cuenta corriente` };
}

/**
 * Lee las transacciones normalizadas del usuario (fuente de verdad) y las devuelve
 * en la forma uniforme. Las superficies de métricas excluyen las internas vía
 * `isInternalTransferTx` cuando corresponde (cada una mantiene su política).
 */
export async function getUserNormalizedTransactions(
  userId: string,
): Promise<{ accounts: NormalizedAccount[]; transactions: NormalizedTx[] }> {
  const accounts = (await storage.getAccounts(userId)) as NormalizedAccount[];
  const accById = new Map<number, NormalizedAccount>(accounts.map((a) => [a.id, a]));
  const accIds = accounts.map((a) => a.id);
  const rows = accIds.length ? await storage.getTransactionsForAccounts(accIds) : [];

  const transactions = (rows as Array<Record<string, unknown>>).map((t) => {
    const acc = accById.get(t.accountId as number);
    const amount = Number(t.amount);
    const postedAt = String(t.postedAt).slice(0, 10);
    const prod = productOf(acc);
    const internal = Number(t.isInternalTransfer ?? 0) === 1;
    return {
      id: String(t.id),
      accountId: t.accountId as number,
      postedAt,
      month: postedAt.slice(0, 7),
      day: Number(postedAt.slice(8, 10)) || 1,
      amount,
      cargo: amount < 0 ? Math.abs(amount) : 0,
      abono: amount > 0 ? amount : 0,
      tipo: amount >= 0 ? ("ingreso" as const) : ("egreso" as const),
      descripcion: (t.description as string) ?? "",
      description: (t.description as string) ?? "",
      categoria: (t.category as string) ?? "otro",
      category: (t.category as string) ?? "otro",
      isInternalTransfer: internal,
      is_internal_transfer: internal ? 1 : 0,
      accountName: acc?.name ?? null,
      accountType: acc?.type ?? null,
      accountSubtype: acc?.subtype ?? null,
      product: prod.key,
      productLabel: prod.label,
    };
  });

  transactions.sort((a, b) => (b.postedAt > a.postedAt ? 1 : b.postedAt < a.postedAt ? -1 : 0));
  return { accounts, transactions };
}

/**
 * Saldo REPORTADO por el banco en la última cartola (snapshot, no es una métrica
 * derivada de `transactions`). Es el único origen disponible para "saldo actual"
 * (la tabla `transactions` no guarda saldos), por eso se lee de parsed_data —
 * acotado a este punto y claramente etiquetado como dato reportado/legacy.
 */
export async function getReportedBalance(userId: string): Promise<number | null> {
  const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
  if (!cartolas.length) return null;
  const pd = cartolas[0]?.parsedData as { saldo_final?: number; saldoFinal?: number } | null;
  return pd?.saldo_final ?? pd?.saldoFinal ?? null;
}
