/**
 * Servicio de Consentimiento SFA (RAR + Grant Management).
 * Puerta de entrada legal para el uso de datos; alimenta el Panel de Control de Consentimientos.
 */

export { ConsentService, getConsentService } from "./consentService.js";
export {
  buildAuthorizationDetails,
  serializeAuthorizationDetails,
  parseAuthorizationDetails,
} from "./rar.js";
export type {
  ConsentGrantStatus,
  ConsentResourceType,
  AuthorizationDetail,
  AuthorizationDetails,
  CreateConsentInput,
  ConsentGrantRecord,
  ConsentGrantForPanel,
  ConsentWebhookPayload,
} from "./types.js";
export {
  CONSENT_PURPOSE_CODA,
  CONSENT_PURPOSE_MAX_LENGTH,
  CONSENT_POLICY_VERSION,
} from "./types.js";
export { handleConsentWebhook } from "./webhooks.js";
