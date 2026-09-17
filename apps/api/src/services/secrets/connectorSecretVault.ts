/**
 * D1/B4 — Bóveda de secretos de conectores.
 *
 * Guarda lo que una fuente pide para entregar datos SIN el titular presente y que él delega una
 * vez: el caso concreto es el código + clave de una Carpeta Tributaria del SII (90 días de
 * vigencia). Contrato:
 *
 *  - Cifrado en reposo (AES-256-GCM, `services/crypto/fieldEncryption`). La API nunca devuelve el
 *    secreto: `describeSecret` cuenta que existe y cuándo vence, `getSecret` es para el conector.
 *  - Vencimiento OBLIGATORIO. Un secreto vencido se trata como inexistente aunque la fila siga
 *    ahí, y el job de retención la borra (`purgeExpiredSecrets`).
 *  - Uno por usuario+conector: volver a compartir REEMPLAZA (índice único de la migración 048).
 *  - Las claves de banco NO van acá — el scraper las usa en memoria y las descarta
 *    (`connectors/scraper/README.md`).
 */

import { randomUUID } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, connectorSecrets } from "../../db/index.js";
import { logger } from "../../logger.js";
import { decryptField, encryptField, looksEncrypted } from "../crypto/fieldEncryption.js";

/** Campos que pide la fuente, p. ej. `{ codigo, clave }` de la carpeta tributaria. */
export type ConnectorSecretPayload = Record<string, string>;

export interface StoreSecretInput {
  userId: string;
  connectorId: string;
  secret: ConnectorSecretPayload;
  /** Vigencia declarada por la fuente (la carpeta del SII dura 90 días). */
  expiresAt: Date;
}

/** Lo único que se puede contar de un secreto fuera del conector. */
export interface SecretDescriptor {
  connectorId: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  expired: boolean;
}

export class SecretExpiredError extends Error {
  readonly code = "secret_expired";
  constructor(readonly connectorId: string) {
    super(`El secreto de '${connectorId}' venció; el usuario debe compartirlo de nuevo.`);
    this.name = "SecretExpiredError";
  }
}

export class SecretMissingError extends Error {
  readonly code = "secret_missing";
  constructor(readonly connectorId: string) {
    super(`No hay secreto guardado para '${connectorId}'.`);
    this.name = "SecretMissingError";
  }
}

function assertFutureExpiry(expiresAt: Date, now: Date): void {
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("expiresAt inválido");
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error("expiresAt debe ser futuro: un secreto ya vencido no se guarda");
  }
}

function assertNonEmpty(secret: ConnectorSecretPayload): void {
  const entries = Object.entries(secret);
  if (entries.length === 0 || entries.some(([, v]) => typeof v !== "string" || v.length === 0)) {
    throw new Error("El secreto no puede venir vacío");
  }
}

/** Guarda (o reemplaza) el secreto del usuario para un conector. */
export async function storeSecret(
  input: StoreSecretInput,
  now = new Date(),
): Promise<SecretDescriptor> {
  assertNonEmpty(input.secret);
  assertFutureExpiry(input.expiresAt, now);

  const values = {
    secret: encryptField(JSON.stringify(input.secret)),
    expiresAt: input.expiresAt.toISOString(),
    // Secreto nuevo: el uso del anterior no cuenta.
    lastUsedAt: null as string | null,
    updatedAt: now.toISOString(),
  };

  // Upsert a mano en vez de ON CONFLICT: el índice único vive en la migración, no en el schema
  // Drizzle, así que la BD SQLite de los tests no lo tiene y ON CONFLICT (user_id, connector_id)
  // ahí no matchea ninguna constraint. Esto funciona igual en Postgres y en SQLite.
  const existing = await findRow(input.userId, input.connectorId);
  if (existing) {
    await db.update(connectorSecrets).set(values).where(eq(connectorSecrets.id, existing.id));
  } else {
    await db.insert(connectorSecrets).values({
      id: randomUUID(),
      userId: input.userId,
      connectorId: input.connectorId,
      createdAt: now.toISOString(),
      ...values,
    });
  }

  // Sin el secreto ni sus campos: sólo el hecho de que se guardó.
  logger.info(
    { userId: input.userId, connectorId: input.connectorId, expiresAt: values.expiresAt },
    "[secretVault] secreto guardado",
  );
  return (await describeSecret(input.userId, input.connectorId, now))!;
}

async function findRow(userId: string, connectorId: string) {
  const [row] = await db
    .select()
    .from(connectorSecrets)
    .where(and(eq(connectorSecrets.userId, userId), eq(connectorSecrets.connectorId, connectorId)))
    .limit(1);
  return (row ?? null) as {
    id: string;
    secret: string;
    expiresAt: string;
    lastUsedAt: string | null;
    createdAt: string;
  } | null;
}

/** Metadatos del secreto (nunca el secreto). `null` si no hay fila. */
export async function describeSecret(
  userId: string,
  connectorId: string,
  now = new Date(),
): Promise<SecretDescriptor | null> {
  const row = await findRow(userId, connectorId);
  if (!row) return null;
  return {
    connectorId,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    expired: new Date(row.expiresAt).getTime() <= now.getTime(),
  };
}

/**
 * Devuelve el secreto para USARLO en una consulta a la fuente. Lanza si no hay o si venció, y
 * marca `lastUsedAt`. Sólo lo llama el conector — nunca una ruta que responda al cliente.
 */
export async function getSecret(
  userId: string,
  connectorId: string,
  now = new Date(),
): Promise<ConnectorSecretPayload> {
  const row = await findRow(userId, connectorId);
  if (!row) throw new SecretMissingError(connectorId);
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    throw new SecretExpiredError(connectorId);
  }

  const raw = looksEncrypted(row.secret) ? decryptField(row.secret) : row.secret;
  const parsed = JSON.parse(raw) as ConnectorSecretPayload;

  await db
    .update(connectorSecrets)
    .set({ lastUsedAt: now.toISOString() })
    .where(eq(connectorSecrets.id, row.id));

  return parsed;
}

/** Borra el secreto (el usuario revoca, o el conector detecta que la fuente ya no lo acepta). */
export async function deleteSecret(userId: string, connectorId: string): Promise<boolean> {
  const row = await findRow(userId, connectorId);
  if (!row) return false;
  await db.delete(connectorSecrets).where(eq(connectorSecrets.id, row.id));
  logger.info({ userId, connectorId }, "[secretVault] secreto borrado");
  return true;
}

/** Borra TODOS los secretos del usuario (cierre o anonimización de cuenta). */
export async function deleteSecretsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ id: connectorSecrets.id })
    .from(connectorSecrets)
    .where(eq(connectorSecrets.userId, userId));
  if (rows.length === 0) return 0;
  await db.delete(connectorSecrets).where(eq(connectorSecrets.userId, userId));
  return rows.length;
}

/** Job de retención: borra los vencidos. Devuelve cuántos borró. */
export async function purgeExpiredSecrets(now = new Date()): Promise<number> {
  const nowIso = now.toISOString();
  const expired = await db
    .select({ id: connectorSecrets.id })
    .from(connectorSecrets)
    .where(lt(connectorSecrets.expiresAt, nowIso));
  if (expired.length === 0) return 0;
  await db.delete(connectorSecrets).where(lt(connectorSecrets.expiresAt, nowIso));
  logger.info({ count: expired.length }, "[secretVault] secretos vencidos purgados");
  return expired.length;
}
