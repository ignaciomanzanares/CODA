/**
 * Fuente ÚNICA de la lógica "¿esta transacción requiere revisión manual de
 * categoría?". La usan: el flag que expone /api/transactions/parsed (que a su vez
 * alimenta el badge "Revisar categoría" y el filtro "Por revisar" del front), el
 * conteo de pendientes y los tests. Mantener un solo criterio evita que el badge y
 * el filtro se desincronicen.
 *
 * Convención de corrección MANUAL (para distinguir automático vs manual y para que
 * el recategorizador no pise correcciones del usuario):
 *   category_rule_id      = "manual:user"
 *   category_confidence   = 1
 *   categorizer_version   = "manual"
 */
export const MANUAL_RULE_ID = "manual:user";
export const MANUAL_CATEGORIZER_VERSION = "manual";
export const MANUAL_CONFIDENCE = 1;

export interface ReviewableTx {
  category?: string | null;
  categoryConfidence?: number | null;
  categoryRuleId?: string | null;
  categorizerVersion?: string | null;
}

/** Confianza por debajo de la cual una categoría automática se considera incierta. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.5;

/** ¿La categoría fue fijada manualmente por el usuario? (no se vuelve a revisar). */
export function isManualCategory(tx: ReviewableTx): boolean {
  return (
    tx.categoryRuleId === MANUAL_RULE_ID || tx.categorizerVersion === MANUAL_CATEGORIZER_VERSION
  );
}

/**
 * ¿La transacción requiere revisión manual de categoría?
 * Criterios (equivalentes al badge actual + exclusión de manuales):
 *  - categoría vacía / "otro" / "otros" (acepta slug o etiqueta, case-insensitive);
 *  - confianza por debajo del umbral;
 *  - regla de respaldo explícita ("fallback.*" / "unknown").
 * Las correcciones manuales NUNCA requieren revisión.
 */
export function requiresReview(tx: ReviewableTx): boolean {
  if (isManualCategory(tx)) return false;

  const cat = String(tx.category ?? "")
    .trim()
    .toLowerCase();
  if (cat === "" || cat === "otro" || cat === "otros") return true;

  if (
    typeof tx.categoryConfidence === "number" &&
    tx.categoryConfidence < REVIEW_CONFIDENCE_THRESHOLD
  ) {
    return true;
  }

  const rule = String(tx.categoryRuleId ?? "").toLowerCase();
  if (rule.startsWith("fallback") || rule.includes("unknown")) return true;

  return false;
}

/** Cuenta cuántas transacciones de una lista requieren revisión. */
export function countRequiresReview(txs: ReviewableTx[]): number {
  return txs.reduce((n, tx) => (requiresReview(tx) ? n + 1 : n), 0);
}
