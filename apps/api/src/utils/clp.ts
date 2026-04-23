/**
 * Chilean Peso (CLP) number utilities.
 *
 * Chilean monetary strings use DOT as the thousands separator and COMMA as the
 * (rarely used) decimal separator.
 *
 *   "973.959"       → 973 959 pesos  (NOT 973.959)
 *   "1.234.567"     → 1 234 567 pesos
 *   "50.000,50"     → 50 000.50 pesos (rounded to 50 001)
 *   "$1.200"        → 1 200 pesos
 *   1200            → 1200 (passthrough for numbers)
 *
 * Using plain `parseFloat("973.959")` gives 973.959 — off by 1000×.
 * Always use `parseCLP()` for any monetary string from Chilean PDF text.
 */

/**
 * Parse a Chilean-formatted monetary string to an integer number of pesos.
 *
 * @param input  Raw string like "973.959", "1.234.567", "$50.000,50", or a number.
 * @returns      Integer pesos (rounded). Returns 0 for non-parseable input.
 */
export function parseCLP(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : 0;

  const s = String(input)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!s) return 0;

  // Determine if the last separator is a decimal comma (e.g. "50.000,50")
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;

  if (lastComma !== -1 && lastComma > lastDot) {
    // Chilean decimal: "50.000,50" → "50000.50"
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Dots are all thousands separators: "973.959" or "1.234.567"
    // Strip dots, keep any comma that might be a decimal (shouldn't exist after the last dot)
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
