-- Tabla de auditoría de consentimientos CMF (Ley 19.628) — distinta de consent_grants (SFA).
-- Si el alta falla con "No se pudo registrar el consentimiento", ejecutar en Render:
--   psql "$DATABASE_URL" -f apps/api/scripts/create-privacy-consent-events.sql

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

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_user_id
  ON privacy_consent_events (user_id);

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'privacy_consent_events'
ORDER BY ordinal_position;
