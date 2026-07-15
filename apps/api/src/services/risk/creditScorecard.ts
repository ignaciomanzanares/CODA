/**
 * Scorecard crediticio tradicional (control interpretable) — evalúa la regresión logística
 * entrenada en GiveMeSomeCredit sobre las features CMF del usuario.
 *
 *   logit = intercept + Σ coef_i · feature_i ;  PD = sigmoid(logit) ;  score = OFFSET − FACTOR·logit
 *
 * Interpretable por diseño: cada feature aporta una contribución al logit, que se traduce en razones
 * de "adverse action" (por qué el score no es más alto). Mismo espíritu que `services/pdScoring.ts`.
 */
import { CREDIT_SCORECARD, SCORE_MAPPING, FEATURE_LABELS } from "./creditScorecard.config.js";
import { categoriaFromScore } from "../../scoring/credit-score.js";
import type { CmfFeatures } from "./cmfDerivation.js";

export interface ScorecardReason {
  feature: string;
  label: string;
  /** Contribución al logit (coef·valor). Positiva = sube el riesgo (baja el score). */
  contribution: number;
  direction: "increases_risk" | "reduces_risk";
}

export interface CreditScorecardResult {
  modelId: string;
  /** Probabilidad de impago 0..1. */
  pd: number;
  logit: number;
  /** Puntaje 0–850. */
  score: number;
  band: { label: string; desc: string };
  /** Razones ordenadas por magnitud de contribución (para "adverse action"). */
  reasons: ScorecardReason[];
  features: { mora30: number; mora60: number; mora90: number; dti: number; util: number };
}

/** Features que consume el scorecard (subconjunto CMF, alineado con el entrenamiento GMSC). */
export interface ScorecardInput {
  mora30: number;
  mora60: number;
  mora90: number;
  /** DTI mensual (cuota/ingreso), definición GMSC. */
  dti: number;
  /** Utilización de líneas 0..~2. */
  util: number;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function evaluateCreditScorecard(input: ScorecardInput): CreditScorecardResult {
  const { intercept, coefficients: c } = CREDIT_SCORECARD;
  const contribs: Array<{ feature: keyof ScorecardInput; contribution: number }> = [
    { feature: "mora30", contribution: c.mora30 * input.mora30 },
    { feature: "mora60", contribution: c.mora60 * input.mora60 },
    { feature: "mora90", contribution: c.mora90 * input.mora90 },
    { feature: "dti", contribution: c.dti * input.dti },
    { feature: "util", contribution: c.util * input.util },
  ];

  const logit = intercept + contribs.reduce((s, x) => s + x.contribution, 0);
  const pd = sigmoid(logit);

  const rawScore = SCORE_MAPPING.offset - SCORE_MAPPING.factor * logit;
  const score = Math.round(Math.max(SCORE_MAPPING.min, Math.min(SCORE_MAPPING.max, rawScore)));

  const reasons: ScorecardReason[] = contribs
    .filter((x) => Math.abs(x.contribution) > 1e-6)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map((x) => ({
      feature: x.feature,
      label: FEATURE_LABELS[x.feature] ?? x.feature,
      contribution: x.contribution,
      direction: x.contribution > 0 ? "increases_risk" : "reduces_risk",
    }));

  return {
    modelId: CREDIT_SCORECARD.modelId,
    pd,
    logit,
    score,
    band: categoriaFromScore(score),
    reasons,
    features: input,
  };
}

/** Extrae las features del scorecard desde las features CMF del profile unificado. */
export function scorecardInputFromCmf(cmf: CmfFeatures): ScorecardInput {
  return {
    mora30: cmf.mora30,
    mora60: cmf.mora60,
    mora90: cmf.mora90,
    dti: cmf.dtiMensual,
    util: cmf.utilizacion,
  };
}
