import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, consentGrants, users } from "../../../db/index.js";
import { getConsentService } from "../consentService.js";
import { canSelfAuthorize, isSelfAuthorizableType } from "../selfAuthorization.js";
import { buildAuthorizationDetails } from "../rar.js";
import { hasValidConsent } from "../consentGate.js";

describe("quién autoriza qué", () => {
  it("las fuentes oficiales las autoriza el titular", () => {
    for (const t of ["cmf_debt_report", "sii_tax_data", "afc_employment"] as const) {
      expect(isSelfAuthorizableType(t)).toBe(true);
      expect(canSelfAuthorize(buildAuthorizationDetails([t]))).toEqual({ ok: true });
    }
  });

  it("lo bancario lo autoriza el banco, no el usuario", () => {
    const check = canSelfAuthorize(buildAuthorizationDetails(["account_information"]));
    expect(check).toMatchObject({ ok: false, reason: "bank_authorizes" });
  });

  it("un scope mixto se rechaza entero, no a medias", () => {
    const check = canSelfAuthorize(
      buildAuthorizationDetails(["sii_tax_data", "account_information"]),
    );
    expect(check).toMatchObject({ ok: false, reason: "bank_authorizes" });
    expect((check as { types: string[] }).types).toEqual(["account_information"]);
  });

  it("un scope vacío no autoriza nada", () => {
    expect(canSelfAuthorize([])).toMatchObject({ ok: false, reason: "empty_scope" });
  });
});

describe("authorizeOwn (integración DB)", () => {
  async function seedUser() {
    const userId = `selfauth-${randomUUID()}`;
    await db
      .insert(users)
      .values({
        id: userId,
        username: userId,
        email: `${userId}@test.local`,
        passwordHash: "test-hash",
      })
      .onConflictDoNothing();
    return userId;
  }

  async function cleanup(userId: string) {
    await db.delete(consentGrants).where(eq(consentGrants.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  it("el titular autoriza el SII: queda sellado y el gate lo acepta", async () => {
    const userId = await seedUser();
    const svc = getConsentService();
    const grant = await svc.create({ userId, resourceTypes: ["sii_tax_data"] });

    // Antes de autorizar, el gate no deja consultar.
    expect(await hasValidConsent(userId, "sii_tax_data")).toBe(false);

    const result = await svc.authorizeOwn(grant.id, userId);
    expect(result.ok).toBe(true);
    const autorizado = (result as { grant: { status: string; evidenceHash: string | null } }).grant;
    expect(autorizado.status).toBe("authorized");
    expect(autorizado.evidenceHash).toMatch(/^[0-9a-f]{64}$/);

    expect(await hasValidConsent(userId, "sii_tax_data")).toBe(true);

    // Idempotente: no re-sella ni cambia el hash.
    const otraVez = await svc.authorizeOwn(grant.id, userId);
    expect((otraVez as { grant: { evidenceHash: string | null } }).grant.evidenceHash).toBe(
      autorizado.evidenceHash,
    );

    await cleanup(userId);
  });

  it("no autoriza lo bancario ni lo de otro usuario, ni revive un revocado", async () => {
    const userId = await seedUser();
    const svc = getConsentService();

    const banco = await svc.create({ userId, resourceTypes: ["account_information"] });
    expect(await svc.authorizeOwn(banco.id, userId)).toMatchObject({
      ok: false,
      code: "bank_authorizes",
    });

    const sii = await svc.create({ userId, resourceTypes: ["sii_tax_data"] });
    expect(await svc.authorizeOwn(sii.id, "otro-usuario")).toMatchObject({
      ok: false,
      code: "not_found",
    });

    await svc.authorizeOwn(sii.id, userId);
    await svc.revoke(sii.id, userId);
    expect(await svc.authorizeOwn(sii.id, userId)).toMatchObject({
      ok: false,
      code: "invalid_state",
      status: "revoked",
    });
    // Y revocado significa revocado para el gate.
    expect(await hasValidConsent(userId, "sii_tax_data")).toBe(false);

    await cleanup(userId);
  });
});
