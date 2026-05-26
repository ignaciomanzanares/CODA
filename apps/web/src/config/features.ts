/**
 * Feature flags for the CODA web client.
 *
 * Values are baked in at build time from `VITE_*` environment variables.
 * Defaults match the committed `.env.production` — keep regulated features
 * disabled by default and require explicit opt-in to enable them.
 *
 * Flipping `codaEmpresas` to `true` (via `VITE_ENABLE_CODA_EMPRESAS=true`)
 * REQUIRES a separate CMF authorization aligned to our giro exclusivo
 * (Ley N° 21.521, art. 5 inciso primero y art. 6 inciso tercero). Do not
 * enable in production without the regulator's prior approval.
 */

export const FEATURES = {
  codaEmpresas: import.meta.env.VITE_ENABLE_CODA_EMPRESAS === "true",
} as const;
