import { describe, it, expect } from "vitest";
import {
  validateLenderPolicy,
  applyLenderPolicy,
  simulateLenderPolicy,
  type LenderPolicy,
  type VariableValues,
} from "../lenderPolicy";

function policy(criteria: LenderPolicy["criteria"]): LenderPolicy {
  return { lenderId: "banco-x", name: "Política consumo", version: "1", criteria };
}

describe("validateLenderPolicy", () => {
  it("válida si todos los criterios son exponibles", () => {
    const v = validateLenderPolicy(
      policy([
        { variable: "dti", op: "<=", threshold: 0.4 },
        { variable: "moraActiva", op: "==", threshold: false },
      ]),
    );
    expect(v.valid).toBe(true);
    expect(v.nonExposable).toEqual([]);
  });

  it("marca variables no exponibles (proxy/protegidas)", () => {
    const v = validateLenderPolicy(
      policy([
        { variable: "comuna", op: "==", threshold: 1 },
        { variable: "topCategoryShare", op: "<=", threshold: 0.5 },
      ]),
    );
    expect(v.valid).toBe(false);
    expect(v.nonExposable).toEqual(["comuna", "topCategoryShare"]);
  });

  it("sin criterios → inválida", () => {
    expect(validateLenderPolicy(policy([])).valid).toBe(false);
  });
});

describe("applyLenderPolicy", () => {
  const values: VariableValues = { dti: 0.3, moraActiva: false, ahorroIngreso: 0.25 };

  it("aprueba si todos los criterios pasan", () => {
    const d = applyLenderPolicy(
      policy([
        { variable: "dti", op: "<=", threshold: 0.4 },
        { variable: "moraActiva", op: "==", threshold: false },
      ]),
      values,
    );
    expect(d.decision).toBe("approve");
    expect(d.failed).toHaveLength(0);
    expect(d.passed).toHaveLength(2);
  });

  it("rechaza con el detalle del criterio que falla", () => {
    const d = applyLenderPolicy(policy([{ variable: "dti", op: "<=", threshold: 0.2 }]), values);
    expect(d.decision).toBe("reject");
    expect(d.failed[0].criterion.variable).toBe("dti");
    expect(d.failed[0].actual).toBe(0.3);
  });

  it("IGNORA criterios sobre variables no exponibles (guard de fairness)", () => {
    const d = applyLenderPolicy(
      policy([
        { variable: "edad", op: ">=", threshold: 25 }, // protegida → ignorada
        { variable: "dti", op: "<=", threshold: 0.4 }, // exponible → evaluada
      ]),
      { ...values, edad: 20 } as VariableValues,
    );
    expect(d.ignored.map((c) => c.variable)).toEqual(["edad"]);
    expect(d.decision).toBe("approve"); // solo cuenta dti, que pasa
  });

  it("dato faltante → el criterio falla (conservador)", () => {
    const d = applyLenderPolicy(policy([{ variable: "dti", op: "<=", threshold: 0.4 }]), {});
    expect(d.decision).toBe("reject");
    expect(d.failed[0].reason).toMatch(/sin dato/);
  });

  it("registra un snapshot inmutable de la política aplicada", () => {
    const p = policy([{ variable: "dti", op: "<=", threshold: 0.4 }]);
    const d = applyLenderPolicy(p, values);
    expect(d.policySnapshot.lenderId).toBe("banco-x");
    expect(d.policySnapshot.criteria).toHaveLength(1);
    // mutar el snapshot no afecta la política original
    d.policySnapshot.criteria[0].threshold = 0.9;
    expect(p.criteria[0].threshold).toBe(0.4);
  });
});

describe("simulateLenderPolicy", () => {
  it("calcula tasa de aprobación y rechazos por variable sobre una muestra", () => {
    const p = policy([
      { variable: "dti", op: "<=", threshold: 0.35 },
      { variable: "moraActiva", op: "==", threshold: false },
    ]);
    const sample: VariableValues[] = [
      { dti: 0.2, moraActiva: false }, // approve
      { dti: 0.5, moraActiva: false }, // reject (dti)
      { dti: 0.3, moraActiva: true }, // reject (mora)
      { dti: 0.1, moraActiva: false }, // approve
    ];
    const r = simulateLenderPolicy(p, sample);
    expect(r.total).toBe(4);
    expect(r.approved).toBe(2);
    expect(r.approvalRate).toBe(0.5);
    expect(r.failuresByVariable.dti).toBe(1);
    expect(r.failuresByVariable.moraActiva).toBe(1);
  });
});
