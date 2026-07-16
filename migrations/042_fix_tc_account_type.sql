-- 042 — Reparar cuentas de tarjeta con tipo heredado de la ruta OBProvider.
--
-- CartolaUploadProvider (eliminado en 041) creaba TODAS las cuentas con
-- type='checking' y sin subtype. Las cuentas 'cartola:%' que sobrevivieron a la
-- consolidación de 041 (sin keeper normalizado con quien fusionarse) conservaron
-- esa forma: la UI las etiqueta "Cuenta corriente" y les muestra saldo $0 en vez
-- de "—". El código nuevo (getOrCreateAccount) también se auto-corrige al tocar
-- la cuenta, pero esta migración repara sin esperar el próximo upload.
UPDATE accounts
SET type = 'credit', subtype = 'credit_card', updated_at = CURRENT_TIMESTAMP
WHERE provider_account_id LIKE 'cartola:%'
  AND name ~* 'tarjeta\s+(nacional|internacional)'
  AND (type IS DISTINCT FROM 'credit' OR subtype IS DISTINCT FROM 'credit_card');
