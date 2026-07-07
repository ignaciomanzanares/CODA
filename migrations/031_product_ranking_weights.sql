-- Migration 031: Frente E (#35) del overhaul.
-- product_ranking_weights: pesos de ranking de productos calculados desde la conversión real del
-- funnel (services/products/productRankingWeights.ts). Cada corrida inserta una fila por producto
-- → historial versionado y auditable. El matching multiplica el rankingScore por el peso vigente.

CREATE TABLE IF NOT EXISTS product_ranking_weights (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  weight REAL NOT NULL,
  conversion_rate REAL,
  version TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_ranking_weights_product ON product_ranking_weights(product_id);
CREATE INDEX IF NOT EXISTS idx_product_ranking_weights_computed_at ON product_ranking_weights(computed_at);
