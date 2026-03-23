-- Privacy consent events (CMF) + 2FA flag on users — Postgres (producción).
-- Ejecutar manualmente en Render / psql si la tabla o la columna no existen.

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS privacy_consent_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_user_id ON privacy_consent_events(user_id);
