import { describe, it, expect } from "vitest";
import { explainHealthV2 } from "../healthExplain";
import { evaluateHealthV2 } from "../evaluationEngine";
import type { HealthEvaluationInput } from "../types";

function input(over: Partial<HealthEvaluationInput> = {}): HealthEvaluationInput {
  return {
    deudaFlujo: 0.2,
    deudaActivos: 0.3,
    ahorroIngreso: 0.15,
    moraActiva: false,
    diasMora: 0,
    historialCmfRaw: 700,
    antiguedadMeses: 60,
    tiposCredito: 2,
    ...over,
  };
}

const CASES: [string, HealthEvaluationInput][] = [
  [
    "crítico con mora",
    input({ deudaFlujo: 0.6, deudaActivos: 0.9, moraActiva: true, diasMora: 90 }),
  ],
  ["crítico sin mora", input({ deudaFlujo: 0.6, deudaActivos: 0.9 })],
  [
    "sano",
    input({
      deudaFlujo: 0.1,
      deudaActivos: 0.15,
      ahorroIngreso: 0.3,
      historialCmfRaw: 800,
      tiposCredito: 3,
    }),
  ],
  [
    "intermedio con mora",
    input({ deudaFlujo: 0.35, deudaActivos: 0.5, moraActiva: true, diasMora: 15 }),
  ],
  ["ahorro negativo", input({ ahorroIngreso: -0.2, deudaFlujo: 0.4 })],
  ["sin historial", input({ historialCmfRaw: 0, antiguedadMeses: 0, tiposCredito: 0 })],
];

describe("explainHealthV2 — cross-check con el motor (sin drift)", () => {
  for (const [name, inp] of CASES) {
    it(`coincide con evaluateHealthV2: ${name}`, () => {
      const evalr = evaluateHealthV2(inp);
      const audit = explainHealthV2(inp);
      expect(audit.scoreRatios).toBe(evalr.scoreRatios);
      expect(audit.scoreInterno).toBe(evalr.scoreInterno);
      expect(audit.scoreCompuesto).toBe(evalr.scoreCompuesto);
      expect(audit.nivelBruto).toBe(evalr.nivelBruto);
      expect(audit.nivel).toBe(evalr.nivel);
      expect(audit.salida).toBe(evalr.salida);
      expect(audit.stage).toBe(evalr.zona);
    });
  }
});

describe("explainHealthV2 — contenido de la traza", () => {
  it("zona crítica: marca ambos cortes disparados + mora", () => {
    const a = explainHealthV2(input({ deudaFlujo: 0.6, deudaActivos: 0.9, moraActiva: true }));
    expect(a.stage).toBe("critica");
    const flujo = a.steps.find((s) => s.variable === "Deuda/Flujo");
    expect(flujo?.triggered).toBe(true);
    expect(flujo?.cut).toBe(0.5);
  });

  it("zona intermedia: cada variable con su contribución al score", () => {
    const a = explainHealthV2(input());
    expect(a.stage).toBe("intermedia");
    // 7 pasos: 3 ratios + 3 internos + mora
    expect(a.steps).toHaveLength(7);
    // los ratios restan, los internos suman
    const flujo = a.steps.find((s) => s.variable === "Deuda/Flujo");
    expect(flujo?.contribution).toBeLessThanOrEqual(0);
    const hist = a.steps.find((s) => s.variable === "Historial CMF");
    expect(hist?.contribution).toBeGreaterThan(0);
  });
});
