-- Migration 028: Frente D del overhaul.
-- (#21) document_originals: referencia a los PDF/imagen originales subidos, cifrados en el
--       blob store con TTL. El job de retención borra los vencidos; el cierre de cuenta los
--       borra de inmediato. Los bytes viven en stored_blobs (o S3/R2), aquí solo la metadata.
-- (#32) document_parse_outcomes: resultado de cada intento de parseo (éxito/fallo, banco, tier,
--       confianza, error) para feedback al usuario y para priorizar mejoras del parser.

CREATE TABLE IF NOT EXISTS document_originals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  blob_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_originals_user_id ON document_originals(user_id);
CREATE INDEX IF NOT EXISTS idx_document_originals_expires_at ON document_originals(expires_at);

CREATE TABLE IF NOT EXISTS document_parse_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  document_type TEXT,
  banco TEXT,
  detection_tier TEXT,
  parse_confidence REAL,
  transaction_count INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_parse_outcomes_user_id ON document_parse_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_document_parse_outcomes_status ON document_parse_outcomes(status);
