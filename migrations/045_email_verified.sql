-- 045 — Verificación de email al registro. Los usuarios EXISTENTES quedan
-- verificados (grandfathering: ya reciben 2FA/reset en ese correo); solo los
-- registros nuevos parten sin verificar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TEXT;
UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL;
