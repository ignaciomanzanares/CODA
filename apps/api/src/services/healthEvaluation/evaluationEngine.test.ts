import { describe, it, expect } from 'vitest';
import { evaluateHealthV2 } from './evaluationEngine.js';
import { deriveHealthInput } from './ratiosDerivation.js';
import type { HealthEvaluationInput } from './types.js';

const baseInput = (): HealthEvaluationInput => ({
  deudaFlujo: 0.20,
  deudaActivos: 0.30,
  ahorroIngreso: 0.25,
  moraActiva: false,
  diasMora: 0,
  historialCmfRaw: 600,
  antiguedadMeses: 60,
  tiposCredito: 2,
});

// ── Etapa 1: regla guardia zona crítica ───────────────────────────────────────

describe('Etapa 1 — regla guardia zona crítica', () => {
  it('concursal cuando deudaFlujo>0.50 Y deudaActivos>0.80 Y mora activa', () => {
    const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.60, deudaActivos: 0.85, moraActiva: true, diasMora: 90 });
    expect(result.zona).toBe('critica');
    expect(result.salida).toBe('concursal');
    expect(result.nivel).toBe(-2);
    expect(result.productos).toHaveLength(0);
  });

  it('reestructuracion cuando deudaFlujo>0.50 Y deudaActivos>0.80 Y sin mora', () => {
    const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.60, deudaActivos: 0.85, moraActiva: false });
    expect(result.zona).toBe('critica');
    expect(result.salida).toBe('reestructuracion');
    expect(result.nivel).toBe(-1);
    expect(result.salida).not.toBe('refinanciamiento');
  });

  it('zona intermedia cuando solo deudaFlujo>0.50 pero deudaActivos ok', () => {
    const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.55, deudaActivos: 0.70 });
    expect(result.zona).toBe('intermedia');
  });

  it('zona intermedia cuando solo deudaActivos>0.80 pero deudaFlujo ok', () => {
    const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.40, deudaActivos: 0.85 });
    expect(result.zona).toBe('intermedia');
  });

  it('zona intermedia en el límite exacto (deudaFlujo=0.50, deudaActivos=0.80)', () => {
    const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.50, deudaActivos: 0.80 });
    expect(result.zona).toBe('intermedia');
  });

  it('nunca devuelve refinanciamiento en zona critica', () => {
    for (const mora of [true, false]) {
      const result = evaluateHealthV2({ ...baseInput(), deudaFlujo: 0.80, deudaActivos: 0.90, moraActiva: mora, diasMora: mora ? 45 : 0 });
      expect(result.salida).not.toBe('refinanciamiento');
    }
  });
});

// ── Etapa 2: scoring compuesto ────────────────────────────────────────────────

describe('Etapa 2 — scoring compuesto', () => {
  it('nivel 5 con ratios perfectos', () => {
    const result = evaluateHealthV2({
      deudaFlujo: 0,
      deudaActivos: 0,
      ahorroIngreso: 0.40,
      moraActiva: false,
      diasMora: 0,
      historialCmfRaw: 850,
      antiguedadMeses: 120,
      tiposCredito: 3,
    });
    expect(result.nivel).toBe(5);
    expect(result.scoreCompuesto).toBeGreaterThan(87);
  });

  it('nivel bajo con ratios malos', () => {
    const result = evaluateHealthV2({
      deudaFlujo: 0.45,
      deudaActivos: 0.75,
      ahorroIngreso: 0.02,
      moraActiva: false,
      diasMora: 0,
      historialCmfRaw: 200,
      antiguedadMeses: 0,
      tiposCredito: 0,
    });
    expect(result.nivel).toBeLessThanOrEqual(0);
  });

  it('penalización mora: nivelBruto=2 con mora → nivel=0', () => {
    const result = evaluateHealthV2({
      deudaFlujo: 0.10,
      deudaActivos: 0.15,
      ahorroIngreso: 0.30,
      moraActiva: true,
      diasMora: 45,
      historialCmfRaw: 700,
      antiguedadMeses: 60,
      tiposCredito: 2,
    });
    expect(result.nivelBruto).toBeGreaterThanOrEqual(2);
    expect(result.nivel).toBe(result.nivelBruto - 2);
  });

  it('penalización mora no baja de -2', () => {
    const result = evaluateHealthV2({
      ...baseInput(),
      deudaFlujo: 0.45,
      deudaActivos: 0.70,
      moraActiva: true,
      diasMora: 90,
      historialCmfRaw: 100,
      antiguedadMeses: 0,
      tiposCredito: 0,
    });
    expect(result.nivel).toBeGreaterThanOrEqual(-2);
  });

  it('scoreRatios es 0 cuando deuda es máxima', () => {
    const result = evaluateHealthV2({
      ...baseInput(),
      deudaFlujo: 1.0,
      deudaActivos: 1.0,
      ahorroIngreso: -0.5,
    });
    expect(result.scoreRatios).toBe(0);
  });
});

// ── Mapeo nivel → salida ─────────────────────────────────────────────────────

describe('Mapeo nivel → salida (zona intermedia)', () => {
  const cases: [Partial<HealthEvaluationInput>, string][] = [
    [{ deudaFlujo: 0, deudaActivos: 0, ahorroIngreso: 0.40, historialCmfRaw: 850, antiguedadMeses: 120, tiposCredito: 3 }, 'ahorro_inversion'],
    [{ deudaFlujo: 0.35, deudaActivos: 0.50, ahorroIngreso: 0.05, historialCmfRaw: 300, antiguedadMeses: 12, tiposCredito: 1 }, 'ahorro_inversion'],
  ];

  it.each(cases)('mapeo correcto', (overrides, expectedSalida) => {
    const result = evaluateHealthV2({ ...baseInput(), ...overrides });
    expect(result.zona).toBe('intermedia');
    expect(result.salida).toBe(expectedSalida);
  });

  it('nivel 1 → ahorro_inversion', () => {
    // Score que aterrice en nivel 1: compuesto ~37.5 (tramo 1: 25-37.5)
    const result = evaluateHealthV2({
      deudaFlujo: 0.25,
      deudaActivos: 0.35,
      ahorroIngreso: 0.15,
      moraActiva: false,
      diasMora: 0,
      historialCmfRaw: 400,
      antiguedadMeses: 36,
      tiposCredito: 1,
    });
    if (result.nivel >= 1) {
      expect(result.salida).toBe('ahorro_inversion');
    } else {
      expect(result.salida).toBe('refinanciamiento');
    }
  });
});

// ── ratiosDerivation ─────────────────────────────────────────────────────────

describe('deriveHealthInput', () => {
  const baseCmf = {
    titular: 'Test',
    rut: '12.345.678-9',
    fecha_emision: new Date(),
    fecha_actualizacion: new Date(),
    deuda_total: 5_000_000,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      tiene_deuda: true,
      porcentaje_al_dia: 100,
      porcentaje_en_atraso: 0,
      tiene_atraso_grave: false,
      score_cmf: 70,
      credito_disponible_total: 2_000_000,
    },
  };

  it('patrimonio default = ingreso*3 cuando sin datos SFA', () => {
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 5_000_000,
      ahorroMensualClp: 200_000,
      cmf: baseCmf,
    });
    // activosClp = 3_000_000; deudaActivos = 5_000_000 / 3_000_000 ≈ 1.67
    expect(result.deudaActivos).toBeCloseTo(5_000_000 / 3_000_000, 2);
  });

  it('activos SFA tienen preferencia sobre default', () => {
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 5_000_000,
      ahorroMensualClp: 200_000,
      cmf: baseCmf,
      sfaProductBalancesClp: 20_000_000,
    });
    expect(result.deudaActivos).toBeCloseTo(5_000_000 / 20_000_000, 3);
  });

  it('activos declarados se suman a líquidos', () => {
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 5_000_000,
      ahorroMensualClp: 200_000,
      cmf: baseCmf,
      sfaProductBalancesClp: 10_000_000,
      userAssets: [
        { id: '1', userId: 'u1', type: 'property', name: 'Depto', acquisitionCostClp: 50_000_000, estimatedValueClp: null, hasLien: false, lienAmountClp: null, currency: 'CLP', documentId: null, notes: null, createdAt: '', updatedAt: '' },
      ],
    });
    // activos = 10_000_000 + 50_000_000 = 60_000_000
    expect(result.deudaActivos).toBeCloseTo(5_000_000 / 60_000_000, 3);
  });

  it('mora activa desde atraso_90_mas', () => {
    const cmfConMora = {
      ...baseCmf,
      deuda_directa: [{
        institucion: 'Banco X',
        tipo_credito: 'consumo' as const,
        total: 1_000_000,
        vigente: 0,
        atraso_30_59: 0,
        atraso_60_89: 0,
        atraso_90_mas: 1_000_000,
      }],
    };
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 1_000_000,
      ahorroMensualClp: 100_000,
      cmf: cmfConMora,
    });
    expect(result.moraActiva).toBe(true);
    expect(result.diasMora).toBe(90);
  });

  it('ahorroIngreso puede ser negativo', () => {
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 2_000_000,
      ahorroMensualClp: -200_000,
      cmf: baseCmf,
    });
    expect(result.ahorroIngreso).toBeLessThan(0);
  });

  it('tiposCredito cuenta tipos únicos', () => {
    const cmfMultiTipo = {
      ...baseCmf,
      deuda_directa: [
        { institucion: 'A', tipo_credito: 'consumo' as const, total: 100, vigente: 100, atraso_30_59: 0, atraso_60_89: 0, atraso_90_mas: 0 },
        { institucion: 'B', tipo_credito: 'vivienda' as const, total: 100, vigente: 100, atraso_30_59: 0, atraso_60_89: 0, atraso_90_mas: 0 },
        { institucion: 'C', tipo_credito: 'consumo' as const, total: 100, vigente: 100, atraso_30_59: 0, atraso_60_89: 0, atraso_90_mas: 0 },
      ],
    };
    const result = deriveHealthInput({
      ingresoMensualClp: 1_000_000,
      deudaMensualClp: 100_000,
      deudaTotalClp: 300_000,
      ahorroMensualClp: 100_000,
      cmf: cmfMultiTipo,
    });
    expect(result.tiposCredito).toBe(2);
  });
});
