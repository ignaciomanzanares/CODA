/**
 * Quién autoriza qué (D2).
 *
 * El modelo SFA asume que el consentimiento lo autoriza el BANCO en su propio servidor y llega
 * por webhook. Eso dejó un hueco: para las fuentes oficiales del nivel 1 (CMF, SII, AFC) no hay
 * banco que avise, así que sus grants se quedaban en `pending` para siempre y el gate de
 * `withSourceAccess` era inalcanzable — ningún conector podía correr nunca.
 *
 * Acá vive la regla: el TITULAR autoriza en CODA lo que le pertenece y delega él (sus datos
 * tributarios, su deuda informada, su historial laboral). Lo bancario sigue autorizándose en el
 * banco: dejar que el usuario marque "authorized" un grant de `account_information` sería
 * fabricar una autorización que la institución nunca dio.
 */

import type { AuthorizationDetails, ConsentResourceType } from "./types.js";

/** Tipos que el titular puede autorizar desde CODA. */
export const SELF_AUTHORIZABLE_TYPES: readonly ConsentResourceType[] = [
  "cmf_debt_report",
  "sii_tax_data",
  "afc_employment",
] as const;

export type SelfAuthorizationCheck =
  | { ok: true }
  | { ok: false; reason: "empty_scope" | "bank_authorizes"; types: ConsentResourceType[] };

export function isSelfAuthorizableType(type: ConsentResourceType): boolean {
  return SELF_AUTHORIZABLE_TYPES.includes(type);
}

/**
 * ¿Puede el titular autorizar este scope? Sólo si TODO lo que pide es suyo de delegar: un grant
 * mixto (fuente oficial + banco) se rechaza entero, no a medias.
 */
export function canSelfAuthorize(details: AuthorizationDetails): SelfAuthorizationCheck {
  const types = details.map((d) => d.type);
  if (types.length === 0) return { ok: false, reason: "empty_scope", types };
  const ajenos = types.filter((t) => !isSelfAuthorizableType(t));
  if (ajenos.length > 0) return { ok: false, reason: "bank_authorizes", types: ajenos };
  return { ok: true };
}
