-- Migration 032: RUT del titular en users.
-- Almacena el RUT chileno del usuario para binding de identidad en uploads CMF.
-- Se rellena en el primer upload exitoso de Informe de Deudas CMF.
-- Uploads posteriores validan que el RUT del documento coincida con el almacenado.

ALTER TABLE users ADD COLUMN IF NOT EXISTS rut TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_rut_unique ON users(rut) WHERE rut IS NOT NULL;
