-- Fase C del doble evaluador de riesgo: el score transaccional heurístico (sfaScoringEngine) fue
-- eliminado. Al subir cartola solo se persisten las MÉTRICAS de liquidez (que consume el motor de
-- salud); el SCORE lo produce el modelo XGB bajo demanda y puede no existir. La columna pasa a nullable.
ALTER TABLE transactional_scores ALTER COLUMN transactional_score DROP NOT NULL;
