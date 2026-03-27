-- Documentos parseados (cartola / CMF) y snapshots de scoring combinado.
-- Compatible con PostgreSQL y convención TEXT de fechas (como el resto del proyecto).

CREATE TABLE IF NOT EXISTS document_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tipo VARCHAR(20) NOT NULL,
  banco VARCHAR(50),
  periodo_desde TEXT,
  periodo_hasta TEXT,
  parsed_data TEXT NOT NULL,
  parse_status VARCHAR(20) DEFAULT 'success',
  uploaded_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_document_uploads_user
  ON document_uploads(user_id, tipo, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS user_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  score_crediticio INTEGER,
  score_transaccional INTEGER,
  categoria VARCHAR(40),
  componentes TEXT,
  insights TEXT,
  documentos_usados TEXT,
  calculado_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  periodo_analizado_desde TEXT,
  periodo_analizado_hasta TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_scores_user_latest
  ON user_scores(user_id, calculado_at DESC);
