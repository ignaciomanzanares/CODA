-- Metas financieras (PostgreSQL). Si esta migración no se aplicó, POST /api/financial-goals falla con "relation financial_goals does not exist".
-- Idéntico a apps/api/scripts/create-goals-table.sql

CREATE TABLE IF NOT EXISTS financial_goals (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  current_amount INTEGER NOT NULL DEFAULT 0,
  target_date TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS financial_goals_user_id_idx ON financial_goals (user_id);
