-- Migration 030: Frente E (#34) del overhaul.
-- habit_recommendations_log: snapshot de los ratios de salud financiera al momento de recomendar
-- cada hábito, para medir efectividad comparando contra el siguiente ciclo del usuario.

CREATE TABLE IF NOT EXISTS habit_recommendations_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  habit_key TEXT NOT NULL,
  nivel INTEGER,
  deuda_flujo REAL,
  deuda_activos REAL,
  ahorro_ingreso REAL,
  dias_mora INTEGER,
  mora_activa INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_habit_rec_log_user_id ON habit_recommendations_log(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_rec_log_user_habit ON habit_recommendations_log(user_id, habit_key);
