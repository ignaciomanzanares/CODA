-- Fase G del doble evaluador: outcomes reales de decisiones de crédito. Snapshot (features + scores
-- emitidos) al aplicar; outcome de la institución después. Dataset propio para recalibrar los modelos
-- con data chilena y aprender qué proveedor otorga a quién.
CREATE TABLE IF NOT EXISTS risk_decision_outcomes (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  provider TEXT,
  product_id INTEGER,
  segment TEXT,
  traditional_score INTEGER,
  traditional_pd REAL,
  transactional_score INTEGER,
  transactional_pd REAL,
  features_snapshot TEXT,
  outcome TEXT,
  originated_amount_clp INTEGER,
  outcome_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_decision_outcomes_provider ON risk_decision_outcomes (provider);
CREATE INDEX IF NOT EXISTS idx_risk_decision_outcomes_outcome ON risk_decision_outcomes (outcome);
