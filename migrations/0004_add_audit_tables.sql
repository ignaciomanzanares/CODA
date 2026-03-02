-- Migration: Add Audit & Traceability Tables for CMF Compliance
-- Version: 0004
-- Date: 2026-03-02
-- Purpose: Implement algorithmic traceability (NCG 502)

-- ============================================================================
-- MODEL VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type TEXT NOT NULL,
  version TEXT NOT NULL,
  
  deployed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deployed_by TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  training_metrics JSONB,
  validation_metrics JSONB,
  
  hyperparameters JSONB,
  features JSONB,
  
  model_path TEXT,
  model_size INTEGER,
  
  changelog TEXT,
  approved_by TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_versions_active ON model_versions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_model_versions_type ON model_versions(model_type);

-- ============================================================================
-- CREDIT SCORE PREDICTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_score_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  
  model_version_id UUID NOT NULL REFERENCES model_versions(id),
  model_version TEXT NOT NULL,
  
  input_features JSONB NOT NULL,
  
  cmf_data JSONB,
  cmf_document_id TEXT,
  
  sfa_data JSONB,
  sfa_score_id TEXT,
  
  credit_score INTEGER NOT NULL,
  probability_default REAL NOT NULL,
  risk_category TEXT NOT NULL,
  confidence REAL NOT NULL,
  
  shap_values JSONB,
  top_factors JSONB,
  
  decision_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  processing_time_ms INTEGER,
  
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_predictions_user ON credit_score_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_predictions_timestamp ON credit_score_predictions(decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_credit_predictions_model ON credit_score_predictions(model_version_id);
CREATE INDEX IF NOT EXISTS idx_credit_predictions_request ON credit_score_predictions(request_id);

-- ============================================================================
-- ALGORITHM CHANGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS algorithm_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  change_type TEXT NOT NULL,
  component TEXT NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  technical_details TEXT,
  
  old_version TEXT,
  new_version TEXT NOT NULL,
  
  expected_impact TEXT,
  affected_users INTEGER,
  
  changes_diff JSONB,
  
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMP,
  
  deployed_at TIMESTAMP,
  rollback_at TIMESTAMP,
  rollback_reason TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_changes_status ON algorithm_changes(status);
CREATE INDEX IF NOT EXISTS idx_algorithm_changes_component ON algorithm_changes(component);

-- ============================================================================
-- FEATURE IMPORTANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_importance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  model_version_id UUID NOT NULL REFERENCES model_versions(id),
  
  feature_name TEXT NOT NULL,
  feature_category TEXT,
  
  importance REAL NOT NULL,
  importance_rank INTEGER,
  
  mean_value REAL,
  std_value REAL,
  min_value REAL,
  max_value REAL,
  
  drift_score REAL,
  last_drift_check TIMESTAMP,
  
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_importance_model ON feature_importance(model_version_id);
CREATE INDEX IF NOT EXISTS idx_feature_importance_rank ON feature_importance(importance_rank);

-- ============================================================================
-- CREDIT SCORE DISPUTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_score_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id TEXT NOT NULL,
  prediction_id UUID NOT NULL REFERENCES credit_score_predictions(id),
  
  dispute_reason TEXT NOT NULL,
  user_explanation TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending',
  
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  resolution TEXT,
  
  original_score INTEGER,
  revised_score INTEGER,
  score_adjustment_reason TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_user ON credit_score_disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_prediction ON credit_score_disputes(prediction_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON credit_score_disputes(status);

-- ============================================================================
-- MODEL PERFORMANCE MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  model_version_id UUID NOT NULL REFERENCES model_versions(id),
  
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  
  total_predictions INTEGER NOT NULL,
  avg_credit_score REAL,
  avg_probability_default REAL,
  
  actual_defaults INTEGER,
  actual_default_rate REAL,
  
  auc REAL,
  gini REAL,
  brier_score REAL,
  ks_statistic REAL,
  
  feature_drift JSONB,
  prediction_drift REAL,
  
  alert_triggered BOOLEAN DEFAULT false,
  alert_reason TEXT,
  
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_model ON model_performance_metrics(model_version_id);
CREATE INDEX IF NOT EXISTS idx_performance_period ON model_performance_metrics(period_start, period_end);
