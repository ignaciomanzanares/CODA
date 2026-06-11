-- Migration 021: Caché de indicadores económicos (UF, dólar) por fecha, en CLP.
-- Fuente: mindicador.cl. Se cachea por (kind, date) para no refetchar.
-- Usado por el parser de TC internacional (USD→CLP) y el extractor de
-- inscripciones de propiedad (UF→CLP).
CREATE TABLE IF NOT EXISTS indicator_values (
  id         TEXT PRIMARY KEY,            -- `${kind}:${date}`
  kind       TEXT NOT NULL,               -- 'uf' | 'usd'
  date       TEXT NOT NULL,               -- ISO yyyy-mm-dd
  value_clp  REAL NOT NULL,               -- valor en CLP de 1 unidad ese día
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_values_kind_date
  ON indicator_values(kind, date);
