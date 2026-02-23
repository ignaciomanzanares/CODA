-- Migración manual: solo crea las tablas credit_scores y transactional_scores si no existen.
-- No modifica tablas existentes. Para PostgreSQL (Render).

-- credit_scores (una fila por usuario)
CREATE TABLE IF NOT EXISTS credit_scores (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL DEFAULT 850,
  payment_history TEXT NOT NULL,
  utilization TEXT NOT NULL,
  age_of_credit TEXT NOT NULL,
  last_updated TEXT NOT NULL DEFAULT (now()::text)
);

-- Índice para búsqueda por usuario (opcional, evita escaneos completos)
CREATE INDEX IF NOT EXISTS credit_scores_user_id_idx ON credit_scores(user_id);

-- transactional_scores (una fila por usuario; actualizado con cada cartola)
CREATE TABLE IF NOT EXISTS transactional_scores (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  transactional_score INTEGER NOT NULL,
  metrics TEXT,
  main_insights TEXT,
  recommended_products TEXT,
  last_updated TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS transactional_scores_user_id_idx ON transactional_scores(user_id);
