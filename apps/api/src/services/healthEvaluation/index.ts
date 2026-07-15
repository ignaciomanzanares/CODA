export { evaluateHealthV2, HEALTH_EVALUATION_ENGINE_VERSION } from "./evaluationEngine.js";
export type { EvaluateHealthOptions } from "./evaluationEngine.js";
export { deriveHealthInput } from "./ratiosDerivation.js";
export { evaluateUserHealth, normalizeCmfData, estimarCuotaMensual } from "./userHealthService.js";
export type {
  HealthEvaluationInput,
  HealthEvaluationResult,
  HealthLevel,
  HealthSalida,
  HealthZone,
  RecommendedProduct,
  RatioDerivationInput,
} from "./types.js";
