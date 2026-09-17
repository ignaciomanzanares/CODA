/**
 * Gate de consentimiento — requisito legal PREVIO a tocar cualquier fuente (D2).
 *
 * Todo conector (CMF, SII, AFC, banco/SFA) debe llamar `assertSourceConsent(userId, resourceType)`
 * ANTES de fetchear. El gate exige un grant VIGENTE que cubra el recurso pedido:
 *   - status === "authorized"
 *   - no expirado (expiresAt nulo o futuro)
 *   - su scope (authorization_details) incluye el resourceType
 *   - si la consulta va a una INSTITUCIÓN concreta (un banco), el grant es de esa institución
 *
 * Lo último es el B3 del plan: un consentimiento no puede ser un permiso abierto a "los bancos".
 * Cuando el conector nombra la institución (`institution`, p. ej. el bankId del scraper), sólo
 * sirve un grant con ese mismo `ipiId`. Los grants sin `ipiId` valen para las fuentes que no son
 * por institución (CMF, SII, AFC), no como permiso genérico bancario.
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
  /** Institución (IPI/banco) a la que aplica el grant. `null` = no es por institución. */
  ipiId?: string | null;
}

/**
 * True si el grant sirve para la institución pedida. Sin `institution` (fuentes oficiales) sirve
 * cualquiera; con institución, el grant tiene que ser de esa institución.
 */
export function grantCoversInstitution(
  grant: Pick<GrantLike, "ipiId">,
  institution?: string,
): boolean {
  if (!institution) return true;
  return grant.ipiId === institution;
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
  institution?: string,
): T | null {
  return (
    grants.find(
      (g) =>
        isGrantActive(g, now) &&
        scopeCovers(g.authorizationDetails, resourceType) &&
        grantCoversInstitution(g, institution),
    ) ?? null
  );
}

/** Busca en la DB el grant vigente del usuario que cubre el recurso (o null). */
export async function findActiveConsent(
  userId: string,
  resourceType: ConsentResourceType,
  institution?: string,
): Promise<{ id: number; expiresAt: string | null } | null> {
  const rows = (await db
    .select()
    .from(consentGrants)
    .where(eq(consentGrants.userId, userId))) as unknown as Array<GrantLike & { id: number }>;
  const match = selectActiveConsent(rows, resourceType, new Date(), institution);
  return match ? { id: match.id, expiresAt: match.expiresAt } : null;
}

/** True si el usuario tiene consentimiento vigente para el recurso. No lanza. */
export async function hasValidConsent(
  userId: string,
  resourceType: ConsentResourceType,
  institution?: string,
): Promise<boolean> {
  return (await findActiveConsent(userId, resourceType, institution)) !== null;
}

/**
 * GATE. Lanza `ConsentRequiredError` si no hay consentimiento vigente que cubra el recurso
 * (y la institución, si la consulta va a una). Llamar SIEMPRE antes de obtener datos de una fuente.
 */
export async function assertSourceConsent(
  userId: string,
  resourceType: ConsentResourceType,
  institution?: string,
): Promise<void> {
  if (!(await hasValidConsent(userId, resourceType, institution))) {
    throw new ConsentRequiredError(userId, resourceType);
  }
}
