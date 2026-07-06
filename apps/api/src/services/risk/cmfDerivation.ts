/**
 * Derivación pura de features CMF (sin I/O, sin dependencias de otros servicios) — la usa el
 * feature store unificado (`userRiskProfile.ts`), el motor de salud y el scorecard tradicional.
 *
 * `normalizeCmfData` y `estimarCuotaMensual` vivían en `healthEvaluation/userHealthService.ts`;
 * se movieron aquí para que el profile unificado pueda reusarlas sin ciclo de imports
 * (userHealthService las re-exporta para compatibilidad con callers existentes).
 */
import type { CMFParseResult } from '../../parsers/cmf-parser.js';

/** Plazos típicos (meses) por tipo de crédito en Chile, para estimar la cuota mensual. */
const PLAZOS_MESES: Record<string, number> = {
  vivienda: 300, // ~25 años
  comercial: 60, // ~5 años
  consumo: 36, // ~3 años
  otro: 36,
};

export function estimarCuotaMensual(cmf: CMFParseResult, deudaTotalFallback: number): number {
  if (cmf.deuda_directa.length === 0) return deudaTotalFallback / 36;
  return cmf.deuda_directa.reduce((sum, d) => {
    const plazo = PLAZOS_MESES[d.tipo_credito] ?? 36;
    return sum + d.total / plazo;
  }, 0);
}

/** Normaliza ambos formatos de CMF almacenados en BD a CMFParseResult. */
export function normalizeCmfData(raw: any): CMFParseResult {
  // Formato nuevo: cmf-parser.ts (tiene deuda_total)
  if (typeof raw?.deuda_total === 'number') return raw as CMFParseResult;
  // Formato antiguo: pdfAnalysis.ts (tiene deudaTotalVigente)
  const deudaTotal = raw?.deudaTotalVigente ?? 0;
  return {
    deuda_total: deudaTotal,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      porcentaje_al_dia: deudaTotal === 0 ? 100 : 90,
      score_cmf: deudaTotal === 0 ? 85 : 60,
      tiene_mora: false,
      credito_disponible_total: 0,
      utilizacion_promedio: 0,
    },
  } as unknown as CMFParseResult;
}

/** Suma de operaciones en atraso por bucket (directa + indirecta), señal central del scorecard. */
export function sumAtrasos(cmf: CMFParseResult): { mora30: number; mora60: number; mora90: number } {
  let mora30 = 0;
  let mora60 = 0;
  let mora90 = 0;
  for (const r of [...cmf.deuda_directa, ...cmf.deuda_indirecta]) {
    mora30 += r.atraso_30_59;
    mora60 += r.atraso_60_89;
    mora90 += r.atraso_90_mas;
  }
  return { mora30, mora60, mora90 };
}

/** Features CMF que consumen el scorecard tradicional (Fase B) y las reglas de deuda. */
export interface CmfFeatures {
  mora30: number;
  mora60: number;
  mora90: number;
  /** Deuda total (CMF; el llamador puede sumarle deuda fiscal TGR antes de derivar). */
  deudaTotalClp: number;
  /** deuda total / ingreso anual (proxy DTI). 0 si no hay deuda. */
  deudaIngresoRatio: number;
  /** deuda / (deuda + crédito disponible). 0..1. Proxy de utilización. */
  utilizacion: number;
  /** Nº de tipos de crédito distintos en deuda directa. */
  tiposCredito: number;
  /** score_cmf interno del parser (0..100). */
  scoreCmfInterno: number;
  tieneDeuda: boolean;
}

/**
 * Deriva las features CMF a partir del CMF normalizado + un ingreso mensual de referencia.
 * `deudaTotalClp` puede venir ya ajustado (p. ej. + deuda fiscal TGR) desde el profile.
 */
export function deriveCmfFeatures(cmf: CMFParseResult, ingresoMensualClp: number, deudaTotalClp?: number): CmfFeatures {
  const { mora30, mora60, mora90 } = sumAtrasos(cmf);
  const deuda = deudaTotalClp ?? cmf.deuda_total ?? 0;
  const ingresoAnual = Math.max(1, ingresoMensualClp) * 12;
  const deudaIngresoRatio = deuda > 0 ? deuda / ingresoAnual : 0;
  const disponible = cmf.metricas?.credito_disponible_total ?? 0;
  const utilizacion = deuda + disponible > 0 ? deuda / (deuda + disponible) : 0;
  const tiposCredito = new Set(cmf.deuda_directa.map((d) => d.tipo_credito)).size;
  return {
    mora30,
    mora60,
    mora90,
    deudaTotalClp: deuda,
    deudaIngresoRatio,
    utilizacion,
    tiposCredito,
    scoreCmfInterno: cmf.metricas?.score_cmf ?? 0,
    tieneDeuda: cmf.metricas?.tiene_deuda ?? deuda > 0,
  };
}
