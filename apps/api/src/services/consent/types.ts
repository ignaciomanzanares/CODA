/**
 * Tipos para Consentimiento SFA: RAR (RFC 9396) y Grant Management.
 * Consentimiento granular: solo se solicitan los datos necesarios (ej. score de cuentas sin seguros).
 */

/** Estados del ciclo de vida del consentimiento (Grant Management). */
export type ConsentGrantStatus =
  | "pending" // Autorización pendiente (esperando decisión del usuario en el banco)
  | "authorized" // Autorizado
  | "rejected" // Rechazado
  | "revoked" // Revocado (por el usuario o el banco)
  | "expired"; // Expirado

/**
 * Tipos de recurso para autorización granular (solo pedir lo necesario).
 * Incluye recursos SFA/banco (RFC 9396) y las fuentes oficiales del nivel 1.
 */
export type ConsentResourceType =
  // — SFA / banco —
  | "account_information" // Cuentas, saldos, transacciones (para score transaccional)
  | "products_vigentes" // Productos vigentes
  | "historical_positions" // Posiciones financieras históricas
  | "terms_and_conditions" // T&C (catálogo)
  | "payment_initiation" // Iniciación de pagos (futuro)
  // — Fuentes oficiales (nivel 1) —
  | "cmf_debt_report" // Informe de Deudas CMF (deuda directa/indirecta/morosa)
  | "sii_tax_data" // Carpeta tributaria y DDJJ (renta) — SII
  | "afc_employment"; // Cotizaciones y vínculo laboral — AFC

/** Acciones posibles por tipo (RFC 9396). */
export type ConsentAction =
  | "list_accounts"
  | "read_balances"
  | "read_transactions"
  | "read_products"
  | "read"
  | "initiate"
  | "status"
  | "cancel";

/**
 * Un elemento de authorization_details (RFC 9396).
 * type + actions + locations (y opcionales según tipo).
 */
export interface AuthorizationDetail {
  type: ConsentResourceType;
  actions?: ConsentAction[];
  locations?: string[];
  datatypes?: string[];
  identifier?: string;
  [key: string]: unknown;
}

/** authorization_details: array de objetos para consentimiento granular. */
export type AuthorizationDetails = AuthorizationDetail[];

/** Finalidad del consentimiento (máx. 300 caracteres, español). */
export const CONSENT_PURPOSE_CODA =
  "Los datos se utilizarán exclusivamente para el análisis de salud financiera y la evaluación de riesgo de crédito por parte de CODA (Chile Open-Data Analytics SpA), incluyendo el cálculo del Score Transaccional y la recomendación de productos financieros adecuados a su perfil. No se utilizarán para otros fines sin su consentimiento previo.";

export const CONSENT_PURPOSE_MAX_LENGTH = 300;

/** Versión de la política de consentimiento (auditoría). */
export const CONSENT_POLICY_VERSION = "1.0";

export interface CreateConsentInput {
  userId: string;
  /** Scope granular: solo los tipos que se necesitan (ej. account_information para score). */
  resourceTypes: ConsentResourceType[];
  /** Descripción de finalidad en español, máx. 300 caracteres. */
  purpose?: string;
  /** Identificador del grant en el AS del banco (opcional hasta recibir callback). */
  externalGrantId?: string | null;
  /** Identificador de la IPI (banco) si aplica. */
  ipiId?: string | null;
  /** Fecha de expiración del consentimiento (ISO). */
  expiresAt?: string | null;
}

export interface ConsentGrantRecord {
  id: number;
  userId: string;
  status: ConsentGrantStatus;
  authorizationDetails: string;
  purpose: string;
  policyVersion: string;
  externalGrantId: string | null;
  ipiId: string | null;
  expiresAt: string | null;
  evidenceHash: string | null;
  sealedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentGrantForPanel {
  id: number;
  userId: string;
  status: ConsentGrantStatus;
  /** Scope otorgado (parseado para el panel). */
  scope: AuthorizationDetails;
  purpose: string;
  policyVersion: string;
  externalGrantId: string | null;
  ipiId: string | null;
  expiresAt: string | null;
  /** Evidencia sellada (D2): hash de lo consentido + momento del sello. null si sin sellar. */
  evidenceHash: string | null;
  sealedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload que puede enviar el banco por webhook al cambiar el estado del consentimiento. */
export interface ConsentWebhookPayload {
  externalGrantId: string;
  status: ConsentGrantStatus;
  ipiId?: string;
  expiresAt?: string | null;
  updatedAt?: string;
}
