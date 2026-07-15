import { describe, it, expect } from "vitest";
import { evaluateCreditScorecard, type ScorecardInput } from "../creditScorecard";

const base: ScorecardInput = { mora30: 0, mora60: 0, mora90: 0, dti: 0, util: 0 };

describe("creditScorecard (logístico GMSC)", () => {
  it("paridad con el modelo Python entrenado (ancla los coeficientes)", () => {
    // Mismos perfiles que el sanity de train_logreg.py → mismos PD.
    expect(
      evaluateCreditScorecard({ mora30: 0, mora60: 0, mora90: 0, dti: 0.2, util: 0.1 }).pd * 100,
    ).toBeCloseTo(2.31, 1);
    expect(
      evaluateCreditScorecard({ mora30: 1, mora60: 0, mora90: 0, dti: 0.5, util: 0.5 }).pd * 100,
    ).toBeCloseTo(7.47, 1);
    expect(
      evaluateCreditScorecard({ mora30: 2, mora60: 1, mora90: 1, dti: 1.5, util: 0.9 }).pd * 100,
    ).toBeCloseTo(35.33, 1);
  });

  it("score cae monótonamente al aumentar la mora", () => {
    const s0 = evaluateCreditScorecard(base).score;
    const s90 = evaluateCreditScorecard({ ...base, mora90: 2 }).score;
    expect(s90).toBeLessThan(s0);
  });

  it("score cae al aumentar la utilización (driver dominante)", () => {
    const low = evaluateCreditScorecard({ ...base, util: 0.1 }).score;
    const high = evaluateCreditScorecard({ ...base, util: 1.0 }).score;
    expect(high).toBeLessThan(low);
    // La utilización pesa más que un atraso leve: util 1.0 baja más que un mora30.
    const mora = evaluateCreditScorecard({ ...base, mora30: 1 }).score;
    expect(evaluateCreditScorecard({ ...base, util: 1.0 }).score).toBeLessThan(mora);
  });

  it("mora90 pesa más que mora60 (peor atraso, más riesgo)", () => {
    const s60 = evaluateCreditScorecard({ ...base, mora60: 1 }).score;
    const s90 = evaluateCreditScorecard({ ...base, mora90: 1 }).score;
    expect(s90).toBeLessThan(s60);
  });

  it("razones ordenadas por contribución, con dirección correcta", () => {
    const r = evaluateCreditScorecard({ mora30: 0, mora60: 0, mora90: 0, dti: 0.5, util: 1.0 });
    expect(r.reasons[0].feature).toBe("util"); // mayor contribución
    expect(r.reasons.every((x) => x.direction === "increases_risk")).toBe(true);
  });

  it("score se mantiene en [0, 850]", () => {
    const best = evaluateCreditScorecard(base).score;
    const worst = evaluateCreditScorecard({
      mora30: 10,
      mora60: 10,
      mora90: 10,
      dti: 2,
      util: 2,
    }).score;
    expect(best).toBeLessThanOrEqual(850);
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThan(best);
  });
});
