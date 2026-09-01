/**
 * Evidencia sellada del consentimiento (D2) — prueba a prueba de manipulación.
 *
 * Al AUTORIZAR un grant se calcula un SHA-256 sobre los hechos INMUTABLES de lo consentido
 * (usuario, scope, finalidad, versión de política, timestamp de sellado). Se guarda el hash +
 * `sealedAt`. Si cualquiera de esos campos se altera después, `verifyConsentEvidence` falla →
 * queda registro auditable de "el usuario consintió ESTO, en ESTE momento, bajo ESTA política".
 *
 * No se incluye el estado (authorized→revoked) ni updatedAt: el sello prueba la AUTORIZACIÓN
 * original; la revocación es un evento posterior (status/updatedAt), no invalida el sello.
 */

import { createHash } from "crypto";

export interface ConsentEvidenceFacts {
  userId: string;
  /** authorization_details serializado (el string exacto almacenado). */
  authorizationDetails: string;
  purpose: string;
  policyVersion: string;
  /** ISO timestamp del momento de la autorización (sellado). */
  sealedAt: string;
}

/** Canonicaliza los hechos en una cadena estable y determinística. */
function canonical(f: ConsentEvidenceFacts): string {
  return [
    `user:${f.userId}`,
    `scope:${f.authorizationDetails}`,
    `purpose:${f.purpose}`,
    `policy:${f.policyVersion}`,
    `sealedAt:${f.sealedAt}`,
  ].join("\n");
}

/** SHA-256 hex del contenido consentido. */
export function computeConsentEvidenceHash(facts: ConsentEvidenceFacts): string {
  return createHash("sha256").update(canonical(facts), "utf8").digest("hex");
}

/** Sella: devuelve `{ evidenceHash, sealedAt }`. Usa `sealedAt` dado o el instante actual. */
export function sealConsentEvidence(
  facts: Omit<ConsentEvidenceFacts, "sealedAt"> & { sealedAt?: string },
): { evidenceHash: string; sealedAt: string } {
  const sealedAt = facts.sealedAt ?? new Date().toISOString();
  return { evidenceHash: computeConsentEvidenceHash({ ...facts, sealedAt }), sealedAt };
}

/** Forma mínima de un grant sellado para verificar. */
export interface SealedGrant {
  userId: string;
  authorizationDetails: string;
  purpose: string;
  policyVersion: string;
  sealedAt: string | null;
  evidenceHash: string | null;
}

/**
 * Verifica que el sello coincida con los hechos almacenados. Devuelve false si el grant no
 * está sellado (grants antiguos previos al sello) o si algún campo fue manipulado.
 */
export function verifyConsentEvidence(grant: SealedGrant): boolean {
  if (!grant.evidenceHash || !grant.sealedAt) return false;
  const recomputed = computeConsentEvidenceHash({
    userId: grant.userId,
    authorizationDetails: grant.authorizationDetails,
    purpose: grant.purpose,
    policyVersion: grant.policyVersion,
    sealedAt: grant.sealedAt,
  });
  return recomputed === grant.evidenceHash;
}
