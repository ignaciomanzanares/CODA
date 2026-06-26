-- Migration 027: Frente 0 del overhaul.
-- (a) stored_blobs: backend Postgres del blob store (services/storage/blobStore.ts),
--     fallback cuando no hay bucket S3/R2. Bytes cifrados (base64) en `data`.
-- (b) Campos de ciclo de vida en algorithm_model_versions para promover modelos
--     sin redeploy (Frente C): lifecycle, artifact_uri, auc, dataset_hash, feature_set_hash.

CREATE TABLE IF NOT EXISTS stored_blobs (
  key TEXT PRIMARY KEY,
  content_type TEXT,
  data TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stored_blobs_expires_at
  ON stored_blobs(expires_at);

ALTER TABLE algorithm_model_versions
  ADD COLUMN IF NOT EXISTS lifecycle TEXT DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS artifact_uri TEXT,
  ADD COLUMN IF NOT EXISTS auc REAL,
  ADD COLUMN IF NOT EXISTS dataset_hash TEXT,
  ADD COLUMN IF NOT EXISTS feature_set_hash TEXT;

-- Las filas existentes marcadas activas se consideran la producción actual.
UPDATE algorithm_model_versions SET lifecycle = 'production'
  WHERE is_active = 1 AND (lifecycle IS NULL OR lifecycle = 'candidate');
