import type { HealthEvaluationResult, HealthLevel } from '../healthEvaluation/types.js';

export type HabitCategory = 'deuda' | 'ahorro' | 'inversion' | 'mora';

export interface HabitDefinition {
  key: string;
  category: HabitCategory;
  title: string;
  description: string;
  /** Mayor prioridad = se muestra primero cuando varios hábitos matchean a la vez. */
  priority: number;
  matches: (result: HealthEvaluationResult) => boolean;
}

const nivelMin = (nivel: HealthLevel, min: number) => nivel >= min;
const nivelMax = (nivel: HealthLevel, max: number) => nivel <= max;

/**
 * Catálogo de hábitos financieros recomendables. Las `key` son estables (no UUIDs)
 * porque el feedback del usuario (`POST /api/habits/feedback`) se asocia a la key,
 * no a una instancia puntual de la recomendación — así "no me sirve" persiste
 * entre cálculos sucesivos del mismo hábito.
 */
export const HABIT_CATALOG: HabitDefinition[] = [
  {
    key: 'atender_mora',
    category: 'mora',
    title: 'Regulariza tus pagos atrasados',
    description: 'Tienes pagos en mora activa. Priorizar regularizarlos evita que la deuda siga creciendo por intereses moratorios y protege tu historial.',
    priority: 120,
    matches: (r) => r.ratios.moraActiva,
  },
  {
    key: 'reducir_deuda_activos',
    category: 'deuda',
    title: 'Reduce tu nivel de apalancamiento',
    description: 'Tu deuda supera el 80% de tus activos. Evita tomar deuda nueva y enfócate en pagar la existente antes de seguir creciendo el pasivo.',
    priority: 110,
    matches: (r) => r.ratios.deudaActivos > 0.80,
  },
  {
    key: 'reducir_deuda_alta',
    category: 'deuda',
    title: 'Reduce tu carga de deuda mensual',
    description: 'Más del 50% de tu flujo mensual va a pagar deuda. Prioriza los créditos con mayor tasa de interés primero (método avalancha).',
    priority: 100,
    matches: (r) => r.ratios.deudaFlujo > 0.50,
  },
  {
    key: 'reducir_deuda_moderada',
    category: 'deuda',
    title: 'Vigila tu ratio deuda/ingreso',
    description: 'Tu ratio deuda/flujo está en zona de alerta (30%-50%). Evita sumar nuevos créditos hasta bajarlo.',
    priority: 70,
    matches: (r) => r.ratios.deudaFlujo > 0.30 && r.ratios.deudaFlujo <= 0.50,
  },
  {
    key: 'aumentar_ahorro',
    category: 'ahorro',
    title: 'Aumenta tu tasa de ahorro',
    description: 'Estás ahorrando menos del 10% de tus ingresos. Un ajuste pequeño y sostenido en gastos fijos puede marcar la diferencia en 6 meses.',
    priority: 80,
    matches: (r) => r.ratios.ahorroIngreso < 0.10,
  },
  {
    key: 'fondo_emergencia',
    category: 'ahorro',
    title: 'Construye un fondo de emergencia',
    description: 'Antes de invertir, conviene tener 3-6 meses de gastos guardados en un instrumento líquido para cubrir imprevistos sin recurrir a deuda.',
    priority: 60,
    matches: (r) => nivelMin(r.nivel, 0) && nivelMax(r.nivel, 1),
  },
  {
    key: 'mantener_ahorro',
    category: 'ahorro',
    title: 'Sigue construyendo tu ahorro',
    description: 'Tu tasa de ahorro es razonable pero aún tiene espacio para crecer hacia el 20% recomendado de tus ingresos.',
    priority: 40,
    matches: (r) => r.ratios.ahorroIngreso >= 0.10 && r.ratios.ahorroIngreso < 0.20,
  },
  {
    key: 'diversificar_inversion',
    category: 'inversion',
    title: 'Diversifica tus inversiones',
    description: 'Tu salud financiera es sólida. Es buen momento para distribuir tus ahorros en más de un instrumento y no concentrar el riesgo.',
    priority: 50,
    matches: (r) => nivelMin(r.nivel, 3),
  },
  {
    key: 'mantener_buen_habito',
    category: 'ahorro',
    title: 'Mantén tu disciplina financiera',
    description: 'Tu ratio de deuda es bajo y tu ahorro es saludable. Mantener estos hábitos es lo que te permite seguir subiendo de nivel.',
    priority: 30,
    matches: (r) => nivelMin(r.nivel, 2) && r.ratios.deudaFlujo <= 0.30 && r.ratios.ahorroIngreso >= 0.20,
  },
];

export const HABIT_KEYS = new Set(HABIT_CATALOG.map((h) => h.key));
