/**
 * R1 (increment 2) — Traza auditable POR EVALUACIÓN del motor de salud v2.
 *
 * `explainHealthV2(input)` reconstruye, paso a paso, cómo se llegó al nivel: cada variable, el
 * corte aplicado y su contribución al score compuesto. Es la respuesta a "¿por qué este usuario
 * quedó en este nivel?" — defensa regulatoria (NCG 502 / discriminación indirecta) y material de
 * la tesis. Lee del mismo scorecard que el motor; un test cruzado garantiza que no haya drift
 * respecto de `evaluateHealthV2`.
 */

import { HEALTH_V2_SCORECARD as SC } from "./healthScorecard.config.js";
import type { HealthEvaluationInput } from "./types.js";

export interface HealthAuditStep {
  variable: string;
  value: number | boolean;
  /** Corte comparado (si aplica). */
  cut?: number;
  /** ¿Cruzó el corte? */
  triggered?: boolean;
  /** Peso de la variable en su score. */
  weight?: number;
  /** Valor normalizado 0–100 (si aplica). */
  normalized?: number;
  /** Aporte al score (positivo suma, negativo resta). */
  contribution?: number;
  note: string;
}

export interface HealthAudit {
  version: string;
  stage: "critica" | "intermedia";
  steps: HealthAuditStep[];
  scoreRatios: number;
  scoreInterno: number;
  scoreCompuesto: number;
  nivelBruto: number;
  nivel: number;
  moraPenaltyApplied: boolean;
  salida: "ahorro_inversion" | "refinanciamiento" | "reestructuracion" | "concursal";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function mapScoreToLevel(score: number): number {
  const { segmentSize, levelOffset, levelMin, levelMax } = SC.composite;
  return clamp(Math.floor(score / segmentSize) + levelOffset, levelMin, levelMax);
}

export function explainHealthV2(input: HealthEvaluationInput): HealthAudit {
  const {
    deudaFlujo,
    deudaActivos,
    ahorroIngreso,
    moraActiva,
    historialCmfRaw,
    antiguedadMeses,
    tiposCredito,
  } = input;
  const steps: HealthAuditStep[] = [];

  // ── Etapa 1: zona crítica ──
  const critFlujo = deudaFlujo > SC.criticalZone.deudaFlujoMax;
  const critActivos = deudaActivos > SC.criticalZone.deudaActivosMax;
  if (critFlujo && critActivos) {
    const nivel = moraActiva ? -2 : -1;
    steps.push({
      variable: "Deuda/Flujo",
      value: deudaFlujo,
      cut: SC.criticalZone.deudaFlujoMax,
      triggered: true,
      note: "Sobre el corte crítico de carga de deuda.",
    });
    steps.push({
      variable: "Deuda/Patrimonio",
      value: deudaActivos,
      cut: SC.criticalZone.deudaActivosMax,
      triggered: true,
      note: "Sobre el corte crítico de apalancamiento.",
    });
    steps.push({
      variable: "Mora activa",
      value: moraActiva,
      note: moraActiva
        ? "Con mora → salida concursal, nivel -2."
        : "Sin mora → reestructuración, nivel -1.",
    });
    return {
      version: SC.version,
      stage: "critica",
      steps,
      scoreRatios: 0,
      scoreInterno: 0,
      scoreCompuesto: 0,
      nivelBruto: nivel,
      nivel,
      moraPenaltyApplied: false,
      salida: moraActiva ? "concursal" : "reestructuracion",
    };
  }

  // ── Etapa 2: score compuesto ──
  const rw = SC.ratiosScore.weights;
  const iw = SC.internalScore.weights;

  const deudaFlujoNorm = clamp(deudaFlujo, 0, 1) * 100;
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

  const histNorm = clamp(historialCmfRaw / SC.internalScore.historialMax, 0, 1) * 100;
  const antNorm = clamp(antiguedadMeses / SC.internalScore.antiguedadTopeMeses, 0, 1) * 100;
  const divNorm = SC.internalScore.diversificacionLookup[clamp(tiposCredito, 0, 3)] ?? 100;
  const scoreInterno =
    histNorm * iw.historial + antNorm * iw.antiguedad + divNorm * iw.diversificacion;

  const scoreCompuesto =
    scoreRatios * SC.composite.ratiosWeight + scoreInterno * SC.composite.internoWeight;
  const nivelBruto = mapScoreToLevel(scoreCompuesto);
  const nivel = moraActiva
    ? Math.max(SC.composite.levelMin, nivelBruto - SC.moraPenaltyLevels)
    : nivelBruto;

  steps.push(
    {
      variable: "Deuda/Flujo",
      value: deudaFlujo,
      weight: rw.deudaFlujo,
      normalized: round1(deudaFlujoNorm),
      contribution: round1(-deudaFlujoNorm * rw.deudaFlujo),
      note: "Resta del score de ratios (más deuda/flujo = peor).",
    },
    {
      variable: "Deuda/Patrimonio",
      value: deudaActivos,
      weight: rw.deudaActivos,
      normalized: round1(deudaActivosNorm),
      contribution: round1(-deudaActivosNorm * rw.deudaActivos),
      note: "Resta del score de ratios (más apalancamiento = peor).",
    },
    {
      variable: "Ahorro/Ingreso",
      value: ahorroIngreso,
      weight: rw.ahorro,
      normalized: round1(penalizacionAhorro),
      contribution: round1(-penalizacionAhorro * rw.ahorro),
      note: `Penaliza ahorrar bajo el objetivo (${ahorroTarget * 100}%).`,
    },
    {
      variable: "Historial CMF",
      value: historialCmfRaw,
      weight: iw.historial,
      normalized: round1(histNorm),
      contribution: round1(histNorm * iw.historial),
      note: "Suma al score interno.",
    },
    {
      variable: "Antigüedad",
      value: antiguedadMeses,
      weight: iw.antiguedad,
      normalized: round1(antNorm),
      contribution: round1(antNorm * iw.antiguedad),
      note: "Suma al score interno (proxy — ver supuestos).",
    },
    {
      variable: "Diversificación",
      value: tiposCredito,
      weight: iw.diversificacion,
      normalized: round1(divNorm),
      contribution: round1(divNorm * iw.diversificacion),
      note: "Suma al score interno.",
    },
    {
      variable: "Mora activa",
      value: moraActiva,
      triggered: moraActiva,
      note: moraActiva
        ? `Baja el nivel en ${SC.moraPenaltyLevels} escalones.`
        : "Sin mora, sin penalización.",
    },
  );

  let salida: HealthAudit["salida"];
  if (nivel >= SC.salidaThresholds.ahorroInversionMinNivel) salida = "ahorro_inversion";
  else if (nivel >= SC.salidaThresholds.refinanciamientoMinNivel) salida = "refinanciamiento";
  else salida = "reestructuracion";

  return {
    version: SC.version,
    stage: "intermedia",
    steps,
    scoreRatios: round1(scoreRatios),
    scoreInterno: round1(scoreInterno),
    scoreCompuesto: round1(scoreCompuesto),
    nivelBruto,
    nivel,
    moraPenaltyApplied: moraActiva,
    salida,
  };
}
