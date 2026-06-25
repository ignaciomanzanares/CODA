/**
 * Anclaje temporal de métricas/tendencias del dashboard.
 *
 * Regla: las ventanas de "últimos N días/meses" se anclan a la ÚLTIMA fecha CON
 * DATOS del usuario, NO a `new Date()`. Así una cartola histórica (p. ej. may/jun
 * 2025) sigue mostrando ingresos/gastos/tendencias en vez de devolver 0 sólo porque
 * hoy es 2026. Si el usuario no tiene transacciones, el caller usa `new Date()`
 * (estado vacío) — esta función devuelve null en ese caso.
 */
export function latestPostedAt(txs: Array<{ postedAt?: string | null }>): Date | null {
  return txs.reduce((max: Date | null, t) => {
    if (!t?.postedAt) return max;
    const d = new Date(t.postedAt);
    return !isNaN(d.getTime()) && (max === null || d > max) ? d : max;
  }, null as Date | null);
}
