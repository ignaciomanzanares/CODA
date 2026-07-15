import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, sql, documentOriginals } from "../../../db/index.js";
import { storage } from "../../../storage.js";
import { getBlobStore } from "../../storage/blobStore.js";
import { storeOriginal, deleteOriginalsForUser, purgeExpiredOriginals } from "../originalStore.js";

/**
 * #21: el original se guarda cifrado en el blob store con TTL; el job de retención borra los
 * vencidos y el cierre de cuenta los borra de inmediato.
 */
beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS stored_blobs (
      key TEXT PRIMARY KEY, content_type TEXT, data TEXT NOT NULL,
      size_bytes INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT)`,
  );
  db.run(
    sql`CREATE TABLE IF NOT EXISTS document_originals (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, blob_key TEXT NOT NULL,
      content_type TEXT, size_bytes INTEGER, expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

describe("originalStore (#21)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let userId = "";

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `orig-${unique}@example.com`,
      username: `orig_${unique}`,
      passwordHash: "x:x",
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    await deleteOriginalsForUser(userId);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it("guarda el original en el blob store y registra la referencia", async () => {
    const bytes = Buffer.from("%PDF-1.4 contenido de prueba");
    const res = await storeOriginal(userId, bytes, {
      contentType: "application/pdf",
      filename: "cartola.pdf",
    });
    expect(res).toBeTruthy();

    const blob = await getBlobStore().getObject(res!.blobKey);
    expect(blob?.toString()).toBe("%PDF-1.4 contenido de prueba");

    const rows = await db
      .select()
      .from(documentOriginals)
      .where(sql`user_id = ${userId}`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("deleteOriginalsForUser borra blob y filas de inmediato", async () => {
    const res = await storeOriginal(userId, Buffer.from("otro"), { filename: "x.pdf" });
    expect(res).toBeTruthy();
    const n = await deleteOriginalsForUser(userId);
    expect(n).toBeGreaterThanOrEqual(1);

    expect(await getBlobStore().getObject(res!.blobKey)).toBeNull();
    const rows = await db
      .select()
      .from(documentOriginals)
      .where(sql`user_id = ${userId}`);
    expect(rows.length).toBe(0);
  });

  it("purgeExpiredOriginals borra solo los vencidos", async () => {
    const store = getBlobStore();
    const pastKey = `originals/${userId}/expired-${unique}`;
    await store.putObject(pastKey, Buffer.from("viejo"), { contentType: "application/pdf" });
    await db.insert(documentOriginals).values({
      id: `exp-${unique}`,
      userId,
      blobKey: pastKey,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // ya vencido
    });
    // Uno vigente que NO debe borrarse.
    const fresh = await storeOriginal(userId, Buffer.from("fresco"), { filename: "f.pdf" });

    const purged = await purgeExpiredOriginals();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await store.getObject(pastKey)).toBeNull();
    // el vigente sigue
    expect(await store.getObject(fresh!.blobKey)).not.toBeNull();
  });
});
