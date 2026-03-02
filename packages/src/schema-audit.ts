/**
 * Audit & Traceability Schema for CMF Compliance
 * 
 * Implements algorithmic traceability requirements from NCG 502.
 * All credit scoring decisions, model predictions, and algorithm changes
 * are logged for regulatory audit purposes.
 * 
 * Compliance: NCG 502 Section IV (Risk Management & Governance)
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { pgTable, text, timestamp, integer, jsonb, boolean, uuid, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// MODEL VERSIONS - Track all ML model versions
// ============================================================================

/**
 * ML Model Versions Registry
 * Tracks every version of credit scoring models deployed to production.
 * Required for: reproducibility, rollback, regulatory audit.
 */
export const modelVersions = pgTable('model_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelType: text('model_type').notNull(), // 'logistic_regression', 'xgboost', 'ensemble'
  version: text('version').notNull(), // 'v2.0.0', 'v2.1.0'
  
  // Model metadata
  deployedAt: timestamp('deployed_at').notNull().defaultNow(),
  deployedBy: text('deployed_by').notNull(), // user/system that deployed
  isActive: boolean('is_active').notNull().default(false),
  
  // Performance metrics (from training)
  trainingMetrics: jsonb('training_metrics'), // {auc, gini, brier_score, etc}
  validationMetrics: jsonb('validation_metrics'),
  
  // Model configuration
  hyperparameters: jsonb('hyperparameters'), // {learning_rate, max_depth, etc}
  features: jsonb('features'), // List of features used
  
  // Model artifacts
  modelPath: text('model_path'), // S3/filesystem path to serialized model
  modelSize: integer('model_size'), // bytes
  
  // Audit trail
  changelog: text('changelog'), // What changed in this version
  approvedBy: text('approved_by'), // Who approved deployment
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// CREDIT SCORE PREDICTIONS - Audit log of all predictions
// ============================================================================

/**
 * Credit Score Prediction Audit Log
 * Records EVERY credit score prediction made by the system.
 * Required for: explainability, dispute resolution, regulatory audit.
 */
export const creditScorePredictions = pgTable('credit_score_predictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // User & context
  userId: text('user_id').notNull(),
  requestId: text('request_id').notNull(), // For tracing across services
  
  // Model version used
  modelVersionId: uuid('model_version_id').notNull().references(() => modelVersions.id),
  modelVersion: text('model_version').notNull(), // Denormalized for quick access
  
  // Input features (raw)
  inputFeatures: jsonb('input_features').notNull(), // All features used for prediction
  
  // CMF data
  cmfData: jsonb('cmf_data'), // {deudaTotalVigente, deudaIndirecta, etc}
  cmfDocumentId: text('cmf_document_id'), // Reference to uploaded document
  
  // SFA/transactional data
  sfaData: jsonb('sfa_data'), // Transactional features
  sfaScoreId: text('sfa_score_id'), // Reference to transactional score
  
  // Prediction output
  creditScore: integer('credit_score').notNull(), // 300-850
  probabilityDefault: real('probability_default').notNull(), // 0-1
  riskCategory: text('risk_category').notNull(), // EXCELLENT, GOOD, etc
  confidence: real('confidence').notNull(), // 0-1
  
  // Explainability (SHAP values)
  shapValues: jsonb('shap_values'), // Top factors with impact
  topFactors: jsonb('top_factors'), // Simplified for user display
  
  // Decision metadata
  decisionTimestamp: timestamp('decision_timestamp').notNull().defaultNow(),
  processingTimeMs: integer('processing_time_ms'), // Latency tracking
  
  // Audit trail
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================================================
// ALGORITHM CHANGES - Track all changes to scoring algorithms
// ============================================================================

/**
 * Algorithm Change Log
 * Records every change made to scoring algorithms, feature engineering,
 * or model logic. Required for regulatory transparency.
 */
export const algorithmChanges = pgTable('algorithm_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Change metadata
  changeType: text('change_type').notNull(), // 'feature_addition', 'model_update', 'config_change'
  component: text('component').notNull(), // 'credit_score', 'transactional_score', 'ensemble'
  
  // Change details
  title: text('title').notNull(),
  description: text('description').notNull(),
  technicalDetails: text('technical_details'), // Technical explanation
  
  // Version control
  oldVersion: text('old_version'),
  newVersion: text('new_version').notNull(),
  
  // Impact assessment
  expectedImpact: text('expected_impact'), // Expected effect on scores
  affectedUsers: integer('affected_users'), // Estimated number
  
  // Changes (diff)
  changesDiff: jsonb('changes_diff'), // Structured diff of changes
  
  // Approval workflow
  status: text('status').notNull().default('pending'), // pending, approved, rejected, rolled_back
  requestedBy: text('requested_by').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  
  // Deployment
  deployedAt: timestamp('deployed_at'),
  rollbackAt: timestamp('rollback_at'),
  rollbackReason: text('rollback_reason'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// FEATURE IMPORTANCE - Track feature importance over time
// ============================================================================

/**
 * Feature Importance Tracking
 * Monitors which features are most important for credit scoring decisions.
 * Helps detect drift and ensures transparency.
 */
export const featureImportance = pgTable('feature_importance', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  modelVersionId: uuid('model_version_id').notNull().references(() => modelVersions.id),
  
  // Feature details
  featureName: text('feature_name').notNull(),
  featureCategory: text('feature_category'), // 'cmf', 'sfa', 'demographic'
  
  // Importance metrics
  importance: real('importance').notNull(), // 0-1 normalized
  importanceRank: integer('importance_rank'), // Rank among all features
  
  // Statistics
  meanValue: real('mean_value'),
  stdValue: real('std_value'),
  minValue: real('min_value'),
  maxValue: real('max_value'),
  
  // Drift detection
  driftScore: real('drift_score'), // Statistical measure of drift
  lastDriftCheck: timestamp('last_drift_check'),
  
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================================================
// USER DISPUTES - Track disputes and resolutions
// ============================================================================

/**
 * Credit Score Disputes
 * Users can dispute their credit score. All disputes are logged for audit.
 */
export const creditScoreDisputes = pgTable('credit_score_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  userId: text('user_id').notNull(),
  predictionId: uuid('prediction_id').notNull().references(() => creditScorePredictions.id),
  
  // Dispute details
  disputeReason: text('dispute_reason').notNull(),
  userExplanation: text('user_explanation'),
  
  // Status
  status: text('status').notNull().default('pending'), // pending, under_review, resolved, rejected
  
  // Resolution
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  resolution: text('resolution'), // Explanation of resolution
  
  // Outcome
  originalScore: integer('original_score'),
  revisedScore: integer('revised_score'),
  scoreAdjustmentReason: text('score_adjustment_reason'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// MODEL PERFORMANCE MONITORING - Track model drift
// ============================================================================

/**
 * Model Performance Monitoring
 * Tracks actual vs predicted default rates to detect model drift.
 */
export const modelPerformanceMetrics = pgTable('model_performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  modelVersionId: uuid('model_version_id').notNull().references(() => modelVersions.id),
  
  // Time period
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  
  // Predictions stats
  totalPredictions: integer('total_predictions').notNull(),
  avgCreditScore: real('avg_credit_score'),
  avgProbabilityDefault: real('avg_probability_default'),
  
  // Actual outcomes (if available)
  actualDefaults: integer('actual_defaults'),
  actualDefaultRate: real('actual_default_rate'),
  
  // Performance metrics
  auc: real('auc'), // Area Under ROC Curve
  gini: real('gini'), // Gini coefficient
  brierScore: real('brier_score'),
  ksStatistic: real('ks_statistic'), // Kolmogorov-Smirnov
  
  // Drift indicators
  featureDrift: jsonb('feature_drift'), // Drift per feature
  predictionDrift: real('prediction_drift'), // Overall drift score
  
  // Alerts
  alertTriggered: boolean('alert_triggered').default(false),
  alertReason: text('alert_reason'),
  
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const modelVersionsRelations = relations(modelVersions, ({ many }) => ({
  predictions: many(creditScorePredictions),
  featureImportance: many(featureImportance),
  performanceMetrics: many(modelPerformanceMetrics),
}));

export const creditScorePredictionsRelations = relations(creditScorePredictions, ({ one, many }) => ({
  modelVersion: one(modelVersions, {
    fields: [creditScorePredictions.modelVersionId],
    references: [modelVersions.id],
  }),
  disputes: many(creditScoreDisputes),
}));

export const algorithmChangesRelations = relations(algorithmChanges, ({ one }) => ({
  // Could add relations to modelVersions if needed
}));

export const creditScoreDisputesRelations = relations(creditScoreDisputes, ({ one }) => ({
  prediction: one(creditScorePredictions, {
    fields: [creditScoreDisputes.predictionId],
    references: [creditScorePredictions.id],
  }),
}));

export const featureImportanceRelations = relations(featureImportance, ({ one }) => ({
  modelVersion: one(modelVersions, {
    fields: [featureImportance.modelVersionId],
    references: [modelVersions.id],
  }),
}));

export const modelPerformanceMetricsRelations = relations(modelPerformanceMetrics, ({ one }) => ({
  modelVersion: one(modelVersions, {
    fields: [modelPerformanceMetrics.modelVersionId],
    references: [modelVersions.id],
  }),
}));
