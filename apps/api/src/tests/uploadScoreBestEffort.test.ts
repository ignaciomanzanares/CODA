import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { storage } from "../storage.js";
import { processDocumentUpload } from "../services/documents/documentUploadService.js";

/**
 * PR #40: el cómputo de score post-parse es best-effort. El documento y los
 * movimientos ya están persistidos/normalizados antes del score; si el score
 * falla (hiccup transitorio), el upload responde 200 degradado con `warnings`
 * en vez de 500. Tests de integración contra el DB SQLite de test.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../../test/fixtures/cartolas/Santander/cartola01-26.pdf");
const haveFixture = existsSync(fixture);

async function seedUser(): Promise<string> {
  const userId = `up40-${randomUUID()}`;
  await storage.createUser({
    id: userId,
    username: userId,
    email: `${userId}@example.com`,
    passwordHash: "testhash",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return userId;
}

describe("processDocumentUpload — score best-effort (#40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  if (!haveFixture) {
    it.skip("sin fixture de cartola en disco", () => {});
    return;
  }

  it("caso normal: 200 con métricas de liquidez + documentId (sin warnings de score)", async () => {
    const userId = await seedUser();
    const buf = readFileSync(fixture);
    const res = await processDocumentUpload(userId, buf);

    expect(res.error).toBeUndefined();
    expect(res.documentType).toBe("cartola");
    expect(res.documentId).toBeTruthy();
    // El score transaccional ya NO se computa al subir (lo da el modelo XGB bajo demanda);
    // la subida persiste las métricas de liquidez que consume el motor de salud.
    expect(res.transactionalScore).toBeUndefined();
    expect(typeof res.metrics?.averageMonthlyBalanceClp).toBe("number");
    expect(typeof res.movementCount).toBe("number");
    expect(res.warnings ?? []).toHaveLength(0);
  });

  it("falla de score post-persist: 200 degradado con warnings, doc/movimientos persistidos, sin score", async () => {
    const userId = await seedUser();
    const buf = readFileSync(fixture);

    // El parse + persist + normalize ya ocurrieron antes de este paso; forzamos
    // que el upsert del score lance (hiccup simulado).
    vi.spyOn(storage, "upsertTransactionalScore").mockRejectedValueOnce(new Error("boom"));

    const res = await processDocumentUpload(userId, buf);

    // No es un error duro: el upload no se tumba.
    expect(res.error).toBeUndefined();
    expect(res.documentType).toBe("cartola");
    // Lo que sí se logró se devuelve.
    expect(res.documentId).toBeTruthy();
    expect(typeof res.movementCount).toBe("number");
    expect(res.reviewStatus).toBeTruthy();
    // El score no se incluye porque no se pudo calcular.
    expect(res.transactionalScore).toBeUndefined();
    expect(res.recommendedProducts).toBeUndefined();
    // Y viene un warning honesto.
    expect(res.warnings && res.warnings.length).toBeGreaterThan(0);

    // El documento quedó persistido (best-effort no revierte lo anterior).
    const docs = await storage.listAllDocumentUploads(userId);
    expect(docs.find((d: { id: string }) => d.id === res.documentId)).toBeTruthy();
  });
});
