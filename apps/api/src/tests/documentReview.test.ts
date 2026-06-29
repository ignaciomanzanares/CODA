import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { storage } from "../storage.js";
import { deriveDocumentReviewState } from "../services/documents/documentUploadService.js";

/**
 * PR #36: estado de revisión por importación (document_uploads.review_status).
 * Tests del helper de derivación (puro) y del storage ownership-safe/idempotente,
 * contra el DB SQLite de test (mismo path Drizzle que producción Postgres).
 */

describe("deriveDocumentReviewState", () => {
  it("banco específico + tier HIGH → not_required", () => {
    expect(deriveDocumentReviewState({ banco: "Santander", detectionTier: "HIGH" })).toEqual({
      reviewStatus: "not_required",
      reviewReason: null,
    });
  });

  it("parser genérico → required / generic_parser", () => {
    expect(deriveDocumentReviewState({ banco: "Genérico", detectionTier: "MEDIUM" })).toEqual({
      reviewStatus: "required",
      reviewReason: "generic_parser",
    });
  });

  it("tier MEDIUM/LOW (banco específico) → required / low_confidence", () => {
    expect(deriveDocumentReviewState({ banco: "BancoX", detectionTier: "MEDIUM" }).reviewReason).toBe("low_confidence");
    expect(deriveDocumentReviewState({ banco: "BancoX", detectionTier: "LOW" }).reviewStatus).toBe("required");
  });

  it("sin tier → not_required (no inventa revisión)", () => {
    expect(deriveDocumentReviewState({ banco: "BancoX" }).reviewStatus).toBe("not_required");
  });
});

async function seedUser(): Promise<string> {
  const userId = `rev-${randomUUID()}`;
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

async function seedDoc(userId: string, reviewStatus = "required", reviewReason: string | null = "generic_parser"): Promise<string> {
  const id = randomUUID();
  await storage.createDocumentUpload({
    id,
    userId,
    tipo: "cartola",
    banco: "Genérico",
    parsedData: { tipo: "cartola", transacciones: [] },
    reviewStatus,
    reviewReason,
  });
  return id;
}

describe("createDocumentUpload review defaults", () => {
  it("sin reviewStatus → 'not_required' por default", async () => {
    const userId = await seedUser();
    const id = randomUUID();
    const row = await storage.createDocumentUpload({
      id,
      userId,
      tipo: "cartola",
      parsedData: { tipo: "cartola", transacciones: [] },
    });
    expect(row.reviewStatus).toBe("not_required");
    expect(row.reviewReason ?? null).toBe(null);
  });
});

describe("markDocumentReviewed (ownership-safe + idempotente)", () => {
  it("marca la importación propia como reviewed con reviewed_at", async () => {
    const userId = await seedUser();
    const docId = await seedDoc(userId);
    const updated = await storage.markDocumentReviewed(docId, userId);
    expect(updated).not.toBeNull();
    expect(updated!.reviewStatus).toBe("reviewed");
    expect(updated!.reviewedAt).toBeTruthy();
  });

  it("es idempotente: re-marcar sigue 'reviewed'", async () => {
    const userId = await seedUser();
    const docId = await seedDoc(userId);
    await storage.markDocumentReviewed(docId, userId);
    const again = await storage.markDocumentReviewed(docId, userId);
    expect(again!.reviewStatus).toBe("reviewed");
  });

  it("documento de otro usuario → null (no lo modifica)", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const docId = await seedDoc(owner);
    const result = await storage.markDocumentReviewed(docId, other);
    expect(result).toBeNull();
  });

  it("documento inexistente → null", async () => {
    const userId = await seedUser();
    expect(await storage.markDocumentReviewed(randomUUID(), userId)).toBeNull();
  });
});
