-- Migration 025: Normalización de cartolas a la tabla transactions.
-- Hasta ahora las cartolas vivían sólo como JSON en score_document_uploads /
-- document_uploads. Ahora se normalizan a accounts/transactions (fuente de verdad
-- para Movimientos y el split bruto/real). Columnas nuevas en transactions:
--   is_internal_transfer : 1 = traspaso entre productos propios (pago de tarjeta,
--                          divisas). No es ingreso ni gasto real. Default 0.
--   source_document_id   : id del score_document_uploads que originó la fila, para
--                          borrar en cascada al eliminar una cartola.
--   original_amount/_currency, amount_clp, fx_rate : metadata de moneda original
--                          (TC internacional en USD convertido a CLP).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_internal_transfer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_document_id   TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount      REAL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_currency    TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_clp           REAL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_rate              REAL;

-- Borrado en cascada por documento y dedup por external_id.
CREATE INDEX IF NOT EXISTS idx_transactions_source_document ON transactions(source_document_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);
