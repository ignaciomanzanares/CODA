/**
 * D7 — Reconciliación de ingresos sobre datos REALES del usuario (wiring Opción A).
 *
 * Junta las señales de ingreso disponibles (cartola observada + SII/AFP declaradas) y corre el
 * motor puro `reconcileIncome`. Devuelve confianza por fuente + discrepancias.
 *
 * NO cambia qué ingreso usa el scoring (eso sigue en userRiskProfile con la regla actual). Esto
 * es aditivo: sirve para mostrar banderas (informalidad, no declarado, obsoleto, brecha) e insights,
 * sin mover scores de usuarios reales. Cambiar la base del ingreso al reconciliado es una decisión
 * de modelo posterior (validar con R6 antes de mover scores).
 */

import {
  reconcileIncome,
  type IncomeSignal,
  type ReconciledIncome,
} from "./incomeReconciliation.js";
import { getGovSources } from "../dataSources/govSourceService.js";
import { getUserNormalizedTransactions } from "../normalizedTransactions.js";
import { isInternalTransferTx } from "../assistantContext.js";
import { computeMonthlyHealthMetrics } from "../financialHealthMetrics.js";

export async function getIncomeReconciliationForUser(userId: string): Promise<ReconciledIncome> {
  const signals: IncomeSignal[] = [];

  // Cartola: ingreso mensual observado (excluye transferencias internas).
  const { transactions } = await getUserNormalizedTransactions(userId);
  if (transactions.length > 0) {
    const { monthlyIncome } = computeMonthlyHealthMetrics(transactions, isInternalTransferTx);
    if (monthlyIncome > 0) {
      const latest = transactions.reduce(
        (max, t) => (t.postedAt > max ? t.postedAt : max),
        transactions[0].postedAt,
      );
      signals.push({ source: "cartola", monthlyClp: Math.round(monthlyIncome), asOf: latest });
    }
  }

  // Fuentes gov declaradas (SII / AFP), con su fecha de extracción para la frescura.
  const govs = await getGovSources(userId);
  for (const g of govs) {
    if (
      (g.source === "sii" || g.source === "afp") &&
      g.verifiedMonthlyIncomeClp &&
      g.verifiedMonthlyIncomeClp > 0
    ) {
      signals.push({
        source: g.source,
        monthlyClp: g.verifiedMonthlyIncomeClp,
        asOf: g.extractedAt,
      });
    }
  }

  return reconcileIncome(signals);
}
