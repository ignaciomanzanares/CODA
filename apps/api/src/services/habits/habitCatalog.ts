import type { HealthEvaluationResult, HealthLevel } from "../healthEvaluation/types.js";

export type HabitCategory = "deuda" | "ahorro" | "inversion" | "mora";

export interface HabitDefinition {
  key: string;
  category: HabitCategory;
  title: string;
  description: string;
  /** Mayor prioridad = se muestra primero cuando varios hábitos matchean a la vez. */
  priority: number;
  matches: (result: HealthEvaluationResult) => boolean;
  /**
   * Descripción PERSONALIZADA (#34): interpola los números reales del usuario (su ratio actual,
   * sus días de mora), no solo el umbral genérico. Si no se define, se usa `description` fija.
   */
  describe?: (result: HealthEvaluationResult) => string;
}

const nivelMin = (nivel: HealthLevel, min: number) => nivel >= min;
const nivelMax = (nivel: HealthLevel, max: number) => nivel <= max;

/** Formatea un ratio 0–1 como porcentaje entero (ej. 0.834 → "83%"). */
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * Catálogo de hábitos financieros recomendables. Las `key` son estables (no UUIDs)
 * porque el feedback del usuario (`POST /api/habits/feedback`) se asocia a la key,
 * no a una instancia puntual de la recomendación — así "no me sirve" persiste
 * entre cálculos sucesivos del mismo hábito.
 */
export const HABIT_CATALOG: HabitDefinition[] = [
  {
    key: "atender_mora",
    category: "mora",
    title: "Regulariza tus pagos atrasados",
    description:
      "Tienes pagos en mora activa. Priorizar regularizarlos evita que la deuda siga creciendo por intereses moratorios y protege tu historial.",
    priority: 120,
    matches: (r) => r.ratios.moraActiva,
    describe: (r) =>
      `Tienes pagos en mora con ${r.ratios.diasMora} día(s) de atraso. Regularizarlos cuanto antes ` +
      `evita que la deuda siga creciendo por intereses moratorios y protege tu historial.`,
  },
  {
    key: "reducir_deuda_activos",
    category: "deuda",
    title: "Reduce tu nivel de apalancamiento",
    description:
      "Tu deuda supera el 80% de tus activos. Evita tomar deuda nueva y enfócate en pagar la existente antes de seguir creciendo el pasivo.",
    priority: 110,
    matches: (r) => r.ratios.deudaActivos > 0.8,
    describe: (r) =>
      `Tu deuda equivale al ${pct(r.ratios.deudaActivos)} de tus activos (umbral de alerta: 80%). ` +
      `Evita tomar deuda nueva y enfócate en pagar la existente antes de seguir creciendo el pasivo.`,
  },
  {
    key: "reducir_deuda_alta",
    category: "deuda",
    title: "Reduce tu carga de deuda mensual",
    description:
      "Más del 50% de tu flujo mensual va a pagar deuda. Prioriza los créditos con mayor tasa de interés primero (método avalancha).",
    priority: 100,
    matches: (r) => r.ratios.deudaFlujo > 0.5,
    describe: (r) =>
      `El ${pct(r.ratios.deudaFlujo)} de tu flujo mensual va a pagar deuda (sobre el umbral de 50%). ` +
      `Prioriza los créditos con mayor tasa de interés primero (método avalancha).`,
  },
  {
    key: "reducir_deuda_moderada",
    category: "deuda",
    title: "Vigila tu ratio deuda/ingreso",
    description:
      "Tu ratio deuda/flujo está en zona de alerta (30%-50%). Evita sumar nuevos créditos hasta bajarlo.",
    priority: 70,
    matches: (r) => r.ratios.deudaFlujo > 0.3 && r.ratios.deudaFlujo <= 0.5,
    describe: (r) =>
      `Tu ratio deuda/flujo es ${pct(r.ratios.deudaFlujo)} (zona de alerta: 30%–50%). ` +
      `Evita sumar nuevos créditos hasta bajarlo.`,
  },
  {
    key: "aumentar_ahorro",
    category: "ahorro",
    title: "Aumenta tu tasa de ahorro",
    description:
      "Estás ahorrando menos del 10% de tus ingresos. Un ajuste pequeño y sostenido en gastos fijos puede marcar la diferencia en 6 meses.",
    priority: 80,
    matches: (r) => r.ratios.ahorroIngreso < 0.1,
    describe: (r) =>
      r.ratios.ahorroIngreso < 0
        ? `Este mes estás gastando más de lo que ingresas (ahorro ${pct(r.ratios.ahorroIngreso)}). ` +
          `Recortar un gasto fijo, aunque sea pequeño, es el primer paso para revertirlo.`
        : `Estás ahorrando el ${pct(r.ratios.ahorroIngreso)} de tus ingresos (recomendado: ≥10%). ` +
          `Un ajuste pequeño y sostenido en gastos fijos puede marcar la diferencia en 6 meses.`,
  },
  {
    key: "fondo_emergencia",
    category: "ahorro",
    title: "Construye un fondo de emergencia",
    description:
      "Antes de invertir, conviene tener 3-6 meses de gastos guardados en un instrumento líquido para cubrir imprevistos sin recurrir a deuda.",
    priority: 60,
    matches: (r) => nivelMin(r.nivel, 0) && nivelMax(r.nivel, 1),
  },
  {
    key: "mantener_ahorro",
    category: "ahorro",
    title: "Sigue construyendo tu ahorro",
    description:
      "Tu tasa de ahorro es razonable pero aún tiene espacio para crecer hacia el 20% recomendado de tus ingresos.",
    priority: 40,
    matches: (r) => r.ratios.ahorroIngreso >= 0.1 && r.ratios.ahorroIngreso < 0.2,
    describe: (r) =>
      `Tu tasa de ahorro es ${pct(r.ratios.ahorroIngreso)}: vas bien y aún tienes espacio para crecer ` +
      `hacia el 20% recomendado de tus ingresos.`,
  },
  {
    key: "diversificar_inversion",
    category: "inversion",
    title: "Diversifica tus inversiones",
    description:
      "Tu salud financiera es sólida. Es buen momento para distribuir tus ahorros en más de un instrumento y no concentrar el riesgo.",
    priority: 50,
    matches: (r) => nivelMin(r.nivel, 3),
  },
  {
    key: "mantener_buen_habito",
    category: "ahorro",
    title: "Mantén tu disciplina financiera",
    description:
      "Tu ratio de deuda es bajo y tu ahorro es saludable. Mantener estos hábitos es lo que te permite seguir subiendo de nivel.",
    priority: 30,
    matches: (r) =>
      nivelMin(r.nivel, 2) && r.ratios.deudaFlujo <= 0.3 && r.ratios.ahorroIngreso >= 0.2,
  },
];

export const HABIT_KEYS = new Set(HABIT_CATALOG.map((h) => h.key));
