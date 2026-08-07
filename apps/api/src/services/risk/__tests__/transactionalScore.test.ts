import { describe, it, expect } from "vitest";
import {
  computeTransactionalScore,
  isTrustedTransactionalPd,
  PD_TRUSTED_MAX,
} from "../transactionalScore";
import type { UserRiskProfile } from "../userRiskProfile";

function profile(transactionMonths: number): UserRiskProfile {
  return {
    userId: "u1",
    transactional: {} as any,
    cmf: null,
    gov: { fiscalDebtClp: null, verifiedMonthlyIncomeClp: null },
    cartola: null,
    assets: [],
    storedScores: { creditScore: null, transactionalScore: null, txMetrics: null },
    meta: {
      hasCmfHistory: false,
      hasCartola: false,
      transactionMonths,
      ingresoMensualClp: 0,
      deudaTotalClp: 0,
    },
  };
}

describe("computeTransactionalScore", () => {
  it("sin señal suficiente (<3 meses) → available:false, sin número inventado", async () => {
    const r = await computeTransactionalScore(profile(1));
    expect(r.available).toBe(false);
    expect(r.score).toBeUndefined();
    expect(r.reason).toBeTruthy();
    expect(r.isBeta).toBe(true);
  });

  it("0 meses → available:false", async () => {
    const r = await computeTransactionalScore(profile(0));
    expect(r.available).toBe(false);
  });
});

describe("isTrustedTransactionalPd (guarda de cola)", () => {
  it("PD en la cola alta (ej. 3/100 ≈ PD 0.97) → NO confiable, se oculta", () => {
    expect(isTrustedTransactionalPd(0.966)).toBe(false);
    expect(isTrustedTransactionalPd(0.9)).toBe(false);
  });

  it("PD normal (riesgo medio/bajo) → confiable, se muestra", () => {
    expect(isTrustedTransactionalPd(0.5)).toBe(true);
    expect(isTrustedTransactionalPd(0.2)).toBe(true);
    expect(isTrustedTransactionalPd(0.05)).toBe(true);
  });

  it("guarda asimétrica: la cola BAJA (PD muy chica → 'Excelente') sí se muestra", () => {
    expect(isTrustedTransactionalPd(0.001)).toBe(true);
  });

  it("umbral: justo bajo PD_TRUSTED_MAX confía, en el umbral no", () => {
    expect(isTrustedTransactionalPd(PD_TRUSTED_MAX - 0.001)).toBe(true);
    expect(isTrustedTransactionalPd(PD_TRUSTED_MAX)).toBe(false);
  });

  it("PD no finita → no confiable (nunca inventar un número)", () => {
    expect(isTrustedTransactionalPd(NaN)).toBe(false);
  });
});
