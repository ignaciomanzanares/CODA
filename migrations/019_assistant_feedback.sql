-- Migration 019: Assistant feedback (thumbs up/down on AI replies).
-- Captures rating, the user/assistant message pair, and which provider responded.
-- Used to evaluate prompt/model/tool changes over time.
CREATE TABLE IF NOT EXISTS assistant_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating TEXT NOT NULL,
  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  provider TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_feedback_user_id
  ON assistant_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_feedback_created_at
  ON assistant_feedback(created_at);
