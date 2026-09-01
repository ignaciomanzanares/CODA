import type {
  HealthEvaluationInput,
  HealthEvaluationResult,
  HealthLevel,
  HealthSalida,
  HealthZone,
  RecommendedProduct,
} from "./types.js";
import { getTopRecommendations } from "../products/matchingEngine.js";
import type { UserProfile } from "../products/matchingEngine.js";
import { getProductsByCategory } from "../products/productCatalog.js";
import { HEALTH_V2_SCORECARD as SC } from "./healthScorecard.config.js";

export const HEALTH_EVALUATION_ENGINE_VERSION = SC.version;

const NIVEL_NOMBRES: Record<HealthLevel, string> = {
  [-2]: "Insolvencia activa",
  [-1]: "Endeudado",
  [0]: "Sin deudas",
  [1]: "Fondo básico",
  [2]: "Fondo consolidado",
  [3]: "Inversión inicial",
  [4]: "Inversión diversificada",
  [5]: "Independencia financiera",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapScoreToLevel(score: number): HealthLevel {
  // 0–100 en tramos de `segmentSize` → levelMin..levelMax (ver scorecard).
  const { segmentSize, levelOffset, levelMin, levelMax } = SC.composite;
  const raw = Math.floor(score / segmentSize) + levelOffset;
  return clamp(raw, levelMin, levelMax) as HealthLevel;
}

function buildInsights(
  input: HealthEvaluationInput,
  zona: HealthZone,
  nivel: HealthLevel,
): string[] {
  const insights: string[] = [];

  if (zona === "critica") {
    if (input.moraActiva) {
      insights.push(
        "Tu deuda supera tus activos y tienes pagos en mora. Es momento de buscar asesoría legal.",
      );
    } else {
      insights.push(
        "Tu carga de deuda es estructuralmente alta. Una reestructuración puede ayudarte a recuperar margen.",
      );
    }
    return insights;
  }

  if (input.deudaFlujo > SC.insights.deudaFlujoAlta) {
    insights.push(
      `Más del 50% de tu flujo mensual va a deuda (${Math.round(input.deudaFlujo * 100)}%). Reducir esa carga debería ser prioridad.`,
    );
  } else if (input.deudaFlujo > SC.insights.deudaFlujoAlerta) {
    insights.push(
      `Tu ratio deuda/flujo es ${Math.round(input.deudaFlujo * 100)}%. Estás en zona de alerta — considera reducir gastos fijos.`,
    );
  }

  if (input.ahorroIngreso < SC.insights.ahorroBajo) {
    insights.push(
      "Estás ahorrando menos del 10% de tus ingresos. Un pequeño ajuste en gastos puede marcar la diferencia.",
    );
  } else if (input.ahorroIngreso >= SC.insights.ahorroBueno && nivel >= 1) {
    insights.push(
      `Ahorras el ${Math.round(input.ahorroIngreso * 100)}% de tus ingresos — estás en buen camino para construir patrimonio.`,
    );
  }

  if (nivel >= 3) {
    insights.push(
      "Tu salud financiera es sólida. Es buen momento para diversificar inversiones y hacer crecer tu patrimonio.",
    );
  } else if (nivel >= 1) {
    insights.push(
      "Tienes bases saludables. El siguiente paso es consolidar tu fondo de emergencia antes de invertir.",
    );
  }

  return insights.slice(0, 3);
}

function getProductsForSalida(
  salida: HealthSalida,
  creditScore: number,
  transactionalScore: number,
  monthlyIncome: number,
  monthlyDebt: number,
  financialHealthLevel: HealthLevel,
): RecommendedProduct[] {
  if (salida === "concursal") return [];

  const categoryMap: Record<Exclude<HealthSalida, "concursal">, string> = {
    ahorro_inversion: "savings",
    refinanciamiento: "loans",
    reestructuracion: "loans",
  };

  const category = categoryMap[salida];
  const limit = salida === "reestructuracion" ? 2 : 3;

  const userProfile: UserProfile = {
    userId: "eval",
    creditScore,
    transactionalScore,
    monthlyIncome,
    monthlyDebt,
    financialHealthLevel,
  };

  const matches = getTopRecommendations(getProductsByCategory(category), userProfile, limit);

  return matches.map((m) => ({
    productName: m.product.productName,
    provider: m.product.provider,
    category: m.product.category,
    matchScore: m.matchScore,
    explanation: m.explanation,
  }));
}

export interface EvaluateHealthOptions {
  /** Para filtrado de productos del catálogo */
  creditScore?: number;
  transactionalScore?: number;
  monthlyIncome?: number;
  monthlyDebt?: number;
}

/**
 * Motor de evaluación de salud financiera v2.
 * Etapa 1: clasificación determinística (zona crítica vs intermedia).
 * Etapa 2: score compuesto para zona intermedia → nivel -2..+5.
 */
export function evaluateHealthV2(
  input: HealthEvaluationInput,
  opts: EvaluateHealthOptions = {},
): HealthEvaluationResult {
  const {
    deudaFlujo,
    deudaActivos,
    ahorroIngreso,
    moraActiva,
    diasMora,
    historialCmfRaw,
    antiguedadMeses,
    tiposCredito,
  } = input;

  const ratios = { deudaFlujo, deudaActivos, ahorroIngreso, moraActiva, diasMora };

  // ── Etapa 1: zona crítica ─────────────────────────────────────────────────
  // Regla dura: ambas condiciones deben cumplirse simultáneamente (ver scorecard).
  if (
    deudaFlujo > SC.criticalZone.deudaFlujoMax &&
    deudaActivos > SC.criticalZone.deudaActivosMax
  ) {
    const zona: HealthZone = "critica";
    const salida: HealthSalida = moraActiva ? "concursal" : "reestructuracion";
    const nivel: HealthLevel = moraActiva ? -2 : -1;

    return {
      nivel,
      nivelNombre: NIVEL_NOMBRES[nivel],
      zona,
      salida,
      scoreRatios: 0,
      scoreInterno: 0,
      scoreCompuesto: 0,
      nivelBruto: nivel,
      ratios,
      productos: getProductsForSalida(
        salida,
        opts.creditScore ?? 0,
        opts.transactionalScore ?? 0,
        opts.monthlyIncome ?? 0,
        opts.monthlyDebt ?? 0,
        nivel,
      ),
      insights: buildInsights(input, zona, nivel),
    };
  }

  // ── Etapa 2: zona intermedia — score compuesto ────────────────────────────
  const zona: HealthZone = "intermedia";

  // Normalización a 0-100
  const rw = SC.ratiosScore.weights;
  const deudaFlujoNorm = clamp(deudaFlujo, 0, 1) * 100;
  // deudaActivos: tope natural en 1.0 (100% de activos = deuda). Valores > 1 → sobre-apalancado.
  const deudaActivosNorm = clamp(deudaActivos, 0, 1) * 100;
  const ahorroTarget = SC.ratiosScore.ahorroTarget;
  const penalizacionAhorro = Math.max(0, ((ahorroTarget - ahorroIngreso) / ahorroTarget) * 100);

  const scoreRatios = Math.max(
    0,
    100 -
      (deudaFlujoNorm * rw.deudaFlujo +
        deudaActivosNorm * rw.deudaActivos +
        penalizacionAhorro * rw.ahorro),
  );

  // Score interno
  const iw = SC.internalScore.weights;
  const histNorm = clamp(historialCmfRaw / SC.internalScore.historialMax, 0, 1) * 100;
  const antNorm = clamp(antiguedadMeses / SC.internalScore.antiguedadTopeMeses, 0, 1) * 100;
  const divNorm = SC.internalScore.diversificacionLookup[clamp(tiposCredito, 0, 3)] ?? 100;

  const scoreInterno =
    histNorm * iw.historial + antNorm * iw.antiguedad + divNorm * iw.diversificacion;
  const scoreCompuesto =
    scoreRatios * SC.composite.ratiosWeight + scoreInterno * SC.composite.internoWeight;

  const nivelBruto = mapScoreToLevel(scoreCompuesto);
  const nivel: HealthLevel = moraActiva
    ? (Math.max(SC.composite.levelMin, nivelBruto - SC.moraPenaltyLevels) as HealthLevel)
    : nivelBruto;

  let salida: HealthSalida;
  // Nivel 1 ("Fondo básico") aún corresponde a ordenar/refinanciar deuda antes de invertir:
  // un buen historial CMF puede empujar el score compuesto a nivel 1 pese a ratios de deuda
  // mediocres (deudaFlujo alto + ahorro bajo), así que ahorro_inversión se reserva para
  // nivel ≥ 2 ("Fondo consolidado" en adelante), donde los ratios ya son sanos.
  if (nivel >= SC.salidaThresholds.ahorroInversionMinNivel) {
    salida = "ahorro_inversion";
  } else if (nivel >= SC.salidaThresholds.refinanciamientoMinNivel) {
    salida = "refinanciamiento";
  } else {
    salida = "reestructuracion";
  }

  return {
    nivel,
    nivelNombre: NIVEL_NOMBRES[nivel],
    zona,
    salida,
    scoreRatios: Math.round(scoreRatios * 10) / 10,
    scoreInterno: Math.round(scoreInterno * 10) / 10,
    scoreCompuesto: Math.round(scoreCompuesto * 10) / 10,
    nivelBruto,
    ratios,
    productos: getProductsForSalida(
      salida,
      opts.creditScore ?? 0,
      opts.transactionalScore ?? 0,
      opts.monthlyIncome ?? 0,
      opts.monthlyDebt ?? 0,
      nivel,
    ),
    insights: buildInsights(input, zona, nivel),
  };
}
