/**
 * Guard de 2FA para vincular cuentas bancarias (onboarding).
 * - Flag apagado (ENABLE_ONBOARDING != 'true') → no bloquea (flujo actual intacto).
 * - Flag encendido + 2FA off → bloquea con mensaje claro.
 * - Flag encendido + 2FA on  → permite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { twoFactorEnabled?: number } }));

vi.mock("../../src/storage.js", () => ({
  storage: { getUser: vi.fn(async () => h.user) },
}));

const { requireTwoFactorForBankLink } = await import("../../src/routes-onboarding.js");

const ORIG = process.env.ENABLE_ONBOARDING;
afterEach(() => {
  process.env.ENABLE_ONBOARDING = ORIG;
});
beforeEach(() => {
  h.user = null;
});

describe("requireTwoFactorForBankLink", () => {
  it("flag apagado → permite (no cambia el flujo actual)", async () => {
    process.env.ENABLE_ONBOARDING = "false";
    h.user = { twoFactorEnabled: 0 };
    expect((await requireTwoFactorForBankLink("u1")).ok).toBe(true);
  });

  it("flag encendido + 2FA off → bloquea con mensaje", async () => {
    process.env.ENABLE_ONBOARDING = "true";
    h.user = { twoFactorEnabled: 0 };
    const r = await requireTwoFactorForBankLink("u1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/2FA|dos pasos/i);
  });

  it("flag encendido + 2FA on → permite", async () => {
    process.env.ENABLE_ONBOARDING = "true";
    h.user = { twoFactorEnabled: 1 };
    expect((await requireTwoFactorForBankLink("u1")).ok).toBe(true);
  });
});
