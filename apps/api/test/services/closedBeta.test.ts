/**
 * Beta cerrada: validación de códigos de invitación (BETA_INVITE_CODES) y
 * dedupe de la lista de espera.
 */
import { describe, it, expect, afterEach } from "vitest";
import { db, betaWaitlist, eq } from "../../src/db/index.js";
import { isValidBetaInvite } from "../../src/middleware/auth.js";

const ORIG = process.env.BETA_INVITE_CODES;
afterEach(() => {
  if (ORIG === undefined) delete process.env.BETA_INVITE_CODES;
  else process.env.BETA_INVITE_CODES = ORIG;
});

describe("isValidBetaInvite", () => {
  it("acepta códigos de la lista (con espacios alrededor de las comas)", () => {
    process.env.BETA_INVITE_CODES = "CODA-AMIGOS, CODA-CMF ,OTRA";
    expect(isValidBetaInvite("CODA-AMIGOS")).toBe(true);
    expect(isValidBetaInvite(" CODA-CMF ")).toBe(true);
    expect(isValidBetaInvite("OTRA")).toBe(true);
  });

  it("rechaza códigos inválidos, vacíos o de otro tipo", () => {
    process.env.BETA_INVITE_CODES = "CODA-AMIGOS";
    expect(isValidBetaInvite("coda-amigos")).toBe(false); // case-sensitive
    expect(isValidBetaInvite("")).toBe(false);
    expect(isValidBetaInvite(undefined)).toBe(false);
    expect(isValidBetaInvite(123)).toBe(false);
  });

  it("sin códigos configurados, nada es válido (fail-closed)", () => {
    delete process.env.BETA_INVITE_CODES;
    expect(isValidBetaInvite("cualquiera")).toBe(false);
  });
});

describe("beta_waitlist", () => {
  it("inserta y deduplica por email con onConflictDoNothing", async () => {
    const email = `wait-${Date.now()}@example.com`;
    await db.insert(betaWaitlist).values({ email }).onConflictDoNothing();
    await db.insert(betaWaitlist).values({ email }).onConflictDoNothing();
    const rows = await db.select().from(betaWaitlist).where(eq(betaWaitlist.email, email));
    expect(rows).toHaveLength(1);
  });
});
