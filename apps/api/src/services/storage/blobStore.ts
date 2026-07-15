/**
 * Abstracción de almacenamiento de objetos (blobs) — Frente 0 del overhaul.
 *
 * Dos backends, seleccionados por `BLOB_BACKEND`:
 *  - `s3`  → `S3BlobStore` (bucket S3/Cloudflare R2; requiere `@aws-sdk/client-s3` y
 *            las env `BLOB_*`). Recomendado en producción para artefactos ML y
 *            documentos originales (#5, #21).
 *  - resto → `PostgresBlobStore` (fallback sin cuenta externa: tabla `stored_blobs`,
 *            bytes cifrados AES-256-GCM). Funciona out-of-the-box en dev/test y en
 *            producción mientras no haya bucket. No apto para alto volumen/objetos grandes.
 *
 * El backend S3 se carga con import dinámico de especificador no-literal para que el
 * typecheck/build NO exija tener `@aws-sdk/client-s3` instalado (es opcional). Ver
 * `docs/INTEGRATION_GUIDE.md` para activarlo.
 */

import { randomUUID } from "crypto";
import { db, storedBlobs, eq, sql } from "../../db/index.js";
import { logger } from "../../logger.js";
import { encryptField, decryptField, looksEncrypted } from "../crypto/fieldEncryption.js";

export interface PutOptions {
  contentType?: string;
  /** TTL en segundos; el objeto se marca para borrado por el job de retención. */
  ttlSeconds?: number;
}

export interface BlobStore {
  /** Guarda los bytes bajo `key` (idempotente, sobrescribe). Devuelve un URI estable. */
  putObject(key: string, data: Buffer, opts?: PutOptions): Promise<string>;
  /** Devuelve los bytes o `null` si no existe. */
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  /** Borra los objetos vencidos (solo aplica al backend con TTL). Devuelve cuántos borró. */
  purgeExpired(): Promise<number>;
  /** Esquema del URI que produce este backend (p. ej. 's3' o 'pg'). */
  readonly scheme: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend Postgres (fallback por defecto)
// ─────────────────────────────────────────────────────────────────────────────

class PostgresBlobStore implements BlobStore {
  readonly scheme = "pg";

  async putObject(key: string, data: Buffer, opts: PutOptions = {}): Promise<string> {
    const encrypted = encryptField(data.toString("base64"));
    const expiresAt = opts.ttlSeconds
      ? new Date(Date.now() + opts.ttlSeconds * 1000).toISOString()
      : null;
    const row = {
      key,
      contentType: opts.contentType ?? null,
      data: encrypted,
      sizeBytes: data.length,
      expiresAt,
    };
    // Upsert por PK (key). onConflictDoUpdate funciona igual en pg/sqlite via drizzle.
    await db
      .insert(storedBlobs)
      .values(row)
      .onConflictDoUpdate({ target: storedBlobs.key, set: row });
    return `pg://stored_blobs/${key}`;
  }

  async getObject(key: string): Promise<Buffer | null> {
    const [row] = await db.select().from(storedBlobs).where(eq(storedBlobs.key, key)).limit(1);
    if (!row) return null;
    const raw = looksEncrypted(row.data) ? decryptField(row.data) : row.data;
    return Buffer.from(raw, "base64");
  }

  async deleteObject(key: string): Promise<void> {
    await db.delete(storedBlobs).where(eq(storedBlobs.key, key));
  }

  async purgeExpired(): Promise<number> {
    const nowIso = new Date().toISOString();
    const expired = await db
      .select({ key: storedBlobs.key })
      .from(storedBlobs)
      .where(sql`${storedBlobs.expiresAt} is not null and ${storedBlobs.expiresAt} < ${nowIso}`);
    for (const { key } of expired as Array<{ key: string }>) {
      await db.delete(storedBlobs).where(eq(storedBlobs.key, key));
    }
    return expired.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend S3 / R2 (opcional, dep cargada dinámicamente)
// ─────────────────────────────────────────────────────────────────────────────

class S3BlobStore implements BlobStore {
  readonly scheme = "s3";
  private bucket: string;
  private clientPromise: Promise<any> | null = null;

  constructor() {
    this.bucket = process.env.BLOB_BUCKET ?? "";
    if (!this.bucket) throw new Error("S3BlobStore: BLOB_BUCKET no configurado");
  }

  private async client(): Promise<any> {
    if (!this.clientPromise) {
      // Especificador no-literal: el typecheck no resuelve el módulo, así que
      // `@aws-sdk/client-s3` es una dependencia opcional instalada solo si se usa S3.
      const pkg = "@aws-sdk/client-s3";
      this.clientPromise = import(pkg).then((aws: any) => {
        const Client = aws.S3Client;
        return {
          aws,
          s3: new Client({
            region: process.env.BLOB_REGION ?? "auto",
            endpoint: process.env.BLOB_ENDPOINT || undefined, // R2/MinIO
            forcePathStyle: process.env.BLOB_FORCE_PATH_STYLE === "true",
            credentials:
              process.env.BLOB_ACCESS_KEY_ID && process.env.BLOB_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.BLOB_ACCESS_KEY_ID,
                    secretAccessKey: process.env.BLOB_SECRET_ACCESS_KEY,
                  }
                : undefined,
          }),
        };
      });
    }
    return this.clientPromise;
  }

  async putObject(key: string, data: Buffer, opts: PutOptions = {}): Promise<string> {
    const { aws, s3 } = await this.client();
    await s3.send(
      new aws.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: opts.contentType,
        // El TTL real se gobierna con una lifecycle rule del bucket (ver guía);
        // aquí solo etiquetamos para que esa regla la pueda usar.
        Tagging: opts.ttlSeconds ? `ttl=${opts.ttlSeconds}` : undefined,
      }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  async getObject(key: string): Promise<Buffer | null> {
    const { aws, s3 } = await this.client();
    try {
      const res = await s3.send(new aws.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch (e: any) {
      if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { aws, s3 } = await this.client();
    await s3.send(new aws.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async purgeExpired(): Promise<number> {
    // En S3/R2 la expiración la maneja una lifecycle rule del bucket (configurada
    // fuera de la app, ver guía de integración), no este job.
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

let _instance: BlobStore | null = null;

/** Devuelve el blob store singleton según `BLOB_BACKEND` (s3 | postgres). */
export function getBlobStore(): BlobStore {
  if (_instance) return _instance;
  const backend = (process.env.BLOB_BACKEND ?? "postgres").toLowerCase();
  if (backend === "s3") {
    try {
      _instance = new S3BlobStore();
      logger.info({ bucket: process.env.BLOB_BUCKET }, "[blobStore] backend S3/R2");
    } catch (e) {
      logger.error({ err: e }, "[blobStore] S3 mal configurado; cayendo a Postgres");
      _instance = new PostgresBlobStore();
    }
  } else {
    _instance = new PostgresBlobStore();
    logger.info("[blobStore] backend Postgres (stored_blobs)");
  }
  return _instance;
}

/** Genera una key versionada única para un namespace dado (p. ej. artefactos de modelo). */
export function newBlobKey(namespace: string, filename: string): string {
  return `${namespace}/${Date.now()}-${randomUUID().slice(0, 8)}/${filename}`;
}

/** Solo para tests: resetea el singleton. */
export function __resetBlobStoreForTests(): void {
  _instance = null;
}
