/**
 * Persistencia del documento ORIGINAL (PDF/imagen) cifrado, con retención (#21).
 *
 * Los bytes se guardan en el blob store (`services/storage/blobStore.ts`) —cifrados en el
 * backend Postgres, o en S3/R2 si está configurado— bajo una key namespaced por usuario, con
 * TTL (30 días por defecto). La tabla `document_originals` guarda la referencia + vencimiento.
 *
 * Ciclo de vida:
 *  - `storeOriginal`: al subir un documento.
 *  - `purgeExpiredOriginals`: job de retención (borra los vencidos del blob store + sus filas).
 *  - `deleteOriginalsForUser`: borrado inmediato al cerrar/anonimizar la cuenta.
 */
import { randomUUID } from "node:crypto";
import { db, documentOriginals, eq, lt, and, isNotNull } from "../../db/index.js";
import { getBlobStore, newBlobKey } from "../storage/blobStore.js";
import { logger } from "../../logger.js";

/** TTL por defecto del original: 30 días (configurable por env). */
const DEFAULT_TTL_DAYS = Number(process.env.ORIGINAL_DOC_TTL_DAYS) || 30;

export async function storeOriginal(
  userId: string,
  bytes: Buffer,
  opts?: { contentType?: string; filename?: string; ttlDays?: number },
): Promise<{ id: string; blobKey: string } | null> {
  try {
    const ttlDays = opts?.ttlDays ?? DEFAULT_TTL_DAYS;
    const ttlSeconds = ttlDays * 24 * 60 * 60;
    const blobKey = newBlobKey(`originals/${userId}`, opts?.filename ?? "document");
    const store = getBlobStore();
    await store.putObject(blobKey, bytes, { contentType: opts?.contentType, ttlSeconds });

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await db.insert(documentOriginals).values({
      id,
      userId,
      blobKey,
      contentType: opts?.contentType ?? null,
      sizeBytes: bytes.length,
      expiresAt,
    });
    return { id, blobKey };
  } catch (e) {
    // Best-effort: no debe tumbar el upload si el original no se pudo guardar.
    logger.warn({ err: e, userId }, "[originalStore] no se pudo guardar el original (no fatal)");
    return null;
  }
}

/** Borra los originales vencidos (TTL) del blob store y sus filas. Devuelve cuántos borró. */
export async function purgeExpiredOriginals(): Promise<number> {
  const nowIso = new Date().toISOString();
  const expired = await db
    .select({ id: documentOriginals.id, blobKey: documentOriginals.blobKey })
    .from(documentOriginals)
    .where(and(isNotNull(documentOriginals.expiresAt), lt(documentOriginals.expiresAt, nowIso)));

  if (expired.length === 0) return 0;
  const store = getBlobStore();
  for (const row of expired as Array<{ id: string; blobKey: string }>) {
    try {
      await store.deleteObject(row.blobKey);
    } catch (e) {
      logger.warn(
        { err: e, blobKey: row.blobKey },
        "[originalStore] fallo borrando blob vencido (continúo)",
      );
    }
    await db.delete(documentOriginals).where(eq(documentOriginals.id, row.id));
  }
  // Además, deja que el backend purgue lo que tenga TTL propio (Postgres stored_blobs).
  try {
    await store.purgeExpired();
  } catch {
    /* no fatal */
  }
  logger.info({ count: expired.length }, "[originalStore] originales vencidos purgados");
  return expired.length;
}

/** Borra de inmediato TODOS los originales de un usuario (cierre de cuenta / anonimización). */
export async function deleteOriginalsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ id: documentOriginals.id, blobKey: documentOriginals.blobKey })
    .from(documentOriginals)
    .where(eq(documentOriginals.userId, userId));

  const store = getBlobStore();
  for (const row of rows as Array<{ id: string; blobKey: string }>) {
    try {
      await store.deleteObject(row.blobKey);
    } catch (e) {
      logger.warn(
        { err: e, blobKey: row.blobKey },
        "[originalStore] fallo borrando blob de usuario (continúo)",
      );
    }
  }
  await db.delete(documentOriginals).where(eq(documentOriginals.userId, userId));
  return rows.length;
}
