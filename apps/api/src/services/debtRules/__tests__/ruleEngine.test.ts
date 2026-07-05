import { describe, it, expect } from 'vitest';
import { evaluateDebtRules } from '../ruleEngine';
import type { DebtRuleContext } from '../types';
import type { HealthEvaluationResult, HealthLevel, HealthZone } from '../../healthEvaluation/types';
import type { CMFParseResult } from '../../../parsers/cmf-parser';

type Ratios = HealthEvaluationResult['ratios'];

function makeCmf(partial: Partial<CMFParseResult> = {}): CMFParseResult {
  return {
    titular: '',
    rut: '',
    fecha_emision: new Date(),
    fecha_actualizacion: new Date(),
    deuda_total: 0,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      tiene_deuda: false,
      porcentaje_al_dia: 100,
      porcentaje_en_atraso: 0,
      tiene_atraso_grave: false,
      score_cmf: 80,
      credito_disponible_total: 0,
    },
    ...partial,
  };
}

function makeCtx(opts: {
  ratios?: Partial<Ratios>;
  nivel?: HealthLevel;
  zona?: HealthZone;
  cmf?: Partial<CMFParseResult>;
  tiposCredito?: number;
}): DebtRuleContext {
  const ratios: Ratios = {
    deudaFlujo: 0.2,
    deudaActivos: 0.3,
    ahorroIngreso: 0.15,
    moraActiva: false,
    diasMora: 0,
    ...opts.ratios,
  };
  const health: HealthEvaluationResult = {
    nivel: opts.nivel ?? 1,
    nivelNombre: 'test',
    zona: opts.zona ?? 'intermedia',
    salida: 'refinanciamiento',
    scoreRatios: 0,
    scoreInterno: 0,
    scoreCompuesto: 0,
    nivelBruto: 0,
    ratios,
    productos: [],
    insights: [],
  };
  return {
    health,
    cmf: makeCmf(opts.cmf),
    creditScore: null,
    tiposCredito: opts.tiposCredito ?? 2,
  };
}

const consumo = (vigente: number, institucion = 'Banco X') => ({
  institucion,
  tipo_credito: 'consumo' as const,
  total: vigente,
  vigente,
  atraso_30_59: 0,
  atraso_60_89: 0,
  atraso_90_mas: 0,
});

describe('evaluateDebtRules', () => {
  it('dispara repactar_mora cuando hay mora activa', () => {
    const recs = evaluateDebtRules(makeCtx({ ratios: { moraActiva: true, diasMora: 45 }, zona: 'critica', nivel: -1 }));
    expect(recs.map((r) => r.key)).toContain('repactar_mora');
  });

  it('dispara consolidar_deudas con 2+ créditos de consumo vigentes', () => {
    const recs = evaluateDebtRules(
      makeCtx({ cmf: { deuda_directa: [consumo(1_000_000, 'A'), consumo(500_000, 'B')] } }),
    );
    expect(recs.map((r) => r.key)).toContain('consolidar_deudas');
  });

  it('dispara regularizar_atraso_temprano con atraso 30-59 y sin mora grave', () => {
    const recs = evaluateDebtRules(
      makeCtx({
        cmf: {
          deuda_directa: [{ ...consumo(800_000), atraso_30_59: 200_000 }],
        },
      }),
    );
    expect(recs.map((r) => r.key)).toContain('regularizar_atraso_temprano');
  });

  it('NO dispara regularizar_atraso_temprano si ya hay mora grave (atraso 90+)', () => {
    const recs = evaluateDebtRules(
      makeCtx({
        ratios: { moraActiva: true, diasMora: 90 },
        cmf: { deuda_directa: [{ ...consumo(800_000), atraso_30_59: 100_000, atraso_90_mas: 300_000 }] },
      }),
    );
    expect(recs.map((r) => r.key)).not.toContain('regularizar_atraso_temprano');
  });

  it('regla dura: en ZONA CRÍTICA solo se muestran reglas de reducción de deuda', () => {
    // Contexto con condiciones que dispararían reglas de las 3 familias.
    const recs = evaluateDebtRules(
      makeCtx({
        zona: 'critica',
        nivel: -1,
        ratios: { moraActiva: true, diasMora: 60, deudaFlujo: 0.6, deudaActivos: 0.85, ahorroIngreso: -0.1 },
        cmf: { deuda_directa: [consumo(1_000_000, 'A'), consumo(500_000, 'B')] },
      }),
    );
    expect(recs.length).toBeGreaterThan(0);
    // Ninguna recomendación de comportamiento ni ahorro/capacidad en zona crítica.
    for (const r of recs) {
      expect(r.familia).toBe('reduccion_deuda');
    }
  });

  it('en zona intermedia sí aparecen reglas de ahorro/capacidad (fondo_emergencia)', () => {
    const recs = evaluateDebtRules(makeCtx({ zona: 'intermedia', nivel: 1, ratios: { ahorroIngreso: 0.05 } }));
    expect(recs.some((r) => r.familia === 'ahorro_capacidad')).toBe(true);
  });

  it('ordena por prioridad descendente', () => {
    const recs = evaluateDebtRules(
      makeCtx({
        ratios: { moraActiva: true, diasMora: 30, deudaFlujo: 0.4, ahorroIngreso: 0.05 },
        cmf: { deuda_directa: [consumo(1_000_000, 'A'), consumo(500_000, 'B')] },
      }),
    );
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].prioridad).toBeGreaterThanOrEqual(recs[i].prioridad);
    }
  });

  it('incluye descripción, acción e impacto en cada recomendación', () => {
    const recs = evaluateDebtRules(makeCtx({ ratios: { moraActiva: true, diasMora: 45 } }));
    const rec = recs.find((r) => r.key === 'repactar_mora')!;
    expect(rec.descripcion).toContain('45');
    expect(rec.accion.length).toBeGreaterThan(0);
    expect(rec.impacto.length).toBeGreaterThan(0);
    expect(rec.familiaLabel.length).toBeGreaterThan(0);
  });
});
