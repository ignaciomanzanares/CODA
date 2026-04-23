/**
 * Chilean Peso (CLP) number utilities (frontend mirror of apps/api/src/utils/clp.ts).
 *
 * Chilean monetary strings use DOT as the thousands separator and COMMA as the
 * (rarely used) decimal separator.
 *
 *   "973.959"       → 973 959 pesos  (NOT 973.959)
 *   "1.234.567"     → 1 234 567 pesos
 *   "50.000,50"     → 50 000.50 pesos (rounded to 50 001)
 *   "$1.200"        → 1 200 pesos
 *   1200            → 1200 (passthrough for numbers)
 */

/**
 * Parse a Chilean-formatted monetary string to an integer number of pesos.
 */
export function parseCLP(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : 0;

  const s = String(input)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;

  if (lastComma !== -1 && lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/\./g, "").replace(",", ".");
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Format an integer number of CLP pesos for display.
 *
 * @example formatCLP(973959) → "$ 973.959"
 */
export function formatCLP(pesos: number): string {
  return `$ ${Math.round(pesos).toLocaleString("es-CL")}`;
}
