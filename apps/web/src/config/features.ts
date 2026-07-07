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
  /**
   * Onboarding de primer ingreso (consentimiento + KYC mock + 2FA). Apagado por
   * defecto: con el flag OFF, signup/login no cambian. Encendido, tras crear
   * cuenta / primer login se muestra el flujo de 3 pasos y el 2FA pasa a ser
   * obligatorio antes de vincular un banco (requiere también ENABLE_ONBOARDING=true
   * en la API para el bloqueo de vinculación bancaria).
   */
  onboarding: import.meta.env.VITE_ENABLE_ONBOARDING === "true",
  /**
   * Doble evaluador de riesgo (tarjeta de score tradicional + transaccional CODA beta).
   * OFF por defecto: con el flag apagado, el dashboard muestra el ScoreHero/CreditScoreCard actuales.
   * Encendido (VITE_ENABLE_RISK_DUAL_SCORE=true), la tarjeta consume /api/risk/evaluation y muestra
   * titular + segunda opinión según segmento. Beta hasta calibrar con outcomes locales (Fase G).
   */
  riskDualScore: import.meta.env.VITE_ENABLE_RISK_DUAL_SCORE === "true",
} as const;
