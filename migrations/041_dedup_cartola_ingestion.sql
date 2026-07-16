-- 041 — Cierre de la doble escritura de cartolas (dedup de Movimientos).
--
-- Cada upload de cartola escribía las transacciones DOS veces:
--   Ruta A (normalizeCartolaDoc): external_id 'score_upload:<doc>:<idx>',
--          source_document_id, cuenta por (name,type,subtype) sin provider_account_id.
--   Ruta B (ingestFromProvider + CartolaUploadProvider): external_id hash,
--          cuenta 'cartola:<slug>' — eliminada del código junto con esta migración.
-- Además el find-or-create de cuentas no era atómico: dos uploads en paralelo
-- creaban cuentas duplicadas (visto en dev con worker concurrente).
--
-- Repara datos existentes y agrega la unicidad que hace atómico el find-or-create.
-- Idempotente: re-ejecutarla no borra datos nuevos (los guards filtran por
-- external_id 'score_upload:%' y por cuentas ya consolidadas).

-- 0. Consolidar cuentas con provider_account_id duplicado (carrera de la ingesta OB):
--    conservar la de menor id, mover transacciones y balances, borrar el resto.
CREATE TEMP TABLE _dup_provider_accounts AS
SELECT a.id AS dup_id, k.keep_id
FROM accounts a
JOIN (
  SELECT user_id, provider_account_id, MIN(id) AS keep_id
  FROM accounts
  WHERE provider_account_id IS NOT NULL
  GROUP BY user_id, provider_account_id
  HAVING COUNT(*) > 1
) k ON k.user_id = a.user_id AND k.provider_account_id = a.provider_account_id
WHERE a.id <> k.keep_id;

UPDATE transactions t SET account_id = m.keep_id
FROM _dup_provider_accounts m WHERE t.account_id = m.dup_id;

UPDATE balances b SET account_id = m.keep_id
FROM _dup_provider_accounts m WHERE b.account_id = m.dup_id;

DELETE FROM accounts a USING _dup_provider_accounts m WHERE a.id = m.dup_id;

DROP TABLE _dup_provider_accounts;

-- 1. Consolidar cuentas duplicadas de la ruta normalizada (misma carrera, cuentas
--    sin provider_account_id). Solo cuentas cuyo contenido es 100% derivado de
--    cartolas (external_id 'score_upload:%'), para no fusionar cuentas manuales.
CREATE TEMP TABLE _dup_norm_accounts AS
SELECT a.id AS dup_id, k.keep_id
FROM accounts a
JOIN (
  SELECT user_id, name, type, subtype, MIN(id) AS keep_id
  FROM accounts
  WHERE provider_account_id IS NULL
  GROUP BY user_id, name, type, subtype
  HAVING COUNT(*) > 1
) k ON k.user_id = a.user_id
   AND a.name IS NOT DISTINCT FROM k.name
   AND a.type IS NOT DISTINCT FROM k.type
   AND a.subtype IS NOT DISTINCT FROM k.subtype
WHERE a.provider_account_id IS NULL
  AND a.id <> k.keep_id
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.account_id = a.id
      AND (t.external_id IS NULL OR t.external_id NOT LIKE 'score_upload:%')
  );

UPDATE transactions t SET account_id = m.keep_id
FROM _dup_norm_accounts m WHERE t.account_id = m.dup_id;

UPDATE balances b SET account_id = m.keep_id
FROM _dup_norm_accounts m WHERE b.account_id = m.dup_id;

DELETE FROM accounts a USING _dup_norm_accounts m WHERE a.id = m.dup_id;

DROP TABLE _dup_norm_accounts;

-- 2. Borrar la copia OBProvider de cada cartola: transacciones de cuentas
--    'cartola:%' sin external_id 'score_upload:%', SOLO si el usuario tiene la
--    copia normalizada del mismo banco (mismo name). Si no la tiene (upload
--    legacy nunca backfilleado), sus datos se conservan.
DELETE FROM transactions t
USING accounts a
WHERE t.account_id = a.id
  AND a.provider_account_id LIKE 'cartola:%'
  AND (t.external_id IS NULL OR t.external_id NOT LIKE 'score_upload:%')
  AND EXISTS (
    SELECT 1
    FROM transactions t2
    JOIN accounts a2 ON a2.id = t2.account_id
    WHERE a2.user_id = a.user_id
      AND a2.id <> a.id
      AND a2.name IS NOT DISTINCT FROM a.name
      AND t2.external_id LIKE 'score_upload:%'
  );

-- 3. Fusionar cada cuenta 'cartola:%' ya vacía con su cuenta normalizada: la
--    normalizada hereda provider_account_id (el código nuevo matchea por él) y
--    los balances (saldo de la cartola); la vacía se borra.
CREATE TEMP TABLE _cartola_merge AS
SELECT old.id AS old_id, old.provider_account_id AS paid, keep.id AS keep_id
FROM accounts old
JOIN LATERAL (
  SELECT k.id FROM accounts k
  WHERE k.user_id = old.user_id
    AND k.provider_account_id IS NULL
    AND k.name IS NOT DISTINCT FROM old.name
  ORDER BY k.id
  LIMIT 1
) keep ON TRUE
WHERE old.provider_account_id LIKE 'cartola:%'
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = old.id);

UPDATE balances b SET account_id = m.keep_id
FROM _cartola_merge m WHERE b.account_id = m.old_id;

UPDATE accounts k SET provider_account_id = m.paid, updated_at = CURRENT_TIMESTAMP
FROM _cartola_merge m WHERE k.id = m.keep_id;

DELETE FROM accounts a USING _cartola_merge m WHERE a.id = m.old_id;

DROP TABLE _cartola_merge;

-- 4. Unicidad (user, provider_account_id): hace atómico el find-or-create de
--    getOrCreateAccount (el perdedor de la carrera recibe unique_violation y
--    re-consulta). Parcial: las cuentas legacy con provider NULL no participan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_provider_account
  ON accounts(user_id, provider_account_id)
  WHERE provider_account_id IS NOT NULL;
