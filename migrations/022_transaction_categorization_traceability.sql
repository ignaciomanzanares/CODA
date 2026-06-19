-- Migration 022: Trazabilidad de categorización de transacciones (Batch 10).
-- CMF NCG 502 (trazabilidad algorítmica): cada categorización registra qué regla
-- la produjo, con qué confianza y con qué versión del motor, de modo que toda
-- decisión sea explicable. Las columnas category/subcategory ya existen.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_confidence REAL,
  ADD COLUMN IF NOT EXISTS category_rule_id    TEXT,
  ADD COLUMN IF NOT EXISTS categorizer_version TEXT;
