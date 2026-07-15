import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db, sql } from "../../../db/index.js";
import { getBlobStore, newBlobKey, __resetBlobStoreForTests } from "../blobStore.js";

/**
 * La SQLite de test (packages/data/coda.db) es un archivo persistente sin auto-migración,
 * así que creamos stored_blobs a mano (la migración 027 solo corre en Postgres al boot).
 */
beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS stored_blobs (
      key text primary key,
      content_type text,
      data text not null,
      size_bytes integer,
      created_at text default current_timestamp,
      expires_at text
    )`,
  );
});

beforeEach(() => {
  __resetBlobStoreForTests();
  delete process.env.BLOB_BACKEND;
  db.run(sql`DELETE FROM stored_blobs`);
});

describe("blobStore (backend Postgres/sqlite)", () => {
  it("por defecto usa el backend de DB (scheme pg)", () => {
    expect(getBlobStore().scheme).toBe("pg");
  });

  it("round-trip put/get de bytes binarios", async () => {
    const store = getBlobStore();
    const data = Buffer.from([0, 1, 2, 250, 255, 128]);
    const uri = await store.putObject("artifacts/test/model.bin", data, {
      contentType: "application/octet-stream",
    });
    expect(uri).toMatch(/^pg:\/\/stored_blobs\//);
    const out = await store.getObject("artifacts/test/model.bin");
    expect(out).not.toBeNull();
    expect(Buffer.compare(out!, data)).toBe(0);
  });

  it("cifra en reposo: la fila cruda no contiene el base64 en claro", async () => {
    const store = getBlobStore();
    const data = Buffer.from("texto-sensible-de-prueba", "utf-8");
    await store.putObject("docs/secret.txt", data);
    const rows = db.all(sql`SELECT data FROM stored_blobs WHERE key = 'docs/secret.txt'`) as Array<{
      data: string;
    }>;
    expect(rows.length).toBe(1);
    expect(rows[0].data).not.toContain(data.toString("base64"));
    // pero el store lo descifra de vuelta
    const out = await store.getObject("docs/secret.txt");
    expect(out!.toString("utf-8")).toBe("texto-sensible-de-prueba");
  });

  it("getObject devuelve null si no existe", async () => {
    expect(await getBlobStore().getObject("no/existe")).toBeNull();
  });

  it("deleteObject borra", async () => {
    const store = getBlobStore();
    await store.putObject("k", Buffer.from("x"));
    await store.deleteObject("k");
    expect(await store.getObject("k")).toBeNull();
  });

  it("purgeExpired borra solo los vencidos", async () => {
    const store = getBlobStore();
    await store.putObject("vivo", Buffer.from("a")); // sin TTL
    await store.putObject("vencido", Buffer.from("b"), { ttlSeconds: -10 }); // ya vencido
    const purged = await store.purgeExpired();
    expect(purged).toBe(1);
    expect(await store.getObject("vivo")).not.toBeNull();
    expect(await store.getObject("vencido")).toBeNull();
  });

  it("newBlobKey produce keys únicas dentro del namespace", () => {
    const a = newBlobKey("models", "xgb.onnx");
    const b = newBlobKey("models", "xgb.onnx");
    expect(a).not.toBe(b);
    expect(a.startsWith("models/")).toBe(true);
    expect(a.endsWith("/xgb.onnx")).toBe(true);
  });
});
