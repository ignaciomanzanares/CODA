import { describe, it, expect } from "vitest";
import {
  computeConsentEvidenceHash,
  sealConsentEvidence,
  verifyConsentEvidence,
  type ConsentEvidenceFacts,
} from "../consentEvidence";

const facts: ConsentEvidenceFacts = {
  userId: "u1",
  authorizationDetails: JSON.stringify([{ type: "cmf_debt_report", actions: ["read"] }]),
  purpose: "Análisis de salud financiera",
  policyVersion: "1.0",
  sealedAt: "2026-08-31T12:00:00.000Z",
};

describe("computeConsentEvidenceHash", () => {
  it("es determinístico (mismos hechos → mismo hash)", () => {
    expect(computeConsentEvidenceHash(facts)).toBe(computeConsentEvidenceHash({ ...facts }));
  });
  it("cambia si cambia cualquier hecho", () => {
    const base = computeConsentEvidenceHash(facts);
    expect(computeConsentEvidenceHash({ ...facts, userId: "u2" })).not.toBe(base);
    expect(computeConsentEvidenceHash({ ...facts, purpose: "otro" })).not.toBe(base);
    expect(computeConsentEvidenceHash({ ...facts, policyVersion: "2.0" })).not.toBe(base);
    expect(computeConsentEvidenceHash({ ...facts, authorizationDetails: "[]" })).not.toBe(base);
    expect(computeConsentEvidenceHash({ ...facts, sealedAt: "2026-01-01T00:00:00.000Z" })).not.toBe(
      base,
    );
  });
  it("produce hex SHA-256 (64 chars)", () => {
    expect(computeConsentEvidenceHash(facts)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sealConsentEvidence", () => {
  it("sella con sealedAt dado y el hash corresponde", () => {
    const { evidenceHash, sealedAt } = sealConsentEvidence(facts);
    expect(sealedAt).toBe(facts.sealedAt);
    expect(evidenceHash).toBe(computeConsentEvidenceHash(facts));
  });
  it("usa el instante actual si no se pasa sealedAt", () => {
    const before = Date.now();
    const { sealedAt } = sealConsentEvidence({ ...facts, sealedAt: undefined });
    expect(new Date(sealedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("verifyConsentEvidence", () => {
  it("verifica un grant sellado íntegro", () => {
    const { evidenceHash, sealedAt } = sealConsentEvidence(facts);
    expect(verifyConsentEvidence({ ...facts, sealedAt, evidenceHash })).toBe(true);
  });
  it("detecta manipulación (scope alterado tras el sello)", () => {
    const { evidenceHash, sealedAt } = sealConsentEvidence(facts);
    const tampered = {
      ...facts,
      sealedAt,
      evidenceHash,
      authorizationDetails: JSON.stringify([{ type: "account_information" }]), // cambiado
    };
    expect(verifyConsentEvidence(tampered)).toBe(false);
  });
  it("grant sin sellar (hash/sealedAt null) → false", () => {
    expect(verifyConsentEvidence({ ...facts, sealedAt: null, evidenceHash: null })).toBe(false);
    expect(verifyConsentEvidence({ ...facts, sealedAt: facts.sealedAt, evidenceHash: null })).toBe(
      false,
    );
  });
});
