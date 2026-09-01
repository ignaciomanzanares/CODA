/**
 * Gate de consentimiento — requisito legal PREVIO a tocar cualquier fuente (D2).
 *
 * Todo conector (CMF, SII, AFC, banco/SFA) debe llamar `assertSourceConsent(userId, resourceType)`
 * ANTES de fetchear. El gate exige un grant VIGENTE que cubra el recurso pedido:
 *   - status === "authorized"
 *   - no expirado (expiresAt nulo o futuro)
 *   - su scope (authorization_details) incluye el resourceType
 *
 * La lógica de decisión es pura y testeable (`selectActiveConsent`); las funciones con DB solo
 * la envuelven.
 */

import { eq } from "drizzle-orm";
import { db, consentGrants } from "../../db/index.js";
import { parseAuthorizationDetails } from "./rar.js";
import type { ConsentResourceType } from "./types.js";

/** Se lanza cuando no hay consentimiento vigente que cubra el recurso. */
export class ConsentRequiredError extends Error {
  readonly code = "consent_required";
  constructor(
    readonly userId: string,
    readonly resourceType: ConsentResourceType,
  ) {
    super(`Consentimiento requerido y no vigente para '${resourceType}'`);
    this.name = "ConsentRequiredError";
  }
}

/** Forma mínima de un grant para decidir vigencia/scope (subset de consentGrants). */
export interface GrantLike {
  status: string;
  expiresAt: string | null;
  authorizationDetails: string;
}

/** True si el grant está VIGENTE ahora: autorizado y no expirado (no mira scope). */
export function isGrantActive(
  grant: Pick<GrantLike, "status" | "expiresAt">,
  now = new Date(),
): boolean {
  if (grant.status !== "authorized") return false;
  if (grant.expiresAt) {
    const exp = new Date(grant.expiresAt).getTime();
    if (Number.isFinite(exp) && exp <= now.getTime()) return false;
  }
  return true;
}

/** True si el scope (authorization_details JSON) cubre el resourceType pedido. */
export function scopeCovers(
  authorizationDetailsJson: string,
  resourceType: ConsentResourceType,
): boolean {
  return parseAuthorizationDetails(authorizationDetailsJson).some((d) => d.type === resourceType);
}

/**
 * Selecciona el primer grant vigente que cubre el recurso (o null). Pura: se testea sin DB.
 */
export function selectActiveConsent<T extends GrantLike>(
  grants: T[],
  resourceType: ConsentResourceType,
  now = new Date(),
): T | null {
  return (
    grants.find(
      (g) => isGrantActive(g, now) && scopeCovers(g.authorizationDetails, resourceType),
    ) ?? null
  );
}

/** Busca en la DB el grant vigente del usuario que cubre el recurso (o null). */
export async function findActiveConsent(
  userId: string,
  resourceType: ConsentResourceType,
): Promise<{ id: number; expiresAt: string | null } | null> {
  const rows = (await db
    .select()
    .from(consentGrants)
    .where(eq(consentGrants.userId, userId))) as unknown as Array<GrantLike & { id: number }>;
  const match = selectActiveConsent(rows, resourceType);
  return match ? { id: match.id, expiresAt: match.expiresAt } : null;
}

/** True si el usuario tiene consentimiento vigente para el recurso. No lanza. */
export async function hasValidConsent(
  userId: string,
  resourceType: ConsentResourceType,
): Promise<boolean> {
  return (await findActiveConsent(userId, resourceType)) !== null;
}

/**
 * GATE. Lanza `ConsentRequiredError` si no hay consentimiento vigente que cubra el recurso.
 * Llamar SIEMPRE antes de obtener datos de una fuente.
 */
export async function assertSourceConsent(
  userId: string,
  resourceType: ConsentResourceType,
): Promise<void> {
  if (!(await hasValidConsent(userId, resourceType))) {
    throw new ConsentRequiredError(userId, resourceType);
  }
}
