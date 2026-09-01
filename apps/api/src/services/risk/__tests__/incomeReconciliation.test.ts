import { describe, it, expect } from "vitest";
import {
  reconcileIncome,
  RECONCILIATION_CONFIG as CFG,
  type IncomeSignal,
} from "../incomeReconciliation";

const NOW = new Date("2026-08-31T00:00:00.000Z");
const fresh = "2026-08-01T00:00:00.000Z";
const old = "2025-06-01T00:00:00.000Z"; // > 6 meses

function sig(source: IncomeSignal["source"], monthlyClp: number, asOf = fresh): IncomeSignal {
  return { source, monthlyClp, asOf };
}

describe("reconcileIncome — elección y confianza", () => {
  it("sin señales válidas → 0, sin fuente", () => {
    const r = reconcileIncome([], NOW);
    expect(r.monthlyClp).toBe(0);
    expect(r.chosenSource).toBeNull();
  });

  it("ignora señales con monto ≤ 0", () => {
    const r = reconcileIncome([sig("sii", 0), sig("cartola", 1_000_000)], NOW);
    expect(r.chosenSource).toBe("cartola");
    expect(r.monthlyClp).toBe(1_000_000);
  });

  it("elige la fuente de mayor confianza base (SII sobre cartola)", () => {
    const r = reconcileIncome([sig("cartola", 900_000), sig("sii", 1_000_000)], NOW);
    expect(r.chosenSource).toBe("sii");
    expect(r.monthlyClp).toBe(1_000_000);
  });

  it("fuentes que concuerdan (≤15%) suben la confianza de la elegida", () => {
    const r = reconcileIncome([sig("sii", 1_000_000), sig("afp", 950_000)], NOW);
    const top = r.confidenceBySource[0];
    expect(top.source).toBe("sii");
    // base 0.9 + bono 0.05 por acuerdo
    expect(top.confidence).toBeCloseTo(CFG.baseConfidence.sii + CFG.agreeBonus, 5);
  });
});

describe("reconcileIncome — frescura", () => {
  it("penaliza y marca una fuente obsoleta (> 6 meses)", () => {
    const r = reconcileIncome([sig("sii", 1_000_000, old)], NOW);
    const s = r.confidenceBySource[0];
    expect(s.stale).toBe(true);
    expect(s.confidence).toBeCloseTo(CFG.baseConfidence.sii * CFG.staleFactor, 5);
    expect(r.discrepancies.some((d) => d.kind === "stale_source")).toBe(true);
  });
});

describe("reconcileIncome — discrepancias", () => {
  it("detecta ingreso informal (cartola >> SII)", () => {
    const r = reconcileIncome([sig("sii", 600_000), sig("cartola", 1_000_000)], NOW);
    const d = r.discrepancies.find((x) => x.kind === "informal_income");
    expect(d).toBeTruthy();
    expect(d?.severity).toBe("warn");
  });

  it("detecta ingreso declarado que no pasa por la cuenta (SII >> cartola)", () => {
    const r = reconcileIncome([sig("sii", 1_200_000), sig("cartola", 700_000)], NOW);
    expect(r.discrepancies.some((d) => d.kind === "possible_undeclared_account")).toBe(true);
  });

  it("detecta brecha grande entre fuentes", () => {
    const r = reconcileIncome([sig("afp", 500_000), sig("cartola", 1_000_000)], NOW);
    expect(r.discrepancies.some((d) => d.kind === "large_gap")).toBe(true);
  });

  it("fuentes coherentes → sin discrepancias", () => {
    const r = reconcileIncome([sig("sii", 1_000_000), sig("cartola", 980_000)], NOW);
    expect(r.discrepancies).toHaveLength(0);
  });
});
