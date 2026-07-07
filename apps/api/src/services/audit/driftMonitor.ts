/**
 * Model Drift Monitoring Service
 * 
 * Detects when ML models degrade in production.
 * Monitors:
 * - Feature distribution drift (input data changes)
 * - Prediction drift (output distribution changes)
 * - Performance metrics (if ground truth available)
 * 
 * Alerts when drift exceeds thresholds.
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import type { CreditScorePredictionLog, ModelVersion } from './algorithmicTraceability.js';
import { getUserPredictionHistory, getActiveModelVersion, registerAlgorithmChange } from './algorithmicTraceability.js';
import { listRecentPredictionPds } from './traceabilityPersistence.js';
import { notifyOps } from '../observability/index.js';
import { mlLogger as logger } from '../../logger.js';

/** PSI > 0.25 = drift severo → registrar AlgorithmChange como señal de reentrenamiento urgente. */
const PSI_SEVERE_THRESHOLD = 0.25;

// ============================================================================
// TYPES
// ============================================================================

interface FeatureDriftResult {
  featureName: string;
  trainMean: number;
  trainStd: number;
  prodMean: number;
  prodStd: number;
  driftScore: number; // 0-1 (higher = more drift)
  alert: boolean;
}

interface DriftMonitorResult {
  modelVersion: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Prediction drift
  totalPredictions: number;
  avgScore: number;
  stdScore: number;
  scoreDistribution: Record<string, number>; // Risk category counts
  
  // Feature drift
  featureDrift: FeatureDriftResult[];
  
  // Alerts
  overallDriftScore: number;
  alertTriggered: boolean;
  alertReason?: string;
}

// ============================================================================
// DRIFT DETECTION
// ============================================================================

/**
 * Compute Population Stability Index (PSI)
 * 
 * PSI measures drift between two distributions.
 * - PSI < 0.1: No significant drift
 * - PSI 0.1-0.2: Moderate drift (monitor)
 * - PSI > 0.2: Significant drift (retraining recommended)
 */
function computePSI(
  expectedDist: number[],
  actualDist: number[]
): number {
  if (expectedDist.length !== actualDist.length) {
    throw new Error('Distributions must have same length');
  }
  
  let psi = 0;
  
  for (let i = 0; i < expectedDist.length; i++) {
    const expected = expectedDist[i] + 1e-6; // Avoid log(0)
    const actual = actualDist[i] + 1e-6;
    
    psi += (actual - expected) * Math.log(actual / expected);
  }
  
  return psi;
}

/**
 * Detect feature drift using statistical tests
 */
function detectFeatureDrift(
  featureName: string,
  trainValues: number[],
  prodValues: number[]
): FeatureDriftResult {
  // Compute statistics
  const trainMean = trainValues.reduce((sum, v) => sum + v, 0) / trainValues.length;
  const trainStd = Math.sqrt(
    trainValues.reduce((sum, v) => sum + (v - trainMean) ** 2, 0) / trainValues.length
  );
  
  const prodMean = prodValues.reduce((sum, v) => sum + v, 0) / prodValues.length;
  const prodStd = Math.sqrt(
    prodValues.reduce((sum, v) => sum + (v - prodMean) ** 2, 0) / prodValues.length
  );
  
  // Drift score: normalized difference in means + difference in stds
  const meanDiff = Math.abs(prodMean - trainMean) / (trainStd + 1e-6);
  const stdDiff = Math.abs(prodStd - trainStd) / (trainStd + 1e-6);
  const driftScore = (meanDiff + stdDiff) / 2;
  
  // Alert if drift > 0.5 (significant change)
  const alert = driftScore > 0.5;
  
  return {
    featureName,
    trainMean,
    trainStd,
    prodMean,
    prodStd,
    driftScore,
    alert,
  };
}

/**
 * Monitor model drift over a period
 */
export function monitorModelDrift(
  predictions: CreditScorePredictionLog[],
  trainingStats?: {
    features: Record<string, { mean: number; std: number }>;
    scoreDistribution: Record<string, number>;
  }
): DriftMonitorResult {
  if (predictions.length === 0) {
    throw new Error('No predictions to monitor');
  }
  
  const periodStart = predictions[predictions.length - 1].decisionTimestamp;
  const periodEnd = predictions[0].decisionTimestamp;
  
  const activeModel = getActiveModelVersion();
  const modelVersion = activeModel?.version || 'unknown';
  
  // Compute score statistics
  const scores = predictions.map(p => p.creditScore);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - avgScore) ** 2, 0) / scores.length;
  const stdScore = Math.sqrt(variance);
  
  // Score distribution by risk category
  const scoreDistribution: Record<string, number> = {
    EXCELLENT: 0,
    GOOD: 0,
    AVERAGE: 0,
    POOR: 0,
    VERY_POOR: 0,
  };
  
  for (const p of predictions) {
    scoreDistribution[p.riskCategory] = (scoreDistribution[p.riskCategory] || 0) + 1;
  }
  
  // Feature drift detection (if training stats available)
  const featureDrift: FeatureDriftResult[] = [];
  
  if (trainingStats) {
    for (const [featureName, trainStat] of Object.entries(trainingStats.features)) {
      const prodValues = predictions
        .map(p => p.inputFeatures[featureName])
        .filter((v): v is number => typeof v === 'number');
      
      if (prodValues.length === 0) continue;
      
      const trainValues = Array(prodValues.length).fill(trainStat.mean); // Simulate training data
      
      const drift = detectFeatureDrift(featureName, trainValues, prodValues);
      featureDrift.push(drift);
    }
  }
  
  // Overall drift score
  const overallDriftScore = featureDrift.length > 0
    ? featureDrift.reduce((sum, f) => sum + f.driftScore, 0) / featureDrift.length
    : 0;
  
  // Trigger alert if:
  // 1. Overall drift > 0.3
  // 2. Any single feature drift > 0.5
  // 3. Score std > 100 (too volatile)
  const alertTriggered =
    overallDriftScore > 0.3 ||
    featureDrift.some(f => f.alert) ||
    stdScore > 100;
  
  const alertReason = alertTriggered
    ? [
        overallDriftScore > 0.3 && `Overall drift: ${overallDriftScore.toFixed(3)}`,
        featureDrift.some(f => f.alert) && `Feature drift detected: ${featureDrift.filter(f => f.alert).map(f => f.featureName).join(', ')}`,
        stdScore > 100 && `High score volatility: std=${stdScore.toFixed(1)}`,
      ].filter(Boolean).join('; ')
    : undefined;
  
  return {
    modelVersion,
    periodStart,
    periodEnd,
    totalPredictions: predictions.length,
    avgScore,
    stdScore,
    scoreDistribution,
    featureDrift,
    overallDriftScore,
    alertTriggered,
    alertReason,
  };
}

// ============================================================================
// PREDICTION DRIFT JOB (DB-backed, #24)
// ============================================================================

/** PSI > 0.2 = drift significativo (umbral estándar de la industria). */
export const PSI_DRIFT_THRESHOLD = 0.2;
/** Mínimo de muestras por ventana para que el PSI sea estadísticamente útil. */
export const DRIFT_MIN_SAMPLES = 50;

/** Histograma de `values` en `bins` celdas uniformes sobre [lo, hi], como proporciones. */
function proportions(values: number[], bins = 10, lo = 0, hi = 1): number[] {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const clamped = Math.min(hi, Math.max(lo, v));
    let idx = Math.floor(((clamped - lo) / (hi - lo)) * bins);
    if (idx >= bins) idx = bins - 1;
    counts[idx] += 1;
  }
  const total = values.length || 1;
  return counts.map((c) => c / total);
}

export interface DriftJobResult {
  status: 'ok' | 'insufficient_data';
  kind: string;
  recentN: number;
  referenceN: number;
  psi?: number;
  alert?: boolean;
}

/**
 * Job de drift de predicción (#24): compara la distribución de PD de las predicciones más
 * recientes contra el lote anterior (mismo `kind`), vía PSI sobre `algorithm_prediction_logs`
 * (ya no es un TODO/placeholder). Si PSI supera el umbral, alerta a ops (`notifyOps`, no-op si
 * `OPS_WEBHOOK_URL` no está configurado). Pensado para correr en un scheduler (ver index.ts) o
 * desde el workflow de CI.
 */
export async function runDriftMonitoringJob(opts?: {
  kind?: string;
  sampleSize?: number;
}): Promise<DriftJobResult> {
  const kind = opts?.kind ?? 'credit_cmf';
  const sampleSize = opts?.sampleSize ?? 500;

  // Trae los 2*N más recientes; mitad reciente vs mitad anterior.
  const all = await listRecentPredictionPds(kind, sampleSize * 2);
  const recent = all.slice(0, Math.floor(all.length / 2));
  const reference = all.slice(Math.floor(all.length / 2));

  if (recent.length < DRIFT_MIN_SAMPLES || reference.length < DRIFT_MIN_SAMPLES) {
    logger.info(
      { kind, recentN: recent.length, referenceN: reference.length },
      '[driftMonitor] datos insuficientes para PSI (se necesita acumular más predicciones)',
    );
    return { status: 'insufficient_data', kind, recentN: recent.length, referenceN: reference.length };
  }

  const psi = computePSI(proportions(reference), proportions(recent));
  const alert = psi > PSI_DRIFT_THRESHOLD;

  logger.info({ kind, psi, alert, recentN: recent.length, referenceN: reference.length }, '[driftMonitor] PSI calculado');

  if (alert) {
    await notifyOps(`Drift de PD detectado en '${kind}' (PSI=${psi.toFixed(3)} > ${PSI_DRIFT_THRESHOLD})`, {
      kind,
      psi,
      recentN: recent.length,
      referenceN: reference.length,
      hint: 'Revisar si la distribución de entrada cambió o reentrenar el modelo.',
    });

    // Drift severo → registrar AlgorithmChange pendiente de aprobación humana (NCG 502)
    if (psi > PSI_SEVERE_THRESHOLD) {
      const activeModel = getActiveModelVersion();
      registerAlgorithmChange({
        changeType: 'model_update',
        component: 'credit_score',
        title: `Drift severo detectado en '${kind}' (PSI=${psi.toFixed(3)})`,
        description: `El PSI de la distribución de PD supera el umbral severo (${PSI_SEVERE_THRESHOLD}). Se recomienda reentrenar o revisar la distribución de datos de entrada. Ventana: ${recent.length} predicciones recientes vs ${reference.length} de referencia.`,
        newVersion: activeModel?.version ?? 'unknown',
        oldVersion: activeModel?.version,
        status: 'pending',
        requestedBy: 'drift-monitor-auto',
        expectedImpact: `PSI=${psi.toFixed(3)} indica que la distribución de PDs cambió significativamente.`,
      });
      logger.warn({ kind, psi }, '[driftMonitor] drift severo — AlgorithmChange pendiente registrado');
    }
  }

  return { status: 'ok', kind, recentN: recent.length, referenceN: reference.length, psi, alert };
}

/**
 * Example: Manual drift check
 */
export function exampleDriftCheck() {
  console.log('\n📊 Example: Drift Monitoring\n');
  
  const mockPredictions: CreditScorePredictionLog[] = [
    {
      id: '1',
      userId: 'user-1',
      requestId: 'req-1',
      modelVersionId: 'model-1',
      modelVersion: 'v2.0.0',
      inputFeatures: { deudaTotalVigente: 0, deudaIndirecta: 0 },
      creditScore: 720,
      probabilityDefault: 0.08,
      riskCategory: 'GOOD',
      confidence: 0.85,
      decisionTimestamp: new Date(),
    },
    {
      id: '2',
      userId: 'user-2',
      requestId: 'req-2',
      modelVersionId: 'model-1',
      modelVersion: 'v2.0.0',
      inputFeatures: { deudaTotalVigente: 5000000, deudaIndirecta: 1000000 },
      creditScore: 580,
      probabilityDefault: 0.25,
      riskCategory: 'POOR',
      confidence: 0.75,
      decisionTimestamp: new Date(),
    },
  ];
  
  const trainingStats = {
    features: {
      deudaTotalVigente: { mean: 2000000, std: 1500000 },
      deudaIndirecta: { mean: 500000, std: 400000 },
    },
    scoreDistribution: {
      EXCELLENT: 0.15,
      GOOD: 0.35,
      AVERAGE: 0.30,
      POOR: 0.15,
      VERY_POOR: 0.05,
    },
  };
  
  const driftResult = monitorModelDrift(mockPredictions, trainingStats);
  
  console.log('Drift Monitoring Result:');
  console.log(`  Period: ${driftResult.periodStart.toISOString()} - ${driftResult.periodEnd.toISOString()}`);
  console.log(`  Predictions: ${driftResult.totalPredictions}`);
  console.log(`  Avg Score: ${driftResult.avgScore.toFixed(1)}`);
  console.log(`  Overall Drift Score: ${driftResult.overallDriftScore.toFixed(3)}`);
  console.log(`  Alert Triggered: ${driftResult.alertTriggered ? '⚠️  YES' : '✅ NO'}`);
  if (driftResult.alertReason) {
    console.log(`  Alert Reason: ${driftResult.alertReason}`);
  }
  
  console.log('\n  Feature Drift Details:');
  for (const fd of driftResult.featureDrift) {
    console.log(`    - ${fd.featureName}:`);
    console.log(`      Train: μ=${fd.trainMean.toFixed(1)}, σ=${fd.trainStd.toFixed(1)}`);
    console.log(`      Prod:  μ=${fd.prodMean.toFixed(1)}, σ=${fd.prodStd.toFixed(1)}`);
    console.log(`      Drift: ${fd.driftScore.toFixed(3)} ${fd.alert ? '⚠️' : '✓'}`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    exampleDriftCheck();
    console.log('\n✅ Audit system initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing audit system:', error);
    process.exit(1);
  }
}
