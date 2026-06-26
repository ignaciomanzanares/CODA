-- Migration 026: Habit feedback (thumbs up/down sobre hábitos financieros recomendados).
-- `habit_key` es estable (catálogo en services/habits/habitCatalog.ts), no un id de
-- instancia: el rating más reciente por key determina si ese hábito sigue
-- recomendándose al usuario (feedback loop, ver storage.getRecentlyDownvotedHabitKeys).
CREATE TABLE IF NOT EXISTS habit_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  habit_key TEXT NOT NULL,
  rating TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_habit_feedback_user_id
  ON habit_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_habit_feedback_user_key_created
  ON habit_feedback(user_id, habit_key, created_at);
