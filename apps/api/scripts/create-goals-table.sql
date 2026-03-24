-- Tabla financial_goals (PostgreSQL) — alineada con packages/src/schema.ts (Drizzle).
-- Si en Render falla crear metas con error de relación inexistente, ejecutar:
--   psql "$DATABASE_URL" -f apps/api/scripts/create-goals-table.sql
-- (External URL del Postgres con sslmode=require si aplica.)

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
