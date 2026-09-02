/**
 * Evaluación de salud financiera a partir de los datos persistidos del usuario.
 *
 * Desde la Fase A del doble evaluador de riesgo, la carga de datos se centralizó en el feature store
 * unificado `services/risk/userRiskProfile.ts`: esta función solo deriva salud desde ese profile, de
 * modo que scores de riesgo, salud y reglas de deuda operen exactamente sobre el mismo subset de datos.
 *
 * No persiste trazabilidad (la ruta `/api/health-evaluation/me` lo hace en su propio flujo). Es de
 * solo-lectura, pensada para enriquecer otras decisiones (recomendaciones, reglas, scores).
 */

import { logger } from "../../logger.js";
import { deriveHealthInput } from "./ratiosDerivation.js";
import { evaluateHealthV2 } from "./evaluationEngine.js";
import { explainHealthV2, type HealthAudit } from "./healthExplain.js";
import type { HealthEvaluationResult } from "./types.js";
import { buildUserRiskProfile, type UserRiskProfile } from "../risk/userRiskProfile.js";

// Re-export para compatibilidad con callers existentes (p. ej. debtRules/context.ts). La
// implementación vive en risk/cmfDerivation.ts para evitar ciclos de import con el profile.
export { normalizeCmfData, estimarCuotaMensual } from "../risk/cmfDerivation.js";
import { estimarCuotaMensual } from "../risk/cmfDerivation.js";

/**
 * Deriva la salud financiera desde un `UserRiskProfile` ya construido. Devuelve `null` si faltan los
 * insumos mínimos (cartola + CMF). Separada para que callers que ya tienen el profile no lo recarguen.
 */
export function evaluateHealthFromProfile(profile: UserRiskProfile): HealthEvaluationResult | null {
  if (!profile.meta.hasCartola || !profile.meta.hasCmfHistory || !profile.cmf || !profile.cartola) {
    return null;
  }
  const cmfData = profile.cmf.raw;
  const totalIngresos = profile.cartola.ingresos;
  const totalGastos = profile.cartola.gastos;
  const deudaTotalClp = profile.meta.deudaTotalClp;
  const deudaMensualClp = estimarCuotaMensual(cmfData, deudaTotalClp);
  const sfaAvg = profile.storedScores.txMetrics?.averageMonthlyBalanceClp ?? undefined;

  const healthInput = deriveHealthInput({
    ingresoMensualClp: totalIngresos,
    deudaMensualClp,
    deudaTotalClp,
    ahorroMensualClp: totalIngresos - totalGastos,
    cmf: cmfData,
    sfaAvgMonthlyBalanceClp: sfaAvg,
    userAssets: profile.assets,
  });

  return evaluateHealthV2(healthInput, {
    creditScore: profile.storedScores.creditScore ?? 0,
    transactionalScore: profile.storedScores.transactionalScore ?? 0,
    monthlyIncome: totalIngresos,
    monthlyDebt: deudaMensualClp,
  });
}

/**
 * Evalúa la salud del usuario cargando su profile unificado. Devuelve `null` cuando faltan los
 * insumos mínimos (cartola o CMF) — el llamador decide el fallback.
 */
export async function evaluateUserHealth(userId: string): Promise<HealthEvaluationResult | null> {
  try {
    const profile = await buildUserRiskProfile(userId);
    if (!profile) return null;
    return evaluateHealthFromProfile(profile);
  } catch (e) {
    logger.warn({ err: e, userId }, "[userHealthService] evaluateUserHealth failed (non-fatal)");
    return null;
  }
}

/** R1 — Traza auditable de la salud del usuario ("por qué este nivel"). Mismos insumos que evaluate. */
export function explainHealthFromProfile(profile: UserRiskProfile): HealthAudit | null {
  if (!profile.meta.hasCartola || !profile.meta.hasCmfHistory || !profile.cmf || !profile.cartola) {
    return null;
  }
  const cmfData = profile.cmf.raw;
  const totalIngresos = profile.cartola.ingresos;
  const totalGastos = profile.cartola.gastos;
  const deudaTotalClp = profile.meta.deudaTotalClp;
  const deudaMensualClp = estimarCuotaMensual(cmfData, deudaTotalClp);
  const sfaAvg = profile.storedScores.txMetrics?.averageMonthlyBalanceClp ?? undefined;

  const healthInput = deriveHealthInput({
    ingresoMensualClp: totalIngresos,
    deudaMensualClp,
    deudaTotalClp,
    ahorroMensualClp: totalIngresos - totalGastos,
    cmf: cmfData,
    sfaAvgMonthlyBalanceClp: sfaAvg,
    userAssets: profile.assets,
  });

  return explainHealthV2(healthInput);
}

/**
 * Traza auditable de la salud del usuario. Usa el MISMO resolver de input que la ruta
 * `/api/health-evaluation/me` (el número que ve el usuario) para que el nivel y su
 * explicación no diverjan — antes se derivaban distinto (profile vs. transacciones del
 * último mes) y no coincidían. `explainHealthFromProfile` se mantiene para callers que ya
 * tienen un profile en mano, pero el flujo por-usuario pasa por el resolver único.
 */
export async function explainUserHealth(userId: string): Promise<HealthAudit | null> {
  try {
    const { resolveHealthInputForUser } = await import("./healthInputResolver.js");
    const resolved = await resolveHealthInputForUser(userId);
    if (!resolved) return null;
    return explainHealthV2(resolved.healthInput);
  } catch (e) {
    logger.warn({ err: e, userId }, "[userHealthService] explainUserHealth failed (non-fatal)");
    return null;
  }
}
