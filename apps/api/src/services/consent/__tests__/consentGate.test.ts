import { describe, it, expect } from "vitest";
import {
  isGrantActive,
  scopeCovers,
  selectActiveConsent,
  assertSourceConsent,
  hasValidConsent,
  ConsentRequiredError,
  type GrantLike,
} from "../consentGate";

const SCOPE_CMF = JSON.stringify([{ type: "cmf_debt_report", actions: ["read"] }]);
const SCOPE_ACCTS = JSON.stringify([
  { type: "account_information", actions: ["read_transactions"] },
]);

function grant(over: Partial<GrantLike> = {}): GrantLike {
  return { status: "authorized", expiresAt: null, authorizationDetails: SCOPE_CMF, ...over };
}

describe("isGrantActive", () => {
  it("autorizado y sin expiración → vigente", () => {
    expect(isGrantActive({ status: "authorized", expiresAt: null })).toBe(true);
  });
  it("autorizado con expiración futura → vigente", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isGrantActive({ status: "authorized", expiresAt: future })).toBe(true);
  });
  it("autorizado pero expirado → NO vigente", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isGrantActive({ status: "authorized", expiresAt: past })).toBe(false);
  });
  it("estados no autorizados → NO vigente", () => {
    for (const status of ["pending", "rejected", "revoked", "expired"]) {
      expect(isGrantActive({ status, expiresAt: null })).toBe(false);
    }
  });
});

describe("scopeCovers", () => {
  it("cubre el tipo presente en el scope", () => {
    expect(scopeCovers(SCOPE_CMF, "cmf_debt_report")).toBe(true);
  });
  it("no cubre un tipo ausente", () => {
    expect(scopeCovers(SCOPE_CMF, "sii_tax_data")).toBe(false);
    expect(scopeCovers(SCOPE_ACCTS, "cmf_debt_report")).toBe(false);
  });
  it("scope inválido/vacío → no cubre nada", () => {
    expect(scopeCovers("no-json", "cmf_debt_report")).toBe(false);
    expect(scopeCovers("[]", "cmf_debt_report")).toBe(false);
  });
});

describe("selectActiveConsent", () => {
  it("elige el grant vigente que cubre el recurso", () => {
    const grants = [
      grant({ status: "revoked" }), // vigencia no
      grant({ authorizationDetails: SCOPE_ACCTS }), // scope no
      grant(), // ✓ vigente + cubre cmf
    ];
    expect(selectActiveConsent(grants, "cmf_debt_report")).toBe(grants[2]);
  });
  it("null si ninguno califica", () => {
    expect(selectActiveConsent([grant({ status: "expired" })], "cmf_debt_report")).toBeNull();
    expect(selectActiveConsent([], "cmf_debt_report")).toBeNull();
  });
});

describe("assertSourceConsent (DB) — negativo determinista", () => {
  it("usuario sin grants → lanza ConsentRequiredError", async () => {
    const userId = `no-consent-${Date.now()}`;
    await expect(assertSourceConsent(userId, "cmf_debt_report")).rejects.toBeInstanceOf(
      ConsentRequiredError,
    );
    expect(await hasValidConsent(userId, "cmf_debt_report")).toBe(false);
  });
});
