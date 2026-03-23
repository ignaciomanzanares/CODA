/**
 * Consentimientos por finalidad (app CODA), auditable para CMF / Ley 19.628.
 * No confundir con consent_grants (SFA / Open Finance).
 */

/** Versión actual de la política de privacidad y bases legales (debe alinearse con documentos legales). */
export const PRIVACY_POLICY_VERSION = '1.0';

/** Finalidades con clave estable para API y base de datos. */
export const PRIVACY_PURPOSE_KEYS = [
  'data_processing',
  'open_banking',
  'scoring',
  'recommendations',
  'marketing',
  'origination_transfer',
] as const;

export type PrivacyPurposeKey = (typeof PRIVACY_PURPOSE_KEYS)[number];

export type PrivacyConsentAction = 'accepted' | 'revoked';

/** Textos para UI y documentación (español). */
export const PRIVACY_PURPOSE_LABELS: Record<PrivacyPurposeKey, { title: string; description: string }> = {
  data_processing: {
    title: 'Tratamiento de datos personales',
    description:
      'Uso de tus datos de cuenta y perfil para operar el servicio, soporte y mejoras del producto.',
  },
  open_banking: {
    title: 'Acceso a datos bancarios (Open Finance)',
    description:
      'Lectura de cuentas y movimientos mediante el estándar SFA, cuando conectes tu banco.',
  },
  scoring: {
    title: 'Score crediticio y transaccional',
    description:
      'Cálculo de indicadores de riesgo y comportamiento financiero a partir de la información autorizada.',
  },
  recommendations: {
    title: 'Recomendaciones de productos',
    description:
      'Mostrarte ofertas de productos financieros adecuados a tu perfil dentro de la plataforma.',
  },
  marketing: {
    title: 'Comunicaciones comerciales',
    description:
      'Envío de novedades, promociones y ofertas por canales electrónicos (opcional).',
  },
  origination_transfer: {
    title: 'Evaluación con institución financiera',
    description:
      'Cuando solicites un producto, compartir datos necesarios con el proveedor para evaluar tu solicitud.',
  },
};

/** Obligatorios al crear cuenta (producto no puede prestarse sin ellos). */
export const REGISTRATION_REQUIRED_PURPOSES: PrivacyPurposeKey[] = [
  'data_processing',
  'scoring',
  'recommendations',
];

export interface PrivacyConsentEventMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  channel?: string;
}

export interface PrivacyPurposeState {
  purpose: PrivacyPurposeKey;
  accepted: boolean;
  policyVersion: string | null;
  lastAction: PrivacyConsentAction | null;
  updatedAt: string | null;
}

export interface PrivacyConsentPanelResponse {
  policyVersion: string;
  purposes: PrivacyPurposeState[];
}

export interface PrivacyAuditEventRow {
  id: number;
  purpose: PrivacyPurposeKey;
  policyVersion: string;
  action: PrivacyConsentAction;
  channel: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
