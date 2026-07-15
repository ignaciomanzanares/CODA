/**
 * Multi-tenancy de CODA Empresas (#G — cierre de fuga crítica).
 *
 * Antes, toda ruta de `routes-empresas.ts` confiaba en el `company_id` recibido por param/query
 * sin verificar que el usuario perteneciera a esa empresa → cualquier usuario autenticado podía
 * leer datos de CUALQUIER empresa. Aquí está el control de acceso por membresía.
 *
 * Puente de identidad: el JWT es el del usuario CODA (Personas). Lo mapeamos a una fila de
 * `empresas_users` por email (creándola la primera vez, modelo SSO), y la membresía vive en
 * `empresas_memberships(userId → empresas_users.id, companyId)`.
 */
import { db, eq, and, empresasUsers, empresasMemberships } from "../db/index.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { Response } from "express";
import { logger } from "../logger.js";

/** Resuelve (o crea) la fila `empresas_users` del usuario CODA autenticado. */
export async function resolveEmpresasUserId(req: AuthenticatedRequest): Promise<number | null> {
  const email = req.user?.email;
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();

  const existing = (await db
    .select({ id: empresasUsers.id })
    .from(empresasUsers)
    .where(eq(empresasUsers.email, normalized))
    .limit(1)) as Array<{ id: number }>;
  if (existing[0]) return existing[0].id;

  try {
    const [created] = await db
      .insert(empresasUsers)
      .values({ email: normalized, name: normalized.split("@")[0], passwordHash: "sso:coda" })
      .returning({ id: empresasUsers.id });
    return created?.id ?? null;
  } catch (e) {
    // Carrera (otro request creó la fila) u otro fallo → reintentar lectura.
    const again = (await db
      .select({ id: empresasUsers.id })
      .from(empresasUsers)
      .where(eq(empresasUsers.email, normalized))
      .limit(1)) as Array<{ id: number }>;
    if (again[0]) return again[0].id;
    logger.warn({ err: e }, "[empresas/membership] no se pudo resolver empresas_user");
    return null;
  }
}

/** True si el usuario es miembro de `companyId`. */
export async function isMember(req: AuthenticatedRequest, companyId: number): Promise<boolean> {
  const euid = await resolveEmpresasUserId(req);
  if (!euid) return false;
  const rows = (await db
    .select({ id: empresasMemberships.id })
    .from(empresasMemberships)
    .where(and(eq(empresasMemberships.userId, euid), eq(empresasMemberships.companyId, companyId)))
    .limit(1)) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Ids de empresas a las que el usuario pertenece (para filtrar listados). */
export async function listMemberCompanyIds(req: AuthenticatedRequest): Promise<number[]> {
  const euid = await resolveEmpresasUserId(req);
  if (!euid) return [];
  const rows = (await db
    .select({ companyId: empresasMemberships.companyId })
    .from(empresasMemberships)
    .where(eq(empresasMemberships.userId, euid))) as Array<{ companyId: number }>;
  return rows.map((r) => r.companyId);
}

/** Otorga membresía (idempotente). Úsalo al crear una empresa: el creador es 'owner'. */
export async function grantMembership(
  req: AuthenticatedRequest,
  companyId: number,
  role = "owner",
): Promise<void> {
  const euid = await resolveEmpresasUserId(req);
  if (!euid) return;
  if (await isMember(req, companyId)) return;
  await db.insert(empresasMemberships).values({ userId: euid, companyId, role });
}

/**
 * Guard para usar en las rutas: si el usuario NO es miembro de `companyId`, responde 403 y
 * devuelve false (el caller debe `return`). 404 si el companyId es inválido.
 */
export async function requireMembership(
  req: AuthenticatedRequest,
  res: Response,
  companyId: number,
): Promise<boolean> {
  if (!Number.isFinite(companyId)) {
    res.status(400).json({ error: "Invalid company_id" });
    return false;
  }
  if (await isMember(req, companyId)) return true;
  // No revelar si la empresa existe o no: mismo 403 en ambos casos.
  res.status(403).json({ error: "Forbidden", message: "No tienes acceso a esta empresa." });
  return false;
}
