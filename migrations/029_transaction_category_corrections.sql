-- Migration 029: Frente D (#31) del overhaul.
-- transaction_category_corrections: correcciones de categoría del usuario. Alimentan el
-- clasificador incremental (Naive Bayes) que mejora la categorización por sobre las reglas
-- regex (services/documents/categoryClassifier.ts), con las reglas como fallback.

CREATE TABLE IF NOT EXISTS transaction_category_corrections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  normalized_text TEXT NOT NULL,
  original_category TEXT,
  corrected_category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tx_cat_corrections_user_id ON transaction_category_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_cat_corrections_text ON transaction_category_corrections(normalized_text);
