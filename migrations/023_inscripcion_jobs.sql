-- Migration 023: Jobs de OCR de inscripción (CBR escaneada).
-- El OCR mupdf+tesseract tarda demasiado para correr sincrónico (~200s en el
-- instance free de Render → timeout del request). Solo las inscripciones SIN
-- capa de texto lo disparan. El endpoint encola un job y responde 202; un worker
-- en proceso lo completa fuera del ciclo del request y guarda el prefill aquí.
-- `result` es el payload del prefill como JSON en TEXT (el esquema es dual
-- SQLite/Postgres, sin tipo jsonb; todo el JSON del proyecto se persiste así).
CREATE TABLE IF NOT EXISTS inscripcion_jobs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL DEFAULT 'processing',  -- processing | done | error
  result     TEXT,                                -- JSON del prefill cuando status=done
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- El polling y el barrido buscan por dueño / estado.
CREATE INDEX IF NOT EXISTS idx_inscripcion_jobs_user ON inscripcion_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_inscripcion_jobs_status ON inscripcion_jobs(status);
