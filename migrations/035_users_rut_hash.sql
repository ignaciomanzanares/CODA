-- Migration 035: seudonimización del RUT del titular.
-- Agrega rut_hash (HMAC-SHA256 irreversible, ver services/crypto/identifierHashing.ts) para
-- reemplazar el binding de identidad que hoy usa users.rut en texto plano.
--
-- Rollout (no big-bang, ver docs/RETENTION_POLICY.md):
--   1. Esta migración agrega rut_hash (nullable) — no toca ni borra `rut`.
--   2. El código ya escribe/lee solo rut_hash a partir de este deploy.
--   3. Correr manualmente `scripts/backfillRutHash.ts` para poblar rut_hash de usuarios
--      existentes que solo tienen `rut`.
--   4. Verificar 100% de cobertura, luego agregar una migración nueva que haga
--      `ALTER TABLE users DROP COLUMN rut` y `DROP INDEX users_rut_unique`, y borrar el campo
--      `rut` de packages/src/schema.ts. No incluida aquí a propósito: las migraciones se aplican
--      automáticamente al boot (ver db/migrate.ts), así que el DROP no debe llegar a este
--      directorio hasta confirmar el backfill en producción.

ALTER TABLE users ADD COLUMN IF NOT EXISTS rut_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_rut_hash_unique ON users(rut_hash) WHERE rut_hash IS NOT NULL;
