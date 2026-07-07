/**
 * Score crediticio estilo 0–850 combinando CMF + cartola.
 */

import type { CMFParseResult } from "../parsers/cmf-parser.js";
import type { CartolaParseResult } from "../parsers/cartola-parser.js";
import type { TransactionalScoreResult } from "./transactional-score.js";

export interface CreditScoreResult {
  score: number;
  maxScore: 850;
  categoria: string;
  componentes: {
    historial_cmf: number;
    endeudamiento: number;
    comportamiento_transaccional: number;
    capacidad_pago: number;
  };
  descripcion_categoria: string;
  /** Solo ingreso CMF: score usa solo historial + endeudamiento (reponderado a 0–850). */
  solo_cmf?: boolean;
}

/** Perfil CMF conservador si el usuario no subió certificado: sin deuda, score_cmf interno 85. */
export function conservativeCmfPlaceholder(): CMFParseResult {
  const z = new Date(0);
  return {
    titular: "",
    rut: "",
    fecha_emision: z,
    fecha_actualizacion: z,
    deuda_total: 0,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      tiene_deuda: false,
      porcentaje_al_dia: 0,
      porcentaje_en_atraso: 0,
      tiene_atraso_grave: false,
      score_cmf: 85,
      credito_disponible_total: 0,
    },
  };
}

/** Ingreso mensual proxy solo con CMF (ratio deuda/ingreso cuando no hay cartola). */
function ingresoMensualSinCartola(cmf: CMFParseResult): number {
  if (cmf.deuda_total <= 0) return 1;
  return Math.max(1, Math.round(cmf.deuda_total / 12));
}

/**
 * Score crediticio solo con CMF: componentes transaccional y capacidad de pago no aplican (0).
 * El total reescala historial + endeudamiento al rango 0–850.
 */
export function calculateCreditScoreCmfOnly(cmf: CMFParseResult): CreditScoreResult {
  const h = historialCmfPoints(cmf);
  const e = endeudamientoPoints(cmf, ingresoMensualSinCartola(cmf));
  const raw = h * 0.35 + e * 0.3;
  const maxRaw = 850 * 0.35 + 850 * 0.3;
  const score = Math.round((raw / maxRaw) * 850);
  const final = Math.max(0, Math.min(850, score));
  const cat = categoriaFromScore(final);
  return {
    score: final,
    maxScore: 850,
    categoria: cat.label,
    componentes: {
      historial_cmf: Math.round(h),
      endeudamiento: Math.round(e),
      comportamiento_transaccional: 0,
      capacidad_pago: 0,
    },
    descripcion_categoria: cat.desc,
    solo_cmf: true,
  };
}

export const CATEGORIAS: Array<{ min: number; label: string; desc: string }> = [
  { min: 750, label: "Excelente", desc: "Acceso a mejores tasas del mercado" },
  { min: 650, label: "Muy bueno", desc: "Condiciones favorables de crédito" },
  { min: 550, label: "Bueno", desc: "Acceso normal a productos financieros" },
  { min: 450, label: "Regular", desc: "Algunas restricciones posibles" },
  { min: 350, label: "En riesgo", desc: "Dificultad para obtener crédito" },
  { min: 0, label: "Crítico", desc: "Alto riesgo crediticio" },
];

export function categoriaFromScore(score: number): { label: string; desc: string } {
  for (const c of CATEGORIAS) {
    if (score >= c.min) return { label: c.label, desc: c.desc };
  }
  return CATEGORIAS[CATEGORIAS.length - 1]!;
}

function sumAtrasos(cmf: CMFParseResult): { a30: number; a60: number; a90: number } {
  let a30 = 0;
  let a60 = 0;
  let a90 = 0;
  for (const r of cmf.deuda_directa) {
    a30 += r.atraso_30_59;
    a60 += r.atraso_60_89;
    a90 += r.atraso_90_mas;
  }
  for (const r of cmf.deuda_indirecta) {
    a30 += r.atraso_30_59;
    a60 += r.atraso_60_89;
    a90 += r.atraso_90_mas;
  }
  return { a30, a60, a90 };
}

function historialCmfPoints(cmf: CMFParseResult): number {
  if (!cmf.metricas.tiene_deuda) return 700;
  const { a30, a60, a90 } = sumAtrasos(cmf);
  let base = 820;
  if (a90 > 0) base -= 300;
  else if (a60 > 0) base -= 200;
  else if (a30 > 0) base -= 100;
  return Math.max(300, Math.min(850, base));
}

function endeudamientoPoints(cmf: CMFParseResult, ingresoMensual: number): number {
  const deuda = cmf.deuda_total;
  if (deuda <= 0) return 850;
  const annualIncome = Math.max(1, ingresoMensual) * 12;
  const ratio = deuda / annualIncome;
  if (ratio < 0.3) return 750 + Math.min(99, (0.3 - ratio) / 0.3 * 99);
  if (ratio <= 0.5) return 600 + ((0.5 - ratio) / 0.2) * 149;
  if (ratio <= 0.8) return 400 + ((0.8 - ratio) / 0.3) * 199;
  return Math.max(0, Math.min(399, 400 - ratio * 200));
}

/** Mapea score transaccional 0–100 a escala 0–850 (peso 20% del total final). */
function comportamientoPoints850(txScore: number): number {
  return (txScore / 100) * 850;
}

/** Capacidad de pago en escala 0–850 (referencia interna 0–127 → 850). */
function capacidadPagoPoints850(cartola: CartolaParseResult): number {
  const abonos = cartola.transacciones.filter((t) => t.tipo === "abono").reduce((s, t) => s + t.monto, 0);
  const cargosFijos = cartola.transacciones
    .filter((t) => t.tipo === "cargo" && t.es_pago_recurrente)
    .reduce((s, t) => s + t.monto, 0);
  const neto = abonos - cargosFijos;
  let inner = 20;
  if (neto > abonos * 0.1) inner = 127;
  else if (neto > 0) inner = 100;
  else if (neto > -abonos * 0.2) inner = 70;
  return (inner / 127) * 850;
}

/**
 * Combina CMF + cartola + score transaccional ya calculado (0–100).
 */
export function calculateCreditScore(
  cmf: CMFParseResult,
  cartola: CartolaParseResult,
  transactional: TransactionalScoreResult
): CreditScoreResult {
  const sumAbonos = cartola.transacciones
    .filter((t) => t.tipo === "abono")
    .reduce((s, t) => s + t.monto, 0);
  const ingresoMensual = sumAbonos * (30 / Math.max(1, cartola.periodo.dias));

  const h = historialCmfPoints(cmf);
  const e = endeudamientoPoints(cmf, ingresoMensual);
  const c850 = comportamientoPoints850(transactional.score);
  const p850 = capacidadPagoPoints850(cartola);

  const score = Math.round(h * 0.35 + e * 0.3 + c850 * 0.2 + p850 * 0.15);

  const final = Math.max(0, Math.min(850, score));
  const cat = categoriaFromScore(final);

  return {
    score: final,
    maxScore: 850,
    categoria: cat.label,
    componentes: {
      historial_cmf: Math.round(h),
      endeudamiento: Math.round(e),
      comportamiento_transaccional: Math.round(c850),
      capacidad_pago: Math.round(p850),
    },
    descripcion_categoria: cat.desc,
    solo_cmf: false,
  };
}
