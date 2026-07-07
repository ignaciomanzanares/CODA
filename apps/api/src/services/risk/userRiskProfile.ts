/**
 * Feature store unificado del usuario (Fase A del doble evaluador de riesgo).
 *
 * Carga UNA sola vez todos los datos/ratios del usuario (transaccionales, CMF, gov, activos,
 * flujos de cartola) y los expone en un solo objeto. TODO consumidor de riesgo/salud/reglas lo usa:
 *  - los dos scores de riesgo (tradicional logístico + transaccional XGB),
 *  - el motor de salud −2..+5 (`evaluateUserHealth`),
 *  - las 12 reglas de deuda / recomendaciones (`buildDebtRuleContext`).
 * Ningún dato es "dueño" de un modelo: cada evaluador toma el subset que le sirve.
 */
import { eq } from 'drizzle-orm';
import { db, userAssets } from '../../db/index.js';
import { storage } from '../../storage.js';
import { logger } from '../../logger.js';
import { buildUserFeatureVector, type FeatureVector } from '../../ml/features.js';
import { getGovSourceAdjustments } from '../dataSources/govSourceService.js';
import { normalizeCmfData, deriveCmfFeatures, type CmfFeatures } from './cmfDerivation.js';
import type { CMFParseResult } from '../../parsers/cmf-parser.js';
import type { UserAsset } from '../assets/types.js';
import type { Transaction } from '../../schema.js';

export interface UserRiskProfile {
  userId: string;
  /** Vector transaccional (19 features) para el modelo XGB Berka. */
  transactional: FeatureVector;
  /** CMF normalizado + features derivadas (para scorecard tradicional, salud y reglas). */
  cmf: { raw: CMFParseResult; features: CmfFeatures } | null;
  /** Ajustes de fuentes gov conectadas (SII/AFP/TGR). */
  gov: { fiscalDebtClp: number | null; verifiedMonthlyIncomeClp: number | null };
  /** Flujos de la última cartola (para el cálculo de salud/ahorro). */
  cartola: { ingresos: number; gastos: number } | null;
  assets: UserAsset[];
  /** Scores ya persistidos (para trazabilidad/UI; NO son la fuente de verdad nueva). */
  storedScores: { creditScore: number | null; transactionalScore: number | null; txMetrics: any };
  meta: {
    hasCmfHistory: boolean;
    hasCartola: boolean;
    /** Nº de meses distintos con transacciones observadas (últimos 365 días). */
    transactionMonths: number;
    /** Ingreso mensual de referencia (cartola > gov verificado > proxy CMF). */
    ingresoMensualClp: number;
    /** Deuda total ajustada (CMF + deuda fiscal TGR). */
    deudaTotalClp: number;
  };
}

/** Cuenta meses distintos (YYYY-MM) con transacciones en los últimos `days` días. */
async function countTransactionMonths(accountIds: number[], days = 365): Promise<number> {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  const months = new Set<string>();
  for (const accId of accountIds) {
    const part = await storage.getTransactions(accId, { from, to, limit: undefined, offset: undefined });
    for (const t of part as Transaction[]) {
      if (t?.postedAt) months.add(new Date(t.postedAt).toISOString().slice(0, 7));
    }
  }
  return months.size;
}

/**
 * Ensambla el profile del usuario. Nunca lanza: si algo falta, ese trozo queda `null`/vacío y los
 * flags de `meta` lo indican (cada evaluador decide qué puede computar). Devuelve `null` solo si el
 * usuario no tiene ninguna cuenta ni documento (nada que evaluar).
 */
export async function buildUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
  try {
    const accounts = await storage.getAccounts(userId);
    const accountIds = accounts.filter((a: any) => a != null).map((a: any) => a.id as number);

    const [transactional, credit, txScore, cartolas, cmfDocsNew, cmfDocsLegacy, assetRows, gov, transactionMonths] =
      await Promise.all([
        buildUserFeatureVector(userId).catch(() => null),
        storage.getCreditScore(userId).catch(() => null),
        storage.getTransactionalScore(userId).catch(() => null),
        storage.listDocumentUploadsByType(userId, 'cartola').catch(() => []),
        storage.listDocumentUploadsByType(userId, 'cmf').catch(() => []),
        storage.listDocumentUploadsByType(userId, 'cmf_informe_deudas').catch(() => []),
        db.select().from(userAssets).where(eq(userAssets.userId, userId)).catch(() => []),
        getGovSourceAdjustments(userId).catch(() => ({ fiscalDebtClp: 0, verifiedMonthlyIncomeClp: null })),
        countTransactionMonths(accountIds).catch(() => 0),
      ]);

    // --- Cartola: flujos de la más reciente ---
    let cartola: { ingresos: number; gastos: number } | null = null;
    if (cartolas.length > 0) {
      const pd = (cartolas[0] as any)?.parsedData as {
        transacciones?: Array<{ tipo?: string; monto?: number; abono?: number; cargo?: number }>;
      } | null;
      let ingresos = 0;
      let gastos = 0;
      for (const t of pd?.transacciones ?? []) {
        if (t.tipo === 'abono' && typeof t.monto === 'number') ingresos += t.monto;
        else if (t.tipo === 'cargo' && typeof t.monto === 'number') gastos += t.monto;
        else {
          ingresos += t.abono ?? 0;
          gastos += t.cargo ?? 0;
        }
      }
      cartola = { ingresos, gastos };
    }

    // --- CMF: más reciente, normalizado + features ---
    const cmfDocs = [...cmfDocsNew, ...cmfDocsLegacy].sort(
      (a: any, b: any) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime(),
    );
    const rawCmf = cmfDocs.length > 0 ? (cmfDocs[0] as any)?.parsedData : null;
    const cmfRaw = rawCmf ? normalizeCmfData(rawCmf) : null;

    // Ingreso mensual de referencia: cartola > gov verificado > proxy CMF (deuda/12).
    const govIncome = gov.verifiedMonthlyIncomeClp ?? null;
    const ingresoMensualClp =
      cartola?.ingresos && cartola.ingresos > 0
        ? cartola.ingresos
        : govIncome && govIncome > 0
          ? govIncome
          : cmfRaw && cmfRaw.deuda_total > 0
            ? Math.max(1, Math.round(cmfRaw.deuda_total / 12))
            : 0;

    const deudaTotalClp = (cmfRaw?.deuda_total ?? 0) + (gov.fiscalDebtClp ?? 0);
    const cmf = cmfRaw
      ? { raw: cmfRaw, features: deriveCmfFeatures(cmfRaw, ingresoMensualClp, deudaTotalClp) }
      : null;

    const assets: UserAsset[] = (assetRows as any[]).map((row: any) => ({
      id: row.id, userId: row.userId, type: row.type, name: row.name,
      acquisitionCostClp: row.acquisitionCostClp, estimatedValueClp: row.estimatedValueClp ?? null,
      hasLien: row.hasLien === 1 || row.hasLien === true, lienAmountClp: row.lienAmountClp ?? null,
      currency: row.currency, documentId: row.documentId ?? null,
      notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    }));

    if (!transactional && cartola == null && cmf == null && assets.length === 0) return null;

    return {
      userId,
      transactional: transactional ?? emptyFeatureVector(),
      cmf,
      gov: { fiscalDebtClp: gov.fiscalDebtClp ?? null, verifiedMonthlyIncomeClp: gov.verifiedMonthlyIncomeClp ?? null },
      cartola,
      assets,
      storedScores: {
        creditScore: credit?.score ?? null,
        transactionalScore: txScore?.transactionalScore ?? null,
        txMetrics: txScore?.metrics ?? null,
      },
      meta: {
        hasCmfHistory: cmf != null,
        hasCartola: cartola != null,
        transactionMonths,
        ingresoMensualClp,
        deudaTotalClp,
      },
    };
  } catch (e) {
    logger.warn({ err: e, userId }, '[userRiskProfile] buildUserRiskProfile failed (non-fatal)');
    return null;
  }
}

/** FeatureVector vacío (todas las features en 0) para usuarios sin transacciones. */
function emptyFeatureVector(): FeatureVector {
  return {
    windowDays: 90, txCount: 0, debitCount: 0, creditCount: 0, totalDebits: 0, totalCredits: 0,
    avgAmount: 0, stdAmount: 0, activeDays: 0, debitCreditRatio: 0, incomeRegularity: 0,
    topCategoryShare: 0, monthlyIncome: 0, monthlyDebits: 0, dti: 0, dtiCapped: 0,
    incomeTrend30_90: 0, netCashflowVolatility: 0, recurringExpenseShare: 0,
    txPerMonth: 0, debitPerMonth: 0, creditPerMonth: 0, activeDaysShare: 0,
  };
}
