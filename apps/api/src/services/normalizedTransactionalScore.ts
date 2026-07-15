/**
 * Adaptador del score transaccional para el endpoint legacy `/api/transactional-score`.
 *
 * Desde la Fase C, el SCORE lo produce el modelo XGB (`risk/transactionalScore.ts`), no el heurístico
 * `sfaScoringEngine` (eliminado). Aquí solo combinamos ese score con métricas FÁCTICAS de ingreso/
 * ahorro derivadas de las transacciones normalizadas. Este endpoint queda subsumido por
 * `/api/risk/evaluation` (Fase D); se conserva la forma que la ruta espera para no romperla.
 */
import { getUserNormalizedTransactions, type NormalizedTx } from "./normalizedTransactions.js";
import { buildUserRiskProfile } from "./risk/userRiskProfile.js";
import { computeTransactionalScore } from "./risk/transactionalScore.js";

export interface NormalizedScoreMetrics {
  transactionCount: number;
  excludedInternalTransferCount: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsRate: number;
  expenseRatio: number;
}

export interface NormalizedTransactionalScoreResult {
  /** Puntaje 0–100 del modelo XGB, o null si no hay señal suficiente. */
  transactionalScore: number | null;
  available: boolean;
  pd?: number;
  band?: string;
  mainInsights: string[];
  recommendedProducts: string[];
  metrics: NormalizedScoreMetrics;
  source: "xgb_berka";
}

/** Métricas fácticas de ingreso/ahorro desde las transacciones normalizadas (sin heurístico). */
export function computeIncomeSavingsMetrics(transactions: NormalizedTx[]): NormalizedScoreMetrics {
  const real = transactions.filter((tx) => !tx.isInternalTransfer);
  const totalIncome = real.reduce((sum, tx) => sum + tx.abono, 0);
  const totalExpenses = real.reduce((sum, tx) => sum + tx.cargo, 0);
  const netBalance = totalIncome - totalExpenses;
  return {
    transactionCount: real.length,
    excludedInternalTransferCount: transactions.length - real.length,
    totalIncome,
    totalExpenses,
    netBalance,
    savingsRate: totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0,
    expenseRatio: totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0,
  };
}

export async function getNormalizedTransactionalScoreForUser(
  userId: string,
): Promise<NormalizedTransactionalScoreResult | null> {
  const { transactions } = await getUserNormalizedTransactions(userId);
  const metrics = computeIncomeSavingsMetrics(transactions);
  if (metrics.transactionCount === 0) return null;

  const profile = await buildUserRiskProfile(userId);
  const tx = profile
    ? await computeTransactionalScore(profile)
    : { available: false as const, isBeta: true as const };

  return {
    transactionalScore: tx.available ? (tx.score ?? null) : null,
    available: tx.available,
    pd: tx.available ? tx.pd : undefined,
    band: tx.available ? tx.band : undefined,
    mainInsights: [],
    recommendedProducts: [],
    metrics,
    source: "xgb_berka",
  };
}
