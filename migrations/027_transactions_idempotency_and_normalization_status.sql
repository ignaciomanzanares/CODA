-- Migration 027: idempotencia de transacciones normalizadas y estado de normalización.
-- `external_id` es determinístico por score_document_upload + índice; hacerlo único
-- evita duplicados si dos normalizaciones/backfills corren en paralelo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id_unique
  ON transactions(external_id)
  WHERE external_id IS NOT NULL;

-- Estado operacional del paso parsed_data -> accounts/transactions.
-- NULL = documento legacy/no aplica; pending/success/failed = cartola nueva.
ALTER TABLE document_uploads
  ADD COLUMN IF NOT EXISTS normalization_status TEXT;
