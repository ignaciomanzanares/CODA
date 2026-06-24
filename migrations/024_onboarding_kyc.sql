-- Migration 024: Onboarding de primer ingreso (consentimiento + KYC + 2FA).
-- Columnas nuevas en users:
--   kyc_status           : estado de verificación de identidad. Por ahora es un
--                          MOCK de UI (sin proveedor real ni almacenamiento de
--                          imágenes/biometría): null | 'mock_completed'. Se pide
--                          una sola vez.
--   onboarding_completed : 0/1 — el flujo de 3 pasos (Términos+consentimiento,
--                          KYC, 2FA) ya se completó, para no re-mostrarlo.
-- El consentimiento se registra en privacy_consent_events (migración 012, NCG 502).
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed INTEGER NOT NULL DEFAULT 0;
