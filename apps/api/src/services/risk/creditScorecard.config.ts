/**
 * Coeficientes del scorecard tradicional (regresión logística entrenada en GiveMeSomeCredit).
 *
 * FUENTE DE VERDAD AL SERVIR: se embeben aquí (versionados, revisables en PR) en vez de leer el
 * JSON en runtime — mismo patrón que `services/pdScoring.ts`. El artefacto de provenance/reproducción
 * es `ml/artifacts/logreg_cmf/coeffs.json` (generado por `ml/train_logreg.py`). Si se reentrena,
 * copiar los nuevos coeficientes aquí y actualizar `modelId`/`metrics`.
 *
 * logit = intercept + Σ coef_i · feature_i ;  PD = 1/(1+e^-logit)
 */
export interface ScorecardCoefficients {
  modelId: string;
  intercept: number;
  coefficients: {
    mora30: number;
    mora60: number;
    mora90: number;
    dti: number;
    util: number;
  };
  metrics: { aucCv5: number; baseRate: number };
  datasetHash: string;
}

export const CREDIT_SCORECARD: ScorecardCoefficients = {
  modelId: "logreg_cmf_1783351412",
  intercept: -3.9554575248385047,
  coefficients: {
    mora30: 0.41755275413146536,
    mora60: 0.1731422877324404,
    mora90: 0.4678056490230813,
    dti: 0.05929982617134254,
    util: 1.9844892398437808,
  },
  metrics: { aucCv5: 0.8361426992207845, baseRate: 0.06684 },
  datasetHash: "d109bceb151c069363c54440ef3f76a5ff0cda2b18069fa47f5c76e342a08c8c",
};

/**
 * Mapeo PD → puntaje 0–850 (escalado log-odds, estándar de scorecards):
 *   score = OFFSET − FACTOR · logit,  acotado a [0, 850].
 * Anclas usadas: PD 1% → ~800, PD 6,7% (base rate) → ~600, PD 50% → ~350.
 * (FACTOR ≈ 98 da ~PDO 68 puntos por duplicar odds.)
 */
export const SCORE_MAPPING = { offset: 350, factor: 98, min: 0, max: 850 } as const;

/** Etiquetas legibles por feature, para las razones de "adverse action". */
export const FEATURE_LABELS: Record<string, string> = {
  mora30: "atrasos de 30–59 días",
  mora60: "atrasos de 60–89 días",
  mora90: "atrasos de 90+ días",
  dti: "carga de deuda sobre tu ingreso",
  util: "utilización de tus líneas de crédito",
};
