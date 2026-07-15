/**
 * Orquestador del doble evaluador de riesgo (Fase D). Calcula AMBOS scores desde el profile
 * unificado, determina el segmento, elige el titular y devuelve la reconciliación. Ambos se computan
 * SIEMPRE (el tradicional interpretable es el control y provee las razones de "adverse action").
 */
import { buildUserRiskProfile } from "./userRiskProfile.js";
import {
  evaluateCreditScorecard,
  scorecardInputFromCmf,
  type CreditScorecardResult,
} from "./creditScorecard.js";
import { computeTransactionalScore, type TransactionalScoreResult } from "./transactionalScore.js";

export type RiskSegment = "thin_file" | "cmf_rich";
export type RiskHeadline = "traditional" | "transactional";

export type TraditionalResult =
  ({ available: true } & CreditScorecardResult) | { available: false };

export interface RiskEvaluation {
  segment: RiskSegment;
  /** Qué score protagoniza en la UI según el segmento. */
  headline: RiskHeadline;
  traditional: TraditionalResult;
  transactional: TransactionalScoreResult;
  reconciliation: { agree: boolean | null; note: string };
}

/** Umbral PD para clasificar riesgo bajo/alto al reconciliar las dos miradas. */
const LOW_RISK_PD = 0.15;

export function reconcile(
  traditional: TraditionalResult,
  transactional: TransactionalScoreResult,
): { agree: boolean | null; note: string } {
  const tAvail = traditional.available;
  const xAvail = transactional.available;

  if (tAvail && xAvail) {
    const lowT = traditional.pd < LOW_RISK_PD;
    const lowX = (transactional.pd ?? 1) < LOW_RISK_PD;
    if (lowT === lowX) {
      return {
        agree: true,
        note: lowT
          ? "Ambas miradas coinciden en riesgo bajo."
          : "Ambas miradas coinciden en riesgo elevado.",
      };
    }
    return {
      agree: false,
      note: "Las dos miradas difieren: el score tradicional (buró) y el transaccional no coinciden. Usamos el tradicional interpretable para explicarte el porqué.",
    };
  }

  if (!tAvail && xAvail) {
    return {
      agree: null,
      note: "Aún no hay control tradicional (sin historial de buró). Mostramos el score transaccional CODA como beta — es el segmento donde aportamos lo que el buró no puede.",
    };
  }
  if (tAvail && !xAvail) {
    return {
      agree: null,
      note: "Aún no hay suficientes datos transaccionales para el score CODA. El score tradicional (buró) es el disponible por ahora.",
    };
  }
  return {
    agree: null,
    note: "Aún no hay datos suficientes para evaluar tu riesgo. Sube tu Informe CMF y una cartola.",
  };
}

export async function evaluateRisk(userId: string): Promise<RiskEvaluation | null> {
  const profile = await buildUserRiskProfile(userId);
  if (!profile) return null;

  const hasCmf = profile.meta.hasCmfHistory && profile.cmf != null;
  const segment: RiskSegment = hasCmf ? "cmf_rich" : "thin_file";

  const traditional: TraditionalResult = hasCmf
    ? { available: true, ...evaluateCreditScorecard(scorecardInputFromCmf(profile.cmf!.features)) }
    : { available: false };

  const transactional = await computeTransactionalScore(profile);

  const headline: RiskHeadline = segment === "thin_file" ? "transactional" : "traditional";
  const reconciliation = reconcile(traditional, transactional);

  return { segment, headline, traditional, transactional, reconciliation };
}
