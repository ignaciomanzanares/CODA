export { evaluateHealthV2, HEALTH_EVALUATION_ENGINE_VERSION } from "./evaluationEngine.js";
export type { EvaluateHealthOptions } from "./evaluationEngine.js";
export { deriveHealthInput } from "./ratiosDerivation.js";
export {
  evaluateUserHealth,
  explainUserHealth,
  explainHealthFromProfile,
  normalizeCmfData,
  estimarCuotaMensual,
} from "./userHealthService.js";
export { explainHealthV2 } from "./healthExplain.js";
export type { HealthAudit, HealthAuditStep } from "./healthExplain.js";
export type {
  HealthEvaluationInput,
  HealthEvaluationResult,
  HealthLevel,
  HealthSalida,
  HealthZone,
  RecommendedProduct,
  RatioDerivationInput,
} from "./types.js";
