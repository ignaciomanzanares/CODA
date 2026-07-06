/**
 * Evaluación de salud financiera a partir de los datos persistidos del usuario.
 *
 * Centraliza la derivación (cartola + CMF + activos → ratios → nivel) que antes vivía
 * inline en `routes-health-evaluation.ts`, para que TANTO esa ruta COMO el motor de
 * recomendaciones de producto (`/api/products/recommendations`, #25) usen exactamente
 * la misma lógica y no se desincronicen.
 */

import { eq } from 'drizzle-orm';
import { db, userAssets } from '../../db/index.js';
import { storage } from '../../storage.js';
import { logger } from '../../logger.js';
import { deriveHealthInput } from './ratiosDerivation.js';
import { evaluateHealthV2 } from './evaluationEngine.js';
import type { HealthEvaluationResult } from './types.js';
import type { UserAsset } from '../assets/types.js';
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

/**
 * Evalúa la salud financiera del usuario con sus datos persistidos. Devuelve `null`
 * cuando faltan los insumos mínimos (cartola o CMF) — el llamador decide el fallback
 * (en recomendaciones, simplemente no se aplica el sesgo por salud).
 *
 * No persiste trazabilidad (la ruta `/api/health-evaluation/me` lo hace en su propio
 * flujo). Esta función es de solo-lectura, pensada para enriquecer otras decisiones.
 */
export async function evaluateUserHealth(userId: string): Promise<HealthEvaluationResult | null> {
  try {
    const [credit, txScore, cartolas, cmfDocsNew, cmfDocsLegacy] = await Promise.all([
      storage.getCreditScore(userId),
      storage.getTransactionalScore(userId),
      storage.listDocumentUploadsByType(userId, 'cartola'),
      storage.listDocumentUploadsByType(userId, 'cmf'),
      storage.listDocumentUploadsByType(userId, 'cmf_informe_deudas'),
    ]);

    const cmfDocs = [...cmfDocsNew, ...cmfDocsLegacy].sort(
      (a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime(),
    );
    if (cartolas.length === 0 || cmfDocs.length === 0) return null;

    const latestCartola = cartolas[0] as any;
    const pd = latestCartola?.parsedData as {
      transacciones?: Array<{ tipo?: string; monto?: number; abono?: number; cargo?: number }>;
    } | null;
    let totalIngresos = 0;
    let totalGastos = 0;
    for (const t of pd?.transacciones ?? []) {
      if (t.tipo === 'abono' && typeof t.monto === 'number') totalIngresos += t.monto;
      else if (t.tipo === 'cargo' && typeof t.monto === 'number') totalGastos += t.monto;
      else {
        totalIngresos += t.abono ?? 0;
        totalGastos += t.cargo ?? 0;
      }
    }

    const rawCmfData = (cmfDocs[0] as any)?.parsedData;
    if (!rawCmfData) return null;
    const cmfData = normalizeCmfData(rawCmfData);

    const assetRows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));
    const assets: UserAsset[] = assetRows.map((row: any) => ({
      id: row.id, userId: row.userId, type: row.type, name: row.name,
      acquisitionCostClp: row.acquisitionCostClp, estimatedValueClp: row.estimatedValueClp ?? null,
      hasLien: row.hasLien === 1 || row.hasLien === true, lienAmountClp: row.lienAmountClp ?? null,
      currency: row.currency, documentId: row.documentId ?? null,
      notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    }));

    // Ajustes de fuentes gov conectadas (#Fase5): la deuda fiscal (TGR) suma a la deuda total, lo
    // que endurece correctamente los ratios deuda/flujo y deuda/activos. El ingreso verificado
    // (SII/AFP) se persiste y se muestra en la UI, pero no reemplaza el ingreso de cartola aquí
    // para no romper la coherencia ingreso–gasto del cálculo de ahorro.
    const { getGovSourceAdjustments } = await import('../dataSources/govSourceService.js');
    const govAdj = await getGovSourceAdjustments(userId).catch(() => ({ fiscalDebtClp: 0, verifiedMonthlyIncomeClp: null }));

    const deudaTotalClp: number = (cmfData.deuda_total ?? 0) + (govAdj.fiscalDebtClp ?? 0);
    const deudaMensualClp = estimarCuotaMensual(cmfData, deudaTotalClp);
    const sfaAvg = txScore?.metrics?.averageMonthlyBalanceClp ?? undefined;

    const healthInput = deriveHealthInput({
      ingresoMensualClp: totalIngresos,
      deudaMensualClp,
      deudaTotalClp,
      ahorroMensualClp: totalIngresos - totalGastos,
      cmf: cmfData,
      sfaAvgMonthlyBalanceClp: sfaAvg,
      userAssets: assets,
    });

    return evaluateHealthV2(healthInput, {
      creditScore: credit?.score ?? 0,
      transactionalScore: txScore?.transactionalScore ?? 0,
      monthlyIncome: totalIngresos,
      monthlyDebt: deudaMensualClp,
    });
  } catch (e) {
    logger.warn({ err: e, userId }, '[userHealthService] evaluateUserHealth failed (non-fatal)');
    return null;
  }
}
