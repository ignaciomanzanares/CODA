-- Migration 020: Per-user rolling summary used as the assistant's
-- cross-session memory. One row per user; updated after each chat turn.
CREATE TABLE IF NOT EXISTS assistant_summaries (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  summary TEXT NOT NULL,
  exchange_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
