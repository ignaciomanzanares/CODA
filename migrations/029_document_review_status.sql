-- Migration 029: Estado de revisión por importación (cartola/CMF) en document_uploads.
-- Aditivo e idempotente. `review_status` parte en 'not_required' (default cubre las filas
-- existentes, sin backfill manual). Al subir se setea 'required' cuando el banco no se
-- reconoció directamente (parser genérico) o la detección no fue de alta confianza; el
-- usuario puede marcarlo 'reviewed'. No toca tablas de Empresas.
ALTER TABLE document_uploads
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE document_uploads
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE document_uploads
  ADD COLUMN IF NOT EXISTS reviewed_at TEXT;
