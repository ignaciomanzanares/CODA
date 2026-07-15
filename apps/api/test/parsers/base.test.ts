/**
 * Tests para las funciones auxiliares de base.ts:
 *  - computeReconciliation
 *  - buildTransactionConfidence
 *  - computeOverallConfidence
 */

import { describe, it, expect } from "vitest";
import {
  computeReconciliation,
  buildTransactionConfidence,
  computeOverallConfidence,
  type ParsedTransaction,
} from "../../src/parsers/base.js";

// ── computeReconciliation ─────────────────────────────────────────────────────

describe("computeReconciliation", () => {
  it("pasa cuando saldo_inicial + abonos - cargos = saldo_final exacto", () => {
    const result = computeReconciliation(1_000_000, 1_200_000, 300_000, 500_000);
    // 1_000_000 + 500_000 - 300_000 = 1_200_000 ✓
    expect(result.passed).toBe(true);
    expect(result.delta_pct).toBe(0);
    expect(result.skipped).toBe(false);
  });

  it("pasa con diferencia mínima (centavos de redondeo)", () => {
    const result = computeReconciliation(850_000, 1_010_000, 320_000, 480_000);
    // 850_000 + 480_000 - 320_000 = 1_010_000 ✓
    expect(result.passed).toBe(true);
  });

  it("falla cuando delta > 1%", () => {
    // expected_final = 100_000 + 0 - 0 = 100_000 pero actual = 90_000 (10% off)
    const result = computeReconciliation(100_000, 90_000, 0, 0);
    expect(result.passed).toBe(false);
    expect(result.delta_pct).toBeGreaterThan(1);
  });

  it("marca como skipped cuando ambos saldos son 0", () => {
    const result = computeReconciliation(0, 0, 50_000, 80_000);
    expect(result.skipped).toBe(true);
    expect(result.passed).toBe(true); // skipped counts as "passed"
  });

  it("expected_final está redondeado", () => {
    const result = computeReconciliation(1_000_001, 1_000_001, 0, 0);
    expect(Number.isInteger(result.expected_final)).toBe(true);
  });
});

// ── buildTransactionConfidence ────────────────────────────────────────────────

describe("buildTransactionConfidence", () => {
  it("confianza máxima para transacción ideal (columna, monto redondo, descripción rica)", () => {
    const conf = buildTransactionConfidence({
      dateIsInferred: false,
      amountFromColumn: true,
      monto: 50_000,
      typeFromColumn: true,
      typeFromSection: false,
      descripcion: "Compra Nacional STARBUCKS MALL",
    });
    expect(conf.date).toBeGreaterThanOrEqual(0.9);
    expect(conf.amount).toBeGreaterThanOrEqual(0.9);
    expect(conf.type).toBeGreaterThanOrEqual(0.9);
    expect(conf.description).toBeGreaterThanOrEqual(0.9);
    expect(conf.overall).toBeGreaterThan(0.85);
  });

  it("confianza baja para fecha inferida + keyword + descripción corta", () => {
    const conf = buildTransactionConfidence({
      dateIsInferred: true,
      amountFromColumn: false,
      monto: 10_000,
      typeFromColumn: false,
      typeFromSection: false,
      descripcion: "TX",
    });
    expect(conf.date).toBeLessThan(0.8);
    expect(conf.type).toBeLessThan(0.85);
    expect(conf.description).toBeLessThan(0.8);
    expect(conf.overall).toBeLessThan(0.8);
  });

  it("monto sospechosamente pequeño (<100 CLP) baja confianza de amount", () => {
    const conf = buildTransactionConfidence({
      dateIsInferred: false,
      amountFromColumn: false,
      monto: 50,
      typeFromColumn: false,
      typeFromSection: false,
      descripcion: "Compra algo",
    });
    expect(conf.amount).toBeLessThan(0.7);
  });

  it("overall es promedio ponderado correcto (date×0.2 + amount×0.3 + type×0.3 + description×0.2)", () => {
    const conf = buildTransactionConfidence({
      dateIsInferred: false, // date = 0.95
      amountFromColumn: false, // amount = 0.90 (monto redondo)
      monto: 100_000,
      typeFromColumn: false,
      typeFromSection: true, // type = 0.88
      descripcion: "Compra supermercado jumbo",
    });
    const expectedOverall =
      conf.date * 0.2 + conf.amount * 0.3 + conf.type * 0.3 + conf.description * 0.2;
    expect(conf.overall).toBeCloseTo(expectedOverall, 2);
  });
});

// ── computeOverallConfidence ──────────────────────────────────────────────────

describe("computeOverallConfidence", () => {
  it("devuelve 0 para lista vacía", () => {
    expect(computeOverallConfidence([])).toBe(0);
  });

  it("devuelve el promedio de overall de cada transacción", () => {
    const makeTx = (overall: number) =>
      ({
        confidence: {
          date: 0.9,
          amount: 0.9,
          type: 0.9,
          description: 0.9,
          overall,
        },
      }) as unknown as ParsedTransaction;

    const txs = [makeTx(0.9), makeTx(0.8), makeTx(0.7)];
    const result = computeOverallConfidence(txs);
    expect(result).toBeCloseTo(0.8, 2);
  });
});
