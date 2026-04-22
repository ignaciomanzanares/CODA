-- Parser diagnostics table: records each bank detection attempt.
-- Stores metadata about the detection for observability and tuning.
-- NEVER stores PDF content, raw transaction data, or personal financial data.

CREATE TABLE IF NOT EXISTS parser_diagnostics (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT REFERENCES users(id),
  timestamp     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  detected_bank VARCHAR(60),
  confidence_score REAL NOT NULL,
  signals_evaluated TEXT NOT NULL, -- JSON array of matched signal names
  tier          VARCHAR(10) NOT NULL CHECK (tier IN ('HIGH', 'MEDIUM', 'LOW')),
  file_size     INTEGER,           -- bytes
  page_count    INTEGER,
  text_length   INTEGER,           -- characters extracted
  user_action   VARCHAR(30)        -- nullable: 'accepted' | 'rejected' | 'pending'
);

CREATE INDEX IF NOT EXISTS idx_parser_diagnostics_user
  ON parser_diagnostics(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_parser_diagnostics_tier
  ON parser_diagnostics(tier, timestamp DESC);
