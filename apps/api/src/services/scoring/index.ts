/**
 * Motor de scoring crediticio – Score Transaccional SFA y PD tradicional.
 */

export { SfaScoringEngine, getSfaScoringEngine } from './sfaScoringEngine.js';
export type { SfaScoringInput, SfaScoringResult } from './types.js';
export { toClp, DEFAULT_EXCHANGE_RATES_CLP, type ExchangeRatesToClp, type MsiCurrencyCode } from './currency.js';
