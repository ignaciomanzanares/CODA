import { describe, it, expect } from "vitest";
import {
  generateSyntheticCohort,
  lenderVariableCatalog,
  runLenderConsoleSimulation,
} from "../lenderConsole";
import type { LenderPolicy } from "../lenderPolicy";

describe("generateSyntheticCohort", () => {
  it("es determinista para la misma semilla", () => {
    const a = generateSyntheticCohort(100, 7);
    const b = generateSyntheticCohort(100, 7);
    expect(a).toEqual(b);
  });

  it("respeta el tamaño y produce las variables exponibles esperadas", () => {
    const cohort = generateSyntheticCohort(50);
    expect(cohort).toHaveLength(50);
    const p = cohort[0];
    expect(typeof p.deudaFlujo).toBe("number");
    expect(typeof p.moraActiva).toBe("boolean");
    expect(p.historialCmf as number).toBeGreaterThanOrEqual(150);
    expect(p.historialCmf as number).toBeLessThanOrEqual(850);
  });
});

describe("lenderVariableCatalog", () => {
  it("agrupa por clase e incluye protegidas y exponibles", () => {
    const cat = lenderVariableCatalog();
    expect(cat.exposable.length).toBeGreaterThan(0);
    expect(cat.protected.length).toBeGreaterThan(0);
    expect(cat.protected.some((v) => v.id === "comuna")).toBe(true);
    expect(cat.exposable.some((v) => v.id === "deudaFlujo")).toBe(true);
  });
});

describe("runLenderConsoleSimulation", () => {
  it("simula una política válida y reporta tasa de aprobación", () => {
    const policy: LenderPolicy = {
      lenderId: "console",
      name: "Conservadora",
      version: "draft",
      criteria: [
        { variable: "deudaFlujo", op: "<=", threshold: 0.4 },
        { variable: "moraActiva", op: "==", threshold: false },
      ],
    };
    const r = runLenderConsoleSimulation(policy, 300);
    expect(r.validation.valid).toBe(true);
    expect(r.cohort).toEqual({ size: 300, synthetic: true });
    expect(r.simulation.total).toBe(300);
    expect(r.simulation.approved + r.simulation.rejected).toBe(300);
    expect(r.simulation.approvalRate).toBeGreaterThan(0);
    expect(r.simulation.approvalRate).toBeLessThan(1);
  });

  it("guard de fairness: ignora criterios sobre variables protegidas y las marca no exponibles", () => {
    const policy: LenderPolicy = {
      lenderId: "console",
      name: "Con sesgo",
      version: "draft",
      criteria: [
        { variable: "deudaFlujo", op: "<=", threshold: 0.5 },
        { variable: "comuna", op: "==", threshold: 1 }, // protegida → debe ignorarse
      ],
    };
    const r = runLenderConsoleSimulation(policy, 200);
    expect(r.validation.valid).toBe(false);
    expect(r.validation.nonExposable).toContain("comuna");
    // La simulación no falla por 'comuna' (se ignora): ninguna falla registrada en esa variable.
    expect(r.simulation.failuresByVariable.comuna).toBeUndefined();
  });
});
