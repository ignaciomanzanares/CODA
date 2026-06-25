-- Migration 026: vínculo explícito entre document_uploads y score_document_uploads.
-- Evita borrar score docs / transacciones normalizadas por heurística banco+periodo.
ALTER TABLE score_document_uploads
  ADD COLUMN IF NOT EXISTS source_document_upload_id TEXT REFERENCES document_uploads(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_document_uploads_source_doc
  ON score_document_uploads(source_document_upload_id)
  WHERE source_document_upload_id IS NOT NULL;
