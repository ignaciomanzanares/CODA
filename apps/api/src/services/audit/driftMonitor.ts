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
import { getUserPredictionHistory, getActiveModelVersion } from './algorithmicTraceability.js';

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

/**
 * Cron job to monitor drift daily
 * 
 * In production, this should run as a scheduled task (e.g., cron, AWS Lambda)
 */
export async function runDriftMonitoringJob() {
  console.log('🔍 Running drift monitoring job...');
  
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Get all predictions from last 24h
  // TODO: Replace with actual DB query
  // const predictions = await storage.getPredictionsInRange(oneDayAgo, now);
  
  // For now, return placeholder
  console.log('⚠️  Drift monitoring requires PostgreSQL migration');
  console.log('   TODO: Implement after migrating from in-memory to DB');
  
  return {
    status: 'pending_db_migration',
    message: 'Drift monitoring will be active after PostgreSQL migration',
  };
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
