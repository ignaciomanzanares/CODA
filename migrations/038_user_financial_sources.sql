-- Migration 038: fuentes de datos institucionales conectadas por el usuario (Fase 5).
-- AFP (cotizaciones), SII (renta), Tesorería (deuda fiscal). Una fila por usuario+fuente.
-- Los datos se extraen del PDF oficial que el usuario sube con Clave Única (no manejamos
-- credenciales). Alimenta los ratios de salud financiera.

CREATE TABLE IF NOT EXISTS user_financial_sources (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source                      TEXT NOT NULL,
  verified_monthly_income_clp INTEGER,
  fiscal_debt_clp             INTEGER,
  contribution_months         INTEGER,
  raw_data                    TEXT,
  extracted_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Una fila por (usuario, fuente): el upsert reemplaza el dato anterior de esa fuente.
CREATE UNIQUE INDEX IF NOT EXISTS user_financial_sources_user_source_unique
  ON user_financial_sources(user_id, source);
