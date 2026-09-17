-- 048 — Bóveda de secretos de conectores (D1 "bóveda de secretos" / B4).
--
-- Para qué: algunas fuentes entregan datos sin el titular presente, pero piden un secreto que él
-- delega una vez. El caso concreto es la Carpeta Tributaria del SII: el contribuyente la genera y
-- comparte un CÓDIGO y una CLAVE que sirven 90 días. Eso hay que guardarlo; la clave del banco NO
-- (el scraper la recibe en memoria y la descarta — ver connectors/scraper/README.md).
--
-- Decisiones que la tabla impone:
--   * `secret` cifrado en reposo (AES-256-GCM, services/crypto/fieldEncryption.ts).
--   * `expires_at` NOT NULL: un secreto sin vencimiento es un pasivo. El job de retención
--     (index.ts) borra los vencidos todos los días.
--   * UNIQUE (user_id, connector_id): compartir de nuevo REEMPLAZA el secreto anterior.
CREATE TABLE IF NOT EXISTS connector_secrets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  connector_id  TEXT NOT NULL,
  secret        TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un secreto vigente por usuario+conector (el upsert del vault depende de esto).
CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_secrets_user_connector
  ON connector_secrets(user_id, connector_id);

-- El job de retención barre por vencimiento.
CREATE INDEX IF NOT EXISTS idx_connector_secrets_expires ON connector_secrets(expires_at);
