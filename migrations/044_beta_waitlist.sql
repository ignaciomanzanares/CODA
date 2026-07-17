-- 044 — Lista de espera de la beta cerrada (registro por invitación mientras
-- la inscripción RPSF está en trámite; ver docs/LEY_FINTECH_ENCAJE_2026-07.md).
CREATE TABLE IF NOT EXISTS beta_waitlist (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
