-- Agregar columnas de autenticación si no existen (login / 2FA / JWT role)
-- Correr en Render (Postgres):
--   psql "$DATABASE_URL" -f apps/api/scripts/add-auth-columns.sql
-- Usar la External URL del Postgres de Render (SSL).

-- Columna usada por Drizzle / login para 2FA por correo (si falta, el SELECT falla con 500)
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'persona';
-- INTEGER 0/1 (paridad con Drizzle / SQLite en @coda/db)
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes TEXT;

-- Verificar que se agregaron:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'two_factor_enabled',
    'role',
    'totp_enabled',
    'totp_secret',
    'backup_codes'
  )
ORDER BY column_name;
