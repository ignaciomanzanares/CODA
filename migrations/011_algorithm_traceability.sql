-- Trazabilidad algorítmica (NCG 502): versiones de modelo + registro de predicciones / recomendaciones.
-- PostgreSQL. Ejecutar si aún no existen (p. ej. entornos previos a Drizzle push).

CREATE TABLE IF NOT EXISTS algorithm_model_versions (
  id TEXT PRIMARY KEY,
  model_type TEXT NOT NULL,
  version TEXT NOT NULL,
  deployed_at TEXT NOT NULL DEFAULT (now()::text),
  deployed_by TEXT NOT NULL DEFAULT 'system',
  is_active INTEGER NOT NULL DEFAULT 0,
  changelog TEXT,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS algorithm_prediction_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  model_version_id TEXT NOT NULL REFERENCES algorithm_model_versions(id),
  model_version TEXT NOT NULL,
  model_type TEXT NOT NULL,
  input_features TEXT NOT NULL,
  output_snapshot TEXT NOT NULL,
  cmf_data TEXT,
  sfa_data TEXT,
  top_factors TEXT,
  processing_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_algorithm_prediction_logs_user ON algorithm_prediction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_prediction_logs_kind ON algorithm_prediction_logs(kind);
CREATE INDEX IF NOT EXISTS idx_algorithm_prediction_logs_created ON algorithm_prediction_logs(created_at DESC);
