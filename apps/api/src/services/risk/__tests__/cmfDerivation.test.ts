import { describe, it, expect } from "vitest";
import { deriveCmfFeatures, sumAtrasos, normalizeCmfData } from "../cmfDerivation";
import type { CMFParseResult } from "../../../parsers/cmf-parser";

function cmf(overrides: Partial<CMFParseResult> = {}): CMFParseResult {
  return {
    titular: "",
    rut: "",
    fecha_emision: new Date(0),
    fecha_actualizacion: new Date(0),
    deuda_total: 0,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      tiene_deuda: false,
      porcentaje_al_dia: 100,
      porcentaje_en_atraso: 0,
      tiene_atraso_grave: false,
      score_cmf: 85,
      credito_disponible_total: 0,
    },
    ...overrides,
  } as CMFParseResult;
}

const row = (o: Partial<CMFParseResult["deuda_directa"][number]>) => ({
  institucion: "X",
  tipo_credito: "consumo" as const,
  total: 0,
  vigente: 0,
  atraso_30_59: 0,
  atraso_60_89: 0,
  atraso_90_mas: 0,
  ...o,
});

describe("cmfDerivation", () => {
  it("sumAtrasos suma buckets de deuda directa + indirecta", () => {
    const c = cmf({
      deuda_directa: [row({ atraso_30_59: 1, atraso_90_mas: 2 })],
      deuda_indirecta: [{ ...row({ atraso_60_89: 3 }), tipo_credito: "otro" }],
    });
    expect(sumAtrasos(c)).toEqual({ mora30: 1, mora60: 3, mora90: 2 });
  });

  it("deriveCmfFeatures: DTI = deuda / ingreso anual", () => {
    const c = cmf({ deuda_total: 12_000_000, metricas: { ...cmf().metricas, tiene_deuda: true } });
    const f = deriveCmfFeatures(c, 1_000_000); // ingreso anual 12M → DTI = 1.0
    expect(f.deudaIngresoRatio).toBeCloseTo(1.0, 5);
    expect(f.tieneDeuda).toBe(true);
  });

  it("deriveCmfFeatures: utilización = deuda / (deuda + disponible)", () => {
    const c = cmf({
      deuda_total: 800_000,
      metricas: { ...cmf().metricas, credito_disponible_total: 200_000 },
    });
    const f = deriveCmfFeatures(c, 500_000);
    expect(f.utilizacion).toBeCloseTo(0.8, 5); // 800k / (800k + 200k)
  });

  it("deriveCmfFeatures: acepta deudaTotal ajustado (p. ej. + deuda fiscal TGR)", () => {
    const c = cmf({ deuda_total: 10_000_000 });
    const f = deriveCmfFeatures(c, 1_000_000, 15_000_000); // TGR suma 5M
    expect(f.deudaTotalClp).toBe(15_000_000);
  });

  it("deriveCmfFeatures: cuenta tipos de crédito distintos", () => {
    const c = cmf({
      deuda_directa: [
        row({ tipo_credito: "consumo" }),
        row({ tipo_credito: "vivienda" }),
        row({ tipo_credito: "consumo" }),
      ],
    });
    expect(deriveCmfFeatures(c, 1_000_000).tiposCredito).toBe(2);
  });

  it("sin deuda: DTI y utilización = 0, tieneDeuda false", () => {
    const f = deriveCmfFeatures(cmf(), 1_000_000);
    expect(f.deudaIngresoRatio).toBe(0);
    expect(f.utilizacion).toBe(0);
    expect(f.tieneDeuda).toBe(false);
  });

  it("normalizeCmfData: formato legacy (deudaTotalVigente) → CMFParseResult", () => {
    const n = normalizeCmfData({ deudaTotalVigente: 5_000_000 });
    expect(n.deuda_total).toBe(5_000_000);
    expect(Array.isArray(n.deuda_directa)).toBe(true);
  });
});
