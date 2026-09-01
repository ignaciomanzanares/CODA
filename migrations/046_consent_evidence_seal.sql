-- 046 — Evidencia sellada del consentimiento (D2). Sello a prueba de manipulación:
-- SHA-256 de los hechos consentidos (usuario, scope, finalidad, política) + timestamp,
-- calculado al AUTORIZAR el grant. Columnas nullable: los grants EXISTENTES quedan sin
-- sellar (evidence_hash NULL) — no se re-sellan retroactivamente; verifyConsentEvidence
-- devuelve false para ellos, que es lo correcto (no fueron sellados al autorizarse).
ALTER TABLE consent_grants ADD COLUMN IF NOT EXISTS evidence_hash TEXT;
ALTER TABLE consent_grants ADD COLUMN IF NOT EXISTS sealed_at TEXT;
