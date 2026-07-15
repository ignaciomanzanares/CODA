import type { HealthEvaluationResult } from "../healthEvaluation/types.js";
import type { CMFParseResult } from "../../parsers/cmf-parser.js";

/** Versión del motor de reglas (trazabilidad CMF / NCG 502). */
export const DEBT_RULES_ENGINE_VERSION = "v1.0.0";

/** Las 3 familias de reglas de optimización de deuda. */
export type DebtRuleFamily = "reduccion_deuda" | "comportamiento" | "ahorro_capacidad";

export const FAMILY_LABELS: Record<DebtRuleFamily, string> = {
  reduccion_deuda: "Reducción y reestructuración de deuda",
  comportamiento: "Mejora de comportamiento y score",
  ahorro_capacidad: "Ahorro y capacidad de pago",
};

/**
 * Contexto que evalúan las reglas. `health` y `cmf` siempre están presentes cuando se evalúa
 * (evaluateUserHealth requiere cartola + CMF, así que si hay salud hay CMF). `creditScore` puede
 * ser null si no se ha calculado aún.
 */
export interface DebtRuleContext {
  health: HealthEvaluationResult;
  cmf: CMFParseResult;
  creditScore: number | null;
  /** Cantidad de tipos de crédito distintos en la deuda directa (diversidad de cartera). */
  tiposCredito: number;
}

export interface DebtRule {
  key: string;
  familia: DebtRuleFamily;
  titulo: string;
  /** Mayor prioridad = se muestra primero cuando varias reglas matchean. */
  prioridad: number;
  /** True si la regla aplica a la situación del usuario. */
  matches: (ctx: DebtRuleContext) => boolean;
  /** Descripción con los números reales del usuario (su ratio, su deuda, sus días de mora). */
  describe: (ctx: DebtRuleContext) => string;
  /** Acción concreta que el usuario puede tomar. */
  accion: string;
  /** Qué componente del score crediticio / nivel de salud mejora al aplicar la regla. */
  impacto: string;
}

export interface DebtRuleRecommendation {
  key: string;
  familia: DebtRuleFamily;
  familiaLabel: string;
  titulo: string;
  descripcion: string;
  accion: string;
  impacto: string;
  prioridad: number;
}
