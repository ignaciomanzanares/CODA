/**
 * Fuente ÚNICA del input del motor de salud v2 para un usuario.
 *
 * Antes existían dos derivaciones distintas del mismo input: la ruta
 * `/api/health-evaluation/me` (número que ve el usuario) armaba ingreso/gasto desde las
 * transacciones normalizadas del último mes excluyendo transferencias internas, mientras
 * que `explainUserHealth` (la traza "¿por qué este nivel?") los tomaba del profile de riesgo,
 * con otra agregación. Resultado: el titular y su explicación no coincidían (p. ej. 47/100 vs
 * 39/100). Esto centraliza la derivación para que el número y su auditoría salgan SIEMPRE del
 * mismo input — que es justo lo que R1 promete.
 */

import { eq } from "drizzle-orm";
import { db, userAssets } from "../../db/index.js";
import { storage } from "../../storage.js";
import type { UserAsset } from "../assets/types.js";
import { deriveHealthInput } from "./ratiosDerivation.js";
import { estimarCuotaMensual, normalizeCmfData } from "../risk/cmfDerivation.js";
import type { HealthEvaluationInput } from "./types.js";

export interface ResolvedHealthInput {
  healthInput: HealthEvaluationInput;
  scoringContext: {
    creditScore: number;
    transactionalScore: number;
    monthlyIncome: number;
    monthlyDebt: number;
  };
  /** Totales del último mes con datos (para respuestas/telemetría del caller). */
  totals: { ingresos: number; gastos: number };
}

/**
 * Resuelve el input del motor de salud v2 desde los datos persistidos del usuario. Devuelve
 * `null` si faltan los insumos mínimos (cartola con transacciones o informe CMF parseable).
 */
export async function resolveHealthInputForUser(
  userId: string,
): Promise<ResolvedHealthInput | null> {
  // CMF: buscar ambos tipos — 'cmf' (parser nuevo) y 'cmf_informe_deudas' (parser antiguo).
  const [credit, txScore, cartolas, cmfDocsNew, cmfDocsLegacy] = await Promise.all([
    storage.getCreditScore(userId),
    storage.getTransactionalScore(userId),
    storage.listDocumentUploadsByType(userId, "cartola"),
    storage.listDocumentUploadsByType(userId, "cmf"),
    storage.listDocumentUploadsByType(userId, "cmf_informe_deudas"),
  ]);
  const cmfDocs = [...cmfDocsNew, ...cmfDocsLegacy].sort(
    (a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime(),
  );

  if (cartolas.length === 0 || cmfDocs.length === 0) return null;

  const latestCmf = cmfDocs[0] as { parsedData?: unknown };
  const rawCmfData = latestCmf?.parsedData;
  if (!rawCmfData) return null;
  const cmfData = normalizeCmfData(rawCmfData);

  // Ingreso/gasto del último mes con datos, desde la tabla `transactions` (fuente de verdad),
  // excluyendo transferencias internas — mismo predicado que el resto de las métricas de salud.
  const { getUserNormalizedTransactions } = await import("../normalizedTransactions.js");
  const { isInternalTransferTx } = await import("../assistantContext.js");
  const { transactions: normTxs } = await getUserNormalizedTransactions(userId);
  const latestMonth = normTxs.reduce((m, t) => (t.month > m ? t.month : m), "");
  let totalIngresos = 0;
  let totalGastos = 0;
  for (const t of normTxs) {
    if (t.month !== latestMonth) continue;
    if (isInternalTransferTx(t)) continue;
    totalIngresos += t.abono;
    totalGastos += t.cargo;
  }

  // Activos declarados del usuario.
  const assetRows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));
  const assets: UserAsset[] = assetRows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.userId as string,
    type: row.type as UserAsset["type"],
    name: row.name as string,
    acquisitionCostClp: row.acquisitionCostClp as number,
    estimatedValueClp: (row.estimatedValueClp as number | null) ?? null,
    hasLien: row.hasLien === 1 || row.hasLien === true,
    lienAmountClp: (row.lienAmountClp as number | null) ?? null,
    currency: row.currency as UserAsset["currency"],
    documentId: (row.documentId as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.createdAt as UserAsset["createdAt"],
    updatedAt: row.updatedAt as UserAsset["updatedAt"],
  }));

  const deudaTotalClp: number = cmfData.deuda_total ?? 0;
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

  return {
    healthInput,
    scoringContext: {
      creditScore: credit?.score ?? 0,
      transactionalScore: txScore?.transactionalScore ?? 0,
      monthlyIncome: totalIngresos,
      monthlyDebt: deudaMensualClp,
    },
    totals: { ingresos: totalIngresos, gastos: totalGastos },
  };
}
