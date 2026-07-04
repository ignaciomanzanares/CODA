-- Migration 037: API keys de instituciones para la API de leads (Fase 2).
-- Cada key pertenece a un `provider` (= financial_products.provider) y solo accede a los leads de
-- sus propios productos. Se guarda solo el hash SHA-256 de la key (nunca la key en claro).

CREATE TABLE IF NOT EXISTS institution_api_keys (
  id           SERIAL PRIMARY KEY,
  provider     TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  label        TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_api_keys_key_hash_unique ON institution_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS institution_api_keys_provider ON institution_api_keys(provider);
