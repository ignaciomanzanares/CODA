-- Migration 018: Composite indexes for frequent (user_id, tipo) queries.
-- listDocumentUploadsByType and listScoreDocumentUploadsByType filter by both columns
-- on every health-evaluation, upload, and scoring request.
CREATE INDEX IF NOT EXISTS idx_document_uploads_user_tipo
  ON document_uploads(user_id, tipo);

CREATE INDEX IF NOT EXISTS idx_score_document_uploads_user_tipo
  ON score_document_uploads(user_id, tipo);

-- Index for financial goals by user (listed on every Plan page load)
CREATE INDEX IF NOT EXISTS idx_financial_goals_user_id
  ON financial_goals(user_id);

-- Index for user_assets by user
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id
  ON user_assets(user_id);
