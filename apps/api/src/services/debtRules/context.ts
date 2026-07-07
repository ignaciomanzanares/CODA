/**
 * Construye el contexto que evalúa el motor de reglas de deuda. Desde la Fase A del doble evaluador
 * de riesgo, reusa el feature store unificado (`buildUserRiskProfile`): la salud se deriva del mismo
 * profile y el CMF sale de ahí, sin recargar documentos ni desincronizarse con salud/scores.
 */
import { buildUserRiskProfile } from '../risk/userRiskProfile.js';
import { evaluateHealthFromProfile } from '../healthEvaluation/userHealthService.js';
import type { DebtRuleContext } from './types.js';

export async function buildDebtRuleContext(userId: string): Promise<DebtRuleContext | null> {
  const profile = await buildUserRiskProfile(userId);
  if (!profile || !profile.cmf) return null; // sin CMF no hay evaluación posible

  const health = evaluateHealthFromProfile(profile);
  if (!health) return null; // sin cartola + CMF no hay evaluación posible

  return {
    health,
    cmf: profile.cmf.raw,
    creditScore: profile.storedScores.creditScore ?? null,
    tiposCredito: profile.cmf.features.tiposCredito,
  };
}
