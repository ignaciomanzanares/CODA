-- Migration 034: Eventos de conversión de productos para función de pérdida CTR × tasa conversión.
-- event_type: view (impresión), click (clic en el producto), apply (intención de solicitud), convert (conversión confirmada por el usuario).
-- Permite calcular CTR = clicks/views y conversionRate = conversions/clicks por producto.

CREATE TABLE IF NOT EXISTS product_conversion_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK(event_type IN ('view', 'click', 'apply', 'convert')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS pce_product_id ON product_conversion_events(product_id);
CREATE INDEX IF NOT EXISTS pce_user_id ON product_conversion_events(user_id);
CREATE INDEX IF NOT EXISTS pce_created_at ON product_conversion_events(created_at);
