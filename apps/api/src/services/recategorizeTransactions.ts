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
import { aiCategorizeDescriptions, AI_RULE_ID, AI_CONFIDENCE } from "./documents/aiCategorize.js";

export interface RecategorizeResult {
  scanned: number;
  updated: number;
  skippedManual: number;
  /** Cuántas quedaron categorizadas por el fallback de IA (subset de `updated`). */
  aiCategorized: number;
  version: string;
}

export interface RecategorizeOptions {
  /** Si es true, también re-categoriza las correcciones manuales del usuario.
   *  Por defecto NO: el botón normal nunca pisa lo que el usuario corrigió a mano. */
  force?: boolean;
  /** Fallback de IA para lo que las reglas dejan en "otro". Default: true. */
  ai?: boolean;
}

/** Glosa de transferencia a/de persona (PII de terceros → NO se manda a la IA). */
const PERSON_TRANSFER_RE = /\bTRANSF|\bTEF\b|TRASPASO|\bGIRO\s+A\b/i;

function legacyCategory(result: ReturnType<typeof categorize>): string {
  return result.category === "Transferencia interna"
    ? "Transferencia interna"
    : TAXONOMY[result.category].legacy;
}

function changed(a: unknown, b: unknown): boolean {
  return (a ?? null) !== (b ?? null);
}

function rowChanged(row: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return (
    changed(row.category, next.category) ||
    changed(row.subcategory, next.subcategory) ||
    changed(row.categoryConfidence, next.categoryConfidence) ||
    changed(row.categoryRuleId, next.categoryRuleId) ||
    changed(row.categorizerVersion, next.categorizerVersion) ||
    changed(Number(row.isInternalTransfer ?? 0), next.isInternalTransfer)
  );
}

export async function recategorizeUserTransactions(
  userId: string,
  options: RecategorizeOptions = {},
): Promise<RecategorizeResult> {
  if (!db)
    return {
      scanned: 0,
      updated: 0,
      skippedManual: 0,
      aiCategorized: 0,
      version: CATEGORIZER_VERSION,
    };

  const userAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, String(userId)));

  const accountIds = userAccounts.map((account: { id: number }) => account.id);
  if (accountIds.length === 0) {
    return {
      scanned: 0,
      updated: 0,
      skippedManual: 0,
      aiCategorized: 0,
      version: CATEGORIZER_VERSION,
    };
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds));

  let scanned = 0;
  let updated = 0;
  let skippedManual = 0;

  // Fase 1 (sync): calcular la categoría por reglas de cada fila. Una fila
  // corrupta (glosa indescifrable) se registra y se salta, nunca aborta el batch.
  type Update = { id: number; next: Record<string, unknown> };
  const pending: Update[] = [];
  // Filas que las reglas dejaron en "otro" → candidatas al fallback de IA.
  type Unmatched = {
    id: number;
    description: string;
    row: Record<string, unknown>;
    next: Record<string, unknown>;
  };
  const unmatched: Unmatched[] = [];

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
      const amount = Number(row.amount ?? 0);
      // Conservar lo puesto por IA SOLO en egresos (donde el fallback aplica) y sin
      // re-consultar el LLM. Si por error quedó una IA en un abono (ingreso), se
      // re-evalúa para devolverla a ingreso/Sin categoría.
      if (amount < 0 && String(row.categoryRuleId ?? "").startsWith("ai.")) continue;

      scanned++;
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

      // EGRESOS no reconocidos ("otro") y que NO son transferencia a persona → al
      // fallback de IA (fase 1.5). La lista que ve la IA es de gasto, así que los
      // ABONOS (ingresos) NO se mandan: quedan como ingreso/Sin categoría, nunca
      // como un gasto. El resto se persiste directo.
      if (
        options.ai !== false &&
        amount < 0 &&
        next.category === "otro" &&
        !PERSON_TRANSFER_RE.test(description)
      ) {
        unmatched.push({ id: row.id as number, description, row, next });
      } else if (rowChanged(row, next)) {
        pending.push({ id: row.id as number, next });
      }
    } catch (rowErr) {
      logger.warn({ err: rowErr, rowId: row.id }, "recategorize: fila omitida");
    }
  }

  // Fase 1.5: fallback de IA para lo no reconocido por reglas (best-effort — si
  // no hay proveedor o falla, quedan "otro"/Sin categoría, sin empeorar nada).
  let aiCategorized = 0;
  if (unmatched.length > 0) {
    const aiMap = await aiCategorizeDescriptions(unmatched.map((u) => u.description));
    for (const u of unmatched) {
      const aiSlug = aiMap.get(u.description);
      if (aiSlug) {
        u.next.category = aiSlug;
        u.next.subcategory = null;
        u.next.categoryConfidence = AI_CONFIDENCE;
        u.next.categoryRuleId = AI_RULE_ID;
        aiCategorized++;
      }
      if (rowChanged(u.row, u.next)) pending.push({ id: u.id, next: u.next });
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

  return { scanned, updated, skippedManual, aiCategorized, version: CATEGORIZER_VERSION };
}
