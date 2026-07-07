-- Migration 033: A/B testing de versiones de modelo.
-- ab_traffic_pct: porcentaje de tráfico asignado a esta versión (0-100).
-- Cuando hay 2 versiones activas del mismo modelType, se samplea según esta proporción.
-- Default 100 = toda la producción (comportamiento anterior sin cambios).

ALTER TABLE algorithm_model_versions ADD COLUMN IF NOT EXISTS ab_traffic_pct REAL DEFAULT 100;
