# Trazabilidad algorítmica en runtime (CODA API)

Objetivo: dejar **versión de modelo + entradas/salidas** registradas para cumplimiento NCG 502 / gobierno de modelos, sin depender de la UI de auditoría.

## Tablas

- `algorithm_model_versions`: versiones sembradas al arranque (`ensureSeedTraceabilityModels` en `apps/api/src/index.ts`).
- `algorithm_prediction_logs`: eventos append-only por usuario (`user_id`, `request_id`, `kind`, JSON en `input_features` / `output_snapshot`).

Migración: `migrations/011_algorithm_traceability.sql`.

## Dónde se escribe cada `kind`

| kind | Disparador | Código |
|------|------------|--------|
| `credit_cmf` | Subida y procesamiento de Informe CMF | `logCreditScorePrediction` → `persistCreditPredictionAsync` en `documentUploadService.ts` |
| `transactional_sfa` | Cada `storage.upsertTransactionalScore` | `storage.ts` → `logTransactionalScoreComputationFireAndForget` |
| `product_recommendation` | Lista de recomendaciones | `GET /api/products/recommendations` en `routes.ts` |
| `product_interaction` | Eventos de embudo | `POST /api/products/track` |
| `product_application` | Postulación a producto | `POST /api/products/apply` |

## IDs de modelo sembrados

Definidos en `traceabilityPersistence.ts` (`TRACEABILITY_SEED_MODELS`, `DEFAULT_CREDIT_MODEL_VERSION_ID`).

## API interna (no es UI de auditoría)

- `GET /api/audit/my-algorithm-logs` — historial persistido para el usuario autenticado (límite acotado).

La memoria en `algorithmicTraceability.ts` sigue sirviendo para predicciones CMF en la misma sesión; la **fuente durable** para reporting es `algorithm_prediction_logs`.
