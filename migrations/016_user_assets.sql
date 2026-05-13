-- Registro de activos del usuario (propiedades, vehículos, criptoactivos, inversiones, otros).
-- Usado para calcular el ratio deuda/activos en el motor de evaluación de salud financiera v2.
-- Integraciones futuras: CBR (propiedades), Registro Civil (vehículos), wallets cripto.

CREATE TABLE IF NOT EXISTS user_assets (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL CHECK(type IN ('property','vehicle','crypto','investment','other')),
  name                  TEXT NOT NULL,
  acquisition_cost_clp  INTEGER NOT NULL,
  estimated_value_clp   INTEGER,
  has_lien              INTEGER NOT NULL DEFAULT 0,
  lien_amount_clp       INTEGER,
  currency              TEXT NOT NULL DEFAULT 'CLP',
  document_id           TEXT REFERENCES document_uploads(id),
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
