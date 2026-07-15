/**
 * Captura de outcomes reales de decisiones de crédito (Fase G del doble evaluador).
 *
 * Al aplicar a un producto se congela un SNAPSHOT anti-leakage (features + scores emitidos en ese
 * momento); cuando la institución responde (`reportLeadResponse` → `updateApplicationStatus`) se
 * completa el `outcome`. Es el dataset propio de CODA con el que se recalibran ambos modelos con data
 * chilena (vía `db:export-decision-outcomes`) y se aprende qué proveedor otorga a quién.
 *
 * Todo es fire-and-forget / never-throw: nunca debe romper el flujo de aplicación de un lead.
 */
import { eq } from "drizzle-orm";
import { db, riskDecisionOutcomes } from "../../db/index.js";
import { logger } from "../../logger.js";
import { encryptField } from "../crypto/fieldEncryption.js";
import { evaluateRisk } from "./evaluateRisk.js";
import { buildUserRiskProfile } from "./userRiskProfile.js";

/** Congela el snapshot de riesgo al momento de aplicar. Never-throw. */
export async function captureDecisionSnapshot(params: {
  userId: string;
  applicationId: number;
  provider?: string | null;
  productId?: number | null;
}): Promise<void> {
  try {
    const [profile, evaluation] = await Promise.all([
      buildUserRiskProfile(params.userId),
      evaluateRisk(params.userId),
    ]);
    if (!evaluation) return;

    const trad = evaluation.traditional.available ? evaluation.traditional : null;
    const tx = evaluation.transactional.available ? evaluation.transactional : null;

    // Snapshot de features CIFRADO (datos financieros) — reconstruible para reentrenar.
    const snapshot = encryptField(
      JSON.stringify({
        segment: evaluation.segment,
        cmf: profile?.cmf?.features ?? null,
        transactional: profile?.transactional ?? null,
        capturedAt: new Date().toISOString(),
      }),
    );

    await db
      .insert(riskDecisionOutcomes)
      .values({
        applicationId: params.applicationId,
        userId: params.userId,
        provider: params.provider ?? null,
        productId: params.productId ?? null,
        segment: evaluation.segment,
        traditionalScore: trad?.score ?? null,
        traditionalPd: trad?.pd ?? null,
        transactionalScore: tx?.score ?? null,
        transactionalPd: tx?.pd ?? null,
        featuresSnapshot: snapshot,
        outcome: null,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
  } catch (e) {
    logger.warn(
      { err: e, applicationId: params.applicationId },
      "[decisionOutcomes] captureDecisionSnapshot failed (non-fatal)",
    );
  }
}

/** Completa el outcome real cuando la institución responde. Never-throw. */
export async function recordDecisionOutcome(params: {
  applicationId: number;
  outcome: string;
  originatedAmountClp?: number | null;
}): Promise<void> {
  try {
    await db
      .update(riskDecisionOutcomes)
      .set({
        outcome: params.outcome,
        originatedAmountClp: params.originatedAmountClp ?? null,
        outcomeAt: new Date().toISOString(),
      })
      .where(eq(riskDecisionOutcomes.applicationId, params.applicationId));
  } catch (e) {
    logger.warn(
      { err: e, applicationId: params.applicationId },
      "[decisionOutcomes] recordDecisionOutcome failed (non-fatal)",
    );
  }
}

export interface DecisionOutcomeStats {
  total: number;
  labeled: number;
  pending: number;
  byOutcome: Record<string, number>;
  /** Tasa de aprobación por proveedor (originated+approved / con outcome). */
  byProvider: Array<{
    provider: string;
    decisions: number;
    approvals: number;
    approvalRate: number;
  }>;
}

/** Métricas para el dashboard admin: cuánta data etiquetada hay y tasa de aprobación por proveedor. */
export async function getDecisionOutcomeStats(): Promise<DecisionOutcomeStats> {
  const rows = (await db.select().from(riskDecisionOutcomes)) as Array<{
    outcome: string | null;
    provider: string | null;
  }>;

  const byOutcome: Record<string, number> = {};
  const providerMap = new Map<string, { decisions: number; approvals: number }>();
  let labeled = 0;

  const APPROVED = new Set(["originated", "approved", "accepted"]);
  for (const r of rows) {
    if (r.outcome) {
      labeled += 1;
      byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
      const p = r.provider ?? "(sin proveedor)";
      const agg = providerMap.get(p) ?? { decisions: 0, approvals: 0 };
      agg.decisions += 1;
      if (APPROVED.has(r.outcome)) agg.approvals += 1;
      providerMap.set(p, agg);
    }
  }

  const byProvider = [...providerMap.entries()]
    .map(([provider, a]) => ({
      provider,
      decisions: a.decisions,
      approvals: a.approvals,
      approvalRate: a.decisions > 0 ? Math.round((a.approvals / a.decisions) * 100) : 0,
    }))
    .sort((x, y) => y.decisions - x.decisions);

  return { total: rows.length, labeled, pending: rows.length - labeled, byOutcome, byProvider };
}
