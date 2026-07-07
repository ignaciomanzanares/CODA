import type { FeatureVector } from "../ml/features.js";

// Lightweight baseline PD scorer using logistic function with json-configurable weights
export type PDModel = {
  bias: number;
  weights: Record<keyof FeatureVector, number>;
  // optional calibration
  scale?: number; // multiply logit by scale
};

// Default rough weights – to be replaced by trained XGBoost/Calibrated LR
const defaultModel: PDModel = {
  bias: -2.2, // base PD ~0.10
  weights: {
    windowDays: 0.0,
    txCount: -0.001,
    debitCount: 0.0005,
    creditCount: -0.0012,
    totalDebits: 0.00002,
    totalCredits: -0.00002,
    avgAmount: -0.0005,
    stdAmount: 0.0006,
    activeDays: -0.01,
    debitCreditRatio: 0.25,
    incomeRegularity: -1.0,
    topCategoryShare: 0.4,
    // New features default to zero weight to preserve baseline behavior
    monthlyIncome: 0.0,
    monthlyDebits: 0.0,
    dti: 0.0,
    dtiCapped: 0.0,
    incomeTrend30_90: 0.0,
    netCashflowVolatility: 0.0,
    recurringExpenseShare: 0.0,
    // Window-invariant superset (#B): peso 0 en el baseline heurístico — solo las usa el
    // artefacto XGB invariante (que las elige por nombre desde su feature_meta).
    txPerMonth: 0.0,
    debitPerMonth: 0.0,
    creditPerMonth: 0.0,
    activeDaysShare: 0.0,
  },
  scale: 1.0,
};

export function scorePD(features: FeatureVector, model: PDModel = defaultModel) {
  // logit = bias + sum(w_i * f_i)
  let logit = model.bias;
  for (const key of Object.keys(model.weights) as (keyof FeatureVector)[]) {
    // Baseline heurístico tolerante: una feature ausente aporta 0 (no NaN). El path estricto
    // que explota ante features ausentes es scoreXGB (modelRegistry), no este.
    const fv = features[key];
    logit += (model.weights[key] || 0) * (typeof fv === "number" && Number.isFinite(fv) ? fv : 0);
  }
  if (model.scale) logit *= model.scale;
  const pd = 1 / (1 + Math.exp(-logit));

  // Provide simple reason codes (top 3 positive contributors)
  const contributions = Object.entries(model.weights).map(([k, w]) => {
    const fv = (features as any)[k];
    return { key: k as keyof FeatureVector, contrib: (typeof fv === "number" && Number.isFinite(fv) ? fv : 0) * (w as number) };
  });
  contributions.sort((a, b) => b.contrib - a.contrib);
  const reasons = contributions.slice(0, 3).map(c => c.key);

  return { pd, logit, reasons };
}
