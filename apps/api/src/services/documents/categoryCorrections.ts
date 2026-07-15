/**
 * Registro de correcciones de categoría del usuario (#31) — el "hook" que alimenta el
 * clasificador incremental. Inserta la corrección en `transaction_category_corrections` y
 * actualiza el modelo en memoria de inmediato (aprendizaje incremental).
 */
import { randomUUID } from "node:crypto";
import { db, transactionCategoryCorrections } from "../../db/index.js";
import { categoryClassifier, tokenize } from "./categoryClassifier.js";
import { logger } from "../../logger.js";

export async function recordCategoryCorrection(params: {
  userId: string;
  text: string;
  correctedCategory: string;
  originalCategory?: string | null;
}): Promise<{ ok: boolean }> {
  const normalizedText = tokenize(params.text).join(" ");
  if (!normalizedText || !params.correctedCategory.trim()) {
    return { ok: false };
  }

  await db.insert(transactionCategoryCorrections).values({
    id: randomUUID(),
    userId: params.userId,
    normalizedText,
    originalCategory: params.originalCategory ?? null,
    correctedCategory: params.correctedCategory.trim(),
  });

  // Aprendizaje incremental: el modelo se actualiza y se persiste en blob store (cada 10 ejemplos).
  await categoryClassifier.ensureLoaded();
  categoryClassifier.learnAndPersist(normalizedText, params.correctedCategory.trim());
  logger.info(
    { userId: params.userId, correctedCategory: params.correctedCategory },
    "[categoryCorrections] corrección registrada",
  );

  return { ok: true };
}
