/**
 * Construye el contexto que evalúa el motor de reglas de deuda: reusa `evaluateUserHealth`
 * (misma derivación de ratios que la salud y el marketplace) y agrega el CMF crudo (que aquella
 * no devuelve) para las reglas que miran la deuda directa / líneas de crédito.
 */
import { storage } from '../../storage.js';
import { evaluateUserHealth, normalizeCmfData } from '../healthEvaluation/userHealthService.js';
import type { DebtRuleContext } from './types.js';

export async function buildDebtRuleContext(userId: string): Promise<DebtRuleContext | null> {
  const health = await evaluateUserHealth(userId);
  if (!health) return null; // sin cartola + CMF no hay evaluación posible

  const [cmfNew, cmfLegacy] = await Promise.all([
    storage.listDocumentUploadsByType(userId, 'cmf'),
    storage.listDocumentUploadsByType(userId, 'cmf_informe_deudas'),
  ]);
  const cmfDocs = [...cmfNew, ...cmfLegacy].sort(
    (a: any, b: any) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime(),
  );
  if (cmfDocs.length === 0) return null;
  const cmf = normalizeCmfData((cmfDocs[0] as any).parsedData);

  const credit = await storage.getCreditScore(userId);
  const tiposCredito = new Set(cmf.deuda_directa.map((d) => d.tipo_credito)).size;

  return {
    health,
    cmf,
    creditScore: credit?.score ?? null,
    tiposCredito,
  };
}
