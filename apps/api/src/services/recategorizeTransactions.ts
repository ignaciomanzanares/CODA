import { inArray } from "drizzle-orm";
import { accounts, db, eq, transactions } from "../db/index.js";
import { categorize, TAXONOMY, CATEGORIZER_VERSION } from "../parsers/merchantCategorizer.js";
import { isManualCategory } from "./transactions/reviewStatus.js";

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

  for (const row of rows as Array<Record<string, unknown>>) {
    const description = String(row.description ?? "").trim();
    if (!description) continue;

    // No pisar correcciones manuales del usuario (salvo force explícito).
    if (!options.force && isManualCategory({
      categoryRuleId: (row.categoryRuleId as string) ?? null,
      categorizerVersion: (row.categorizerVersion as string) ?? null,
    })) {
      skippedManual++;
      continue;
    }

    scanned++;
    const amount = Number(row.amount ?? 0);
    const result = categorize({
      descripcion: description,
      monto: Math.abs(amount),
      tipo: amount >= 0 ? "abono" : "cargo",
      internalTransfer: Number(row.isInternalTransfer ?? 0) === 1,
    });
    const next = {
      category: legacyCategory(result),
      subcategory: result.subcategory ?? null,
      categoryConfidence: result.confidence,
      categoryRuleId: result.ruleId,
      categorizerVersion: result.version,
    };

    if (
      changed(row.category, next.category) ||
      changed(row.subcategory, next.subcategory) ||
      changed(row.categoryConfidence, next.categoryConfidence) ||
      changed(row.categoryRuleId, next.categoryRuleId) ||
      changed(row.categorizerVersion, next.categorizerVersion)
    ) {
      await db
        .update(transactions)
        .set(next)
        .where(eq(transactions.id, row.id as number));
      updated++;
    }
  }

  return { scanned, updated, skippedManual, version: CATEGORIZER_VERSION };
}
