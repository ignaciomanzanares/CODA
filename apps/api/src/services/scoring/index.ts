/**
 * Utilidades de scoring. El motor heurístico SFA (`sfaScoringEngine`) fue eliminado: el score
 * transaccional lo produce ahora el modelo XGB (`services/risk/transactionalScore.ts`) y las métricas
 * de liquidez viven en `services/risk/liquidityMetrics.ts`.
 */

export { toClp, DEFAULT_EXCHANGE_RATES_CLP, type ExchangeRatesToClp, type MsiCurrencyCode } from './currency.js';
