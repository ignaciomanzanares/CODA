-- 043 — Canal de reclamos y consultas (requisito de autorización NCG 502:
-- canal habilitado, registro por caso, trazabilidad de la resolución).
-- mensaje/respuesta se cifran en reposo desde el API (fieldEncryption).
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tipo TEXT NOT NULL DEFAULT 'reclamo',
  asunto TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto',
  respuesta TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_estado ON support_tickets(estado);
