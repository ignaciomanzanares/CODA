import { describe, it, expect } from "vitest";
import {
  computeMonthlyHealthMetrics,
  mesesDeFondoEmergencia,
  type HealthTxLike,
} from "../financialHealthMetrics";

const income = (month: string, abono: number, extra: Partial<HealthTxLike> = {}): HealthTxLike => ({
  month,
  tipo: "ingreso",
  abono,
  cargo: 0,
  ...extra,
});
const expense = (month: string, cargo: number, categoria = "otro"): HealthTxLike => ({
  month,
  tipo: "egreso",
  abono: 0,
  cargo,
  categoria,
});

const noInternal = () => false;

describe("computeMonthlyHealthMetrics", () => {
  it("normaliza los totales por los meses con datos (mensual, no total histórico)", () => {
    // 6 meses: ingreso 1.65M/mes, gasto 1.20M/mes.
    const txs: HealthTxLike[] = [];
    for (const m of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      txs.push(income(m, 1_650_000));
      txs.push(expense(m, 1_200_000));
    }
    const r = computeMonthlyHealthMetrics(txs, noInternal);
    expect(r.monthsCount).toBe(6);
    expect(r.totalIncome).toBe(9_900_000);
    expect(r.totalExpenses).toBe(7_200_000);
    expect(r.monthlyIncome).toBe(1_650_000);
    expect(r.monthlyExpenses).toBe(1_200_000);
    // savingsRate es ratio (invariante a la escala): (9.9-7.2)/9.9 ≈ 27%.
    expect(r.savingsRate).toBe(27);
  });

  it("REGRESIÓN: los meses de fondo usan el gasto MENSUAL, no el total de N meses", () => {
    const txs: HealthTxLike[] = [];
    for (const m of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      txs.push(income(m, 1_650_000));
      txs.push(expense(m, 1_200_000));
    }
    const r = computeMonthlyHealthMetrics(txs, noInternal);
    const saldo = 9_000_000;
    // Correcto: 9.0M / 1.2M mensual = 7.5 meses de fondo (usuario SANO).
    expect(mesesDeFondoEmergencia(saldo, r.monthlyExpenses)).toBeCloseTo(7.5, 5);
    // El bug anterior dividía por el total histórico (7.2M) → 1.25 → "crítico".
    expect(saldo / r.totalExpenses).toBeCloseTo(1.25, 2);
    expect(mesesDeFondoEmergencia(saldo, r.monthlyExpenses)).toBeGreaterThan(
      saldo / r.totalExpenses,
    );
  });

  it("excluye transferencias internas del ingreso/gasto", () => {
    const txs: HealthTxLike[] = [
      income("2026-08", 1_000_000),
      expense("2026-08", 200_000),
      income("2026-08", 5_000_000), // traspaso interno → no cuenta como ingreso
    ];
    const isInternal = (t: HealthTxLike) => t.abono === 5_000_000;
    const r = computeMonthlyHealthMetrics(txs, isInternal);
    expect(r.totalIncome).toBe(1_000_000);
    expect(r.monthsCount).toBe(1);
  });

  it("monthsCount mínimo 1 aunque falte el campo month (evita división por cero)", () => {
    const txs: HealthTxLike[] = [{ tipo: "egreso", abono: 0, cargo: 300_000 }];
    const r = computeMonthlyHealthMetrics(txs, noInternal);
    expect(r.monthsCount).toBe(1);
    expect(r.monthlyExpenses).toBe(300_000);
  });

  it("calcula el % de gasto en educación sobre el ingreso", () => {
    const txs: HealthTxLike[] = [
      income("2026-08", 1_000_000),
      expense("2026-08", 200_000, "educacion"),
    ];
    const r = computeMonthlyHealthMetrics(txs, noInternal);
    expect(r.hasEduExpenses).toBe(true);
    expect(r.eduTotal).toBe(200_000);
    expect(r.eduPct).toBe(20);
  });

  it("mesesDeFondoEmergencia devuelve 0 si no hay gasto mensual", () => {
    expect(mesesDeFondoEmergencia(1_000_000, 0)).toBe(0);
  });
});
