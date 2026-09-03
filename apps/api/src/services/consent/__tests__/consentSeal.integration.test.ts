import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, consentGrants, users } from "../../../db/index.js";
import { getConsentService } from "../consentService.js";
import { verifyConsentEvidence } from "../consentEvidence.js";

describe("D2 — sellado al autorizar (integración DB)", () => {
  it("updateStatus(authorized) sella la evidencia, verifica, y re-autorizar no re-sella", async () => {
    const userId = `seal-${randomUUID()}`;
    await db
      .insert(users)
      .values({
        id: userId,
        username: userId,
        email: `${userId}@test.local`,
        passwordHash: "test-hash",
      })
      .onConflictDoNothing();

    const svc = getConsentService();
    const grant = await svc.create({ userId, resourceTypes: ["cmf_debt_report"] });
    expect(grant.status).toBe("pending");
    expect(grant.evidenceHash).toBeNull();

    // Autorizar → sella.
    const authed = await svc.updateStatus(grant.id, "authorized", { userId });
    expect(authed?.status).toBe("authorized");
    expect(authed?.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(authed?.sealedAt).toBeTruthy();

    // El sello verifica contra los hechos realmente almacenados.
    const [row] = await db.select().from(consentGrants).where(eq(consentGrants.id, grant.id));
    expect(verifyConsentEvidence(row as never)).toBe(true);

    // Re-autorizar es idempotente sobre el sello (no re-sella con otro timestamp).
    const again = await svc.updateStatus(grant.id, "authorized", { userId });
    expect(again?.evidenceHash).toBe(authed?.evidenceHash);
    expect(again?.sealedAt).toBe(authed?.sealedAt);

    // Limpieza.
    await db.delete(consentGrants).where(eq(consentGrants.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("verifyById: sellado→válido, manipulado→inválido, inexistente→null", async () => {
    const userId = `verify-${randomUUID()}`;
    await db
      .insert(users)
      .values({
        id: userId,
        username: userId,
        email: `${userId}@test.local`,
        passwordHash: "test-hash",
      })
      .onConflictDoNothing();

    const svc = getConsentService();
    const grant = await svc.create({ userId, resourceTypes: ["cmf_debt_report"] });
    await svc.updateStatus(grant.id, "authorized", { userId });

    // Sellado y válido.
    expect(await svc.verifyById(grant.id, userId)).toEqual({ sealed: true, valid: true });

    // Otro usuario no lo ve.
    expect(await svc.verifyById(grant.id, "otro-usuario")).toBeNull();

    // Manipular un hecho consentido invalida el sello (tamper-evident).
    await db
      .update(consentGrants)
      .set({ purpose: "finalidad-alterada" })
      .where(eq(consentGrants.id, grant.id));
    expect(await svc.verifyById(grant.id, userId)).toEqual({ sealed: true, valid: false });

    // Grant inexistente → null.
    expect(await svc.verifyById(999_999_999, userId)).toBeNull();

    // Limpieza.
    await db.delete(consentGrants).where(eq(consentGrants.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });
});
