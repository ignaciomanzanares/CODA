import { inArray } from "drizzle-orm";
import { accounts, db, eq, transactions } from "../db/index.js";
import {
  categorize,
  isInternalTransferDesc,
  TAXONOMY,
  CATEGORIZER_VERSION,
} from "../parsers/merchantCategorizer.js";
import { isManualCategory } from "./transactions/reviewStatus.js";
import { looksEncrypted, decryptField } from "./crypto/fieldEncryption.js";
import { logger } from "../logger.js";

export interface RecategorizeResult {
  scanned: number;
  updated: number;
  skippedManual: number;
  version: string;
}

export interface RecategorizeOptions {
  /** Si es true, también re-categoriza las correcciones manuales del usuario.
   *  Por defecto NO: el botón normal nunca pisa lo que el usuario corrigió a mano. */
  force?: boolean;
}

function legacyCategory(result: ReturnType<typeof categorize>): string {
  return result.category === "Transferencia interna"
    ? "Transferencia interna"
    : TAXONOMY[result.category].legacy;
}

function changed(a: unknown, b: unknown): boolean {
  return (a ?? null) !== (b ?? null);
}

export async function recategorizeUserTransactions(
  userId: string,
  options: RecategorizeOptions = {},
): Promise<RecategorizeResult> {
  if (!db) return { scanned: 0, updated: 0, skippedManual: 0, version: CATEGORIZER_VERSION };

  const userAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, String(userId)));

  const accountIds = userAccounts.map((account: { id: number }) => account.id);
  if (accountIds.length === 0) {
    return { scanned: 0, updated: 0, skippedManual: 0, version: CATEGORIZER_VERSION };
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds));

  let scanned = 0;
  let updated = 0;
  let skippedManual = 0;

  // Fase 1 (sync): calcular la categoría nueva de cada fila y juntar las que
  // cambian. Una fila corrupta (glosa indescifrable) se registra y se salta,
  // nunca aborta el batch.
  type Update = { id: number; next: Record<string, unknown> };
  const pending: Update[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    try {
      // `transactions.description` se cifra en reposo (fieldEncryption); descifrar para
      // categorizar. Tolera filas legacy en claro vía looksEncrypted.
      const rawDesc = row.description;
      const description = String(
        typeof rawDesc === "string" && looksEncrypted(rawDesc)
          ? decryptField(rawDesc)
          : (rawDesc ?? ""),
      ).trim();
      if (!description) continue;

      // No pisar correcciones manuales del usuario (salvo force explícito).
      if (
        !options.force &&
        isManualCategory({
          categoryRuleId: (row.categoryRuleId as string) ?? null,
          categorizerVersion: (row.categorizerVersion as string) ?? null,
        })
      ) {
        skippedManual++;
        continue;
      }

      scanned++;
      const amount = Number(row.amount ?? 0);
      // Re-evaluar el flag interno con las reglas ACTUALES (solo escalar a interna,
      // nunca desmarcar: el parser puede haberla marcado por señales que la glosa
      // sola no captura). Permite reparar filas históricas cuando se amplían los
      // patrones (p. ej. "TRASPASO DE DEUDA…", que contaba como ingreso).
      const wasInternal = Number(row.isInternalTransfer ?? 0) === 1;
      const isInternal = wasInternal || isInternalTransferDesc(description);
      const result = categorize({
        descripcion: description,
        monto: Math.abs(amount),
        tipo: amount >= 0 ? "abono" : "cargo",
        internalTransfer: isInternal,
      });
      const next = {
        category: legacyCategory(result),
        subcategory: result.subcategory ?? null,
        categoryConfidence: result.confidence,
        categoryRuleId: result.ruleId,
        categorizerVersion: result.version,
        isInternalTransfer: isInternal ? 1 : 0,
      };

      if (
        changed(row.category, next.category) ||
        changed(row.subcategory, next.subcategory) ||
        changed(row.categoryConfidence, next.categoryConfidence) ||
        changed(row.categoryRuleId, next.categoryRuleId) ||
        changed(row.categorizerVersion, next.categorizerVersion) ||
        changed(Number(row.isInternalTransfer ?? 0), next.isInternalTransfer)
      ) {
        pending.push({ id: row.id as number, next });
      }
    } catch (rowErr) {
      logger.warn({ err: rowErr, rowId: row.id }, "recategorize: fila omitida");
    }
  }

  // Fase 2: persistir en tandas concurrentes acotadas. Antes eran cientos de
  // UPDATE secuenciales (un bump de versión toca TODAS las filas) → tardaba
  // demasiado y el proxy cortaba el request ("No se pudieron recategorizar").
  const CONCURRENCY = 12;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + CONCURRENCY).map((u) =>
        db
          .update(transactions)
          .set(u.next)
          .where(eq(transactions.id, u.id))
          .then(() => {
            updated++;
          })
          .catch((e: unknown) => {
            logger.warn({ err: e, rowId: u.id }, "recategorize: update falló");
          }),
      ),
    );
  }

  return { scanned, updated, skippedManual, version: CATEGORIZER_VERSION };
}
