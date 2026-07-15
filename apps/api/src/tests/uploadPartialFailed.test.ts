import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { storage } from "../storage.js";
import { processDocumentUpload } from "../services/documents/documentUploadService.js";

/**
 * PR #41B: si un upload falla DESPUÉS de crear el document_upload (un throw fuera
 * del try/catch de normalización), el documento no debe quedar 'pending' huérfano:
 * el outer catch lo marca 'failed' (best-effort) antes de re-lanzar.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../../test/fixtures/cartolas/Santander/cartola01-26.pdf");
const haveFixture = existsSync(fixture);

async function seedUser(): Promise<string> {
  const userId = `up41b-${randomUUID()}`;
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

describe("processDocumentUpload — no deja documentos 'pending' huérfanos (#41B)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  if (!haveFixture) {
    it.skip("sin fixture de cartola en disco", () => {});
    return;
  }

  it("caso feliz: el documento queda 'success' (normalizada)", async () => {
    const userId = await seedUser();
    const res = await processDocumentUpload(userId, readFileSync(fixture));
    expect(res.error).toBeUndefined();
    const docs = await storage.listAllDocumentUploads(userId);
    const doc = docs.find((d: { id: string }) => d.id === res.documentId);
    expect(doc?.normalizationStatus).toBe("success");
  });

  it("throw post-create: el documento queda 'failed', NO 'pending'", async () => {
    const userId = await seedUser();
    // Falla la escritura del score doc, que va en el mismo Promise.all que la del
    // document_upload: el documento ya se creó pero el upload lanza después.
    vi.spyOn(storage, "createScoreDocumentUpload").mockRejectedValueOnce(new Error("boom"));

    await expect(processDocumentUpload(userId, readFileSync(fixture))).rejects.toThrow();

    const docs = await storage.listAllDocumentUploads(userId);
    expect(docs.length).toBeGreaterThan(0);
    // El documento existe pero NO quedó 'pending' huérfano: el outer catch lo marcó 'failed'.
    expect(
      docs.every(
        (d: { normalizationStatus?: string | null }) => d.normalizationStatus !== "pending",
      ),
    ).toBe(true);
    expect(
      docs.some((d: { normalizationStatus?: string | null }) => d.normalizationStatus === "failed"),
    ).toBe(true);
  });
});
