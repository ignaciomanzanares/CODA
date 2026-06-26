import { describe, it, expect } from 'vitest';
import { generateHabitRecommendations } from './habitEngine.js';
import type { HealthEvaluationResult } from '../healthEvaluation/types.js';

function makeResult(overrides: Partial<HealthEvaluationResult> = {}): HealthEvaluationResult {
  return {
    nivel: 0,
    nivelNombre: 'Sin deudas',
    zona: 'intermedia',
    salida: 'refinanciamiento',
    scoreRatios: 50,
    scoreInterno: 50,
    scoreCompuesto: 50,
    nivelBruto: 0,
    ratios: {
      deudaFlujo: 0.15,
      deudaActivos: 0.2,
      ahorroIngreso: 0.25,
      moraActiva: false,
      diasMora: 0,
    },
    productos: [],
    insights: [],
    ...overrides,
  };
}

describe('generateHabitRecommendations', () => {
  it('mora activa: incluye atender_mora con la máxima prioridad', () => {
    const result = makeResult({ ratios: { ...makeResult().ratios, moraActiva: true } });
    const habits = generateHabitRecommendations(result);
    expect(habits[0].key).toBe('atender_mora');
  });

  it('deudaFlujo alto: incluye reducir_deuda_alta, no reducir_deuda_moderada', () => {
    const result = makeResult({ ratios: { ...makeResult().ratios, deudaFlujo: 0.6 } });
    const habits = generateHabitRecommendations(result);
    expect(habits.some((h) => h.key === 'reducir_deuda_alta')).toBe(true);
    expect(habits.some((h) => h.key === 'reducir_deuda_moderada')).toBe(false);
  });

  it('ahorro bajo: incluye aumentar_ahorro', () => {
    const result = makeResult({ ratios: { ...makeResult().ratios, ahorroIngreso: 0.05 } });
    const habits = generateHabitRecommendations(result);
    expect(habits.some((h) => h.key === 'aumentar_ahorro')).toBe(true);
  });

  it('nivel alto con buenos ratios: incluye diversificar_inversion y mantener_buen_habito', () => {
    const result = makeResult({ nivel: 3 });
    const habits = generateHabitRecommendations(result);
    expect(habits.some((h) => h.key === 'diversificar_inversion')).toBe(true);
    expect(habits.some((h) => h.key === 'mantener_buen_habito')).toBe(true);
  });

  it('feedback loop: un hábito excluido no aparece aunque matchee', () => {
    const result = makeResult({ ratios: { ...makeResult().ratios, ahorroIngreso: 0.05 } });
    const habits = generateHabitRecommendations(result, new Set(['aumentar_ahorro']));
    expect(habits.some((h) => h.key === 'aumentar_ahorro')).toBe(false);
  });

  it('respeta el límite y ordena por prioridad descendente', () => {
    const result = makeResult({
      nivel: 3,
      ratios: { deudaFlujo: 0.6, deudaActivos: 0.9, ahorroIngreso: 0.05, moraActiva: true, diasMora: 10 },
    });
    const habits = generateHabitRecommendations(result, new Set(), 2);
    expect(habits.length).toBe(2);
    expect(habits[0].priority).toBeGreaterThanOrEqual(habits[1].priority);
    expect(habits[0].key).toBe('atender_mora');
  });

  it('sin condiciones de alerta: no incluye hábitos de deuda ni de ahorro bajo', () => {
    const result = makeResult({
      nivel: 1,
      ratios: { deudaFlujo: 0.2, deudaActivos: 0.3, ahorroIngreso: 0.15, moraActiva: false, diasMora: 0 },
    });
    const habits = generateHabitRecommendations(result);
    const keys = habits.map((h) => h.key);
    expect(keys).not.toContain('atender_mora');
    expect(keys).not.toContain('reducir_deuda_alta');
    expect(keys).not.toContain('reducir_deuda_moderada');
    expect(keys).not.toContain('aumentar_ahorro');
  });
});
