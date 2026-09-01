import { describe, it, expect } from "vitest";
import { HEALTH_V2_SCORECARD as SC } from "../healthScorecard.config";

/**
 * Invariantes del scorecard: la línea base auditable debe mantenerse coherente. Si alguien
 * recalibra (R3) y rompe una invariante, este test lo caza antes de que llegue a producción.
 */
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const approx = (v: number, target: number) => Math.abs(v - target) < 1e-9;

describe("HEALTH_V2_SCORECARD — invariantes", () => {
  it("los pesos del score de ratios suman 1.0", () => {
    const w = SC.ratiosScore.weights;
    expect(approx(sum([w.deudaFlujo, w.deudaActivos, w.ahorro]), 1)).toBe(true);
  });

  it("los pesos del score interno suman 1.0", () => {
    const w = SC.internalScore.weights;
    expect(approx(sum([w.historial, w.antiguedad, w.diversificacion]), 1)).toBe(true);
  });

  it("los pesos de la composición suman 1.0", () => {
    expect(approx(SC.composite.ratiosWeight + SC.composite.internoWeight, 1)).toBe(true);
  });

  it("los umbrales de insight están ordenados (alerta < alto; bajo < bueno)", () => {
    expect(SC.insights.deudaFlujoAlerta).toBeLessThan(SC.insights.deudaFlujoAlta);
    expect(SC.insights.ahorroBajo).toBeLessThan(SC.insights.ahorroBueno);
  });

  it("las salidas están ordenadas por nivel (ahorro > refinanciamiento)", () => {
    expect(SC.salidaThresholds.ahorroInversionMinNivel).toBeGreaterThan(
      SC.salidaThresholds.refinanciamientoMinNivel,
    );
  });

  it("los ratios/umbrales están en rango razonable (0–1) y anclas positivas", () => {
    for (const v of [
      SC.criticalZone.deudaFlujoMax,
      SC.criticalZone.deudaActivosMax,
      SC.ratiosScore.ahorroTarget,
    ]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(SC.internalScore.historialMax).toBe(850);
    expect(SC.internalScore.antiguedadTopeMeses).toBeGreaterThan(0);
    expect(SC.composite.levelMin).toBeLessThan(SC.composite.levelMax);
  });

  it("cada variable/supuesto está documentado (no vacío)", () => {
    for (const txt of Object.values(SC.assumptions)) {
      expect(typeof txt).toBe("string");
      expect(txt.length).toBeGreaterThan(10);
    }
  });
});
