-- Migration 036: campos de catálogo unificado en financial_products (Fase 1b).
-- Consolida los 3 catálogos (productCatalog.ts en memoria, products.seed.json del front, seed.ts)
-- en la tabla financial_products como fuente única. Estas columnas soportan el seed idempotente
-- (slug), el disclosure legal en el marketplace, y la trazabilidad de procedencia de datos.

ALTER TABLE financial_products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE financial_products ADD COLUMN IF NOT EXISTS disclosure TEXT;
ALTER TABLE financial_products ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE financial_products ADD COLUMN IF NOT EXISTS last_verified TEXT;

-- Idempotencia del seed (scripts/seedProductCatalog.ts hace upsert por slug).
CREATE UNIQUE INDEX IF NOT EXISTS financial_products_slug_unique ON financial_products(slug) WHERE slug IS NOT NULL;
