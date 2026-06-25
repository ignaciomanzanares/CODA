# Audit & Traceability Services

## Overview

This directory contains the **Algorithmic Traceability System** for CODA, implementing full audit capabilities for credit scoring decisions as required by CMF regulation NCG 502.

## Files

### `algorithmicTraceability.ts`

Core audit logging service.

**Exports:**
- `logCreditScorePrediction()` - Log every credit score prediction
- `registerModelVersion()` - Register new ML model versions
- `getActiveModelVersion()` - Get currently active model
- `getPrediction()` - Retrieve prediction by ID
- `getUserPredictionHistory()` - Get user's prediction history
- `registerAlgorithmChange()` - Log algorithm changes
- `getAllAlgorithmChanges()` - Get algorithm change log
- `getAuditStats()` - Get system statistics
- `exportAuditTrail()` - Export for CMF reporting
- `initializeTraceabilitySystem()` - Initialize on startup

**Usage:**

```typescript
import { logCreditScorePrediction } from './audit/algorithmicTraceability.js';

// After computing a credit score
const predictionId = logCreditScorePrediction(
  userId,
  requestId,
  {
    creditScore: 720,
    probabilityDefault: 0.08,
    riskCategory: 'GOOD',
    confidence: 0.87,
    shapValues: [...],
    topFactors: [...]
  },
  {
    cmfData: doc,
    features: {...}
  },
  {
    processingTimeMs: 234,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }
);
```

### `modelRegistry.ts`

ML model version management.

**Exports:**
- `deployNewModelVersion()` - Deploy new model to production
- `registerEnhancedMLModel()` - Register the v2.0.0 ensemble model

**Usage:**

```typescript
import { deployNewModelVersion } from './audit/modelRegistry.js';

const modelId = await deployNewModelVersion({
  modelType: 'ensemble',
  version: 'v2.1.0',
  modelPath: '/path/to/model.pkl',
  trainingMetrics: { auc: 0.87 },
  changelog: 'Improved XGBoost hyperparameters',
  deployedBy: 'data-team'
});
```

## Storage

**Persistencia síncrona:** `logCreditScorePrediction()` y los demás `log*` de `traceabilityPersistence.ts` hacen `await db.insert(...)` en `algorithm_prediction_logs` **antes** de devolver el id — ya no es fire-and-forget. El `Map` en memoria de `algorithmicTraceability.ts` (`TraceabilityStore`) es solo un cache de lectura rápida, poblado después de que el insert en Postgres confirma; un crash del proceso ya no pierde una decisión que el cliente ya recibió como respuesta.

**Persistido en BD:** `algorithm_model_versions` + `algorithm_prediction_logs` con `kind`:

| kind | Origen |
|------|--------|
| `credit_cmf` | `logCreditScorePrediction` tras Informe CMF (`documentUploadService`) |
| `transactional_sfa` | `storage.upsertTransactionalScore` (cartola, simulación SFA, etc.) |
| `product_recommendation` | `GET /api/products/recommendations` |
| `product_interaction` | `POST /api/products/track` (view, click, …) |
| `product_application` | `POST /api/products/apply` |

Cada `upsertTransactionalScore` puede incluir `algorithmInputs` (p. ej. `pipeline`, conteos). Recomendaciones registran `matchingEngineVersion` en el snapshot de entrada. Ver `docs/TRACEABILITY_RUNTIME.md`. Endpoint: `GET /api/audit/my-algorithm-logs?limit=40` (auditoría UI aparte).

## Cifrado de columna (pseudonimización)

`inputFeatures`, `outputSnapshot`, `cmfData`, `sfaData` y `topFactors` se cifran (AES-256-GCM, `services/crypto/fieldEncryption.ts`) antes de persistirse — contienen datos financieros y, en `cmfData`, el RUT del titular del informe CMF. La lectura (`listAlgorithmPredictionLogsForUser`) descifra de forma transparente; filas antiguas sin cifrar se siguen leyendo bien (`looksEncrypted()` detecta el formato).

## Tensión NCG 502 vs. Ley 19.628/21.719 (borrado de cuenta)

NCG 502 exige conservar el registro de cada decisión algorítmica (modelo, score, versión, fecha). La Ley 19.628/21.719 exige poder borrar/anonimizar la PII de un usuario que cierra su cuenta. Resolución adoptada (ver `services/privacy/accountAnonymization.ts`): al anonimizar una cuenta, la fila de `algorithm_prediction_logs` **no se borra** (se conserva el hecho de que se tomó una decisión, con qué modelo y qué score), pero:
- `userId` se reemplaza por el id de una única fila placeholder compartida por todas las cuentas anonimizadas (`anon-placeholder-system-user`, ver `accountAnonymization.ts`) — no un hash por usuario, porque `algorithm_prediction_logs.user_id` tiene FK `NOT NULL` a `users.id` y no hay fila real con un id sintético derivado. Al compartir un mismo id, no se puede saber a qué usuario anonimizado correspondía un log puntual.
- `inputFeatures`, `cmfData`, `sfaData` y `topFactors` se sobrescriben con un placeholder (la PII/datos financieros de entrada ya no son necesarios para la trazabilidad regulatoria, que solo exige la salida del modelo).
- `outputSnapshot` (score, categoría de riesgo, modelo) se conserva intacto — es el objeto de la trazabilidad NCG 502.

`consent_grants`/`privacy_consent_events` tampoco se borran al anonimizar (son la prueba de que el usuario consintió y luego revocó, exigida por la propia ley); solo se anonimizan `ipAddress`/`userAgent`.

## Alcance del cifrado (qué falta y por qué)

`email`/`username` de `users` y los RUT (`empresas_bank_transactions.counterpartyRut`, `empresas_dte_documents.emitterRut/receiverRut`, `empresas_purchase_orders.customerRut`, etc.) **no están cifrados todavía**: se usan en `WHERE`/`JOIN`/`ORDER BY` (login por email, conciliación bancaria por RUT) y AES-GCM con IV aleatorio no soporta búsqueda por igualdad sobre el ciphertext. Cifrarlos requiere agregar una columna de blind index (HMAC determinístico) para igualdad antes de cifrar el valor visible — pendiente, ver `scripts/encrypt-existing-data.ts` para el detalle de qué sí quedó cubierto en este pase (`firstName/lastName/totpSecret/backupCodes`, `document_uploads.parsedData`, `score_document_uploads.parsedData`, y los campos de `algorithm_prediction_logs` de esta sección).

## Database Schema

See: `packages/src/schema-audit.ts`

Tables:
- `model_versions` - ML model version registry
- `credit_score_predictions` - Audit log of all predictions
- `algorithm_changes` - Change log for algorithms
- `feature_importance` - Feature importance tracking
- `credit_score_disputes` - User disputes
- `model_performance_metrics` - Drift monitoring

## Migration

Run migration to create audit tables:

```bash
# Production (PostgreSQL)
npm run db:migrate

# The migration file is: migrations/0004_add_audit_tables.sql
```

## API Routes

See: `apps/api/src/routes-audit.ts`

**User endpoints:**
- `GET /api/audit/my-predictions` - User's prediction history
- `GET /api/audit/prediction/:id` - Prediction details

**Admin endpoints:**
- `GET /api/audit/admin/stats` - System statistics
- `GET /api/audit/admin/algorithm-changes` - Change log
- `POST /api/audit/admin/export` - Export audit trail

## Frontend

**Dashboard:** `apps/web/src/pages/AuditDashboard.tsx`

Accessible at `/audit` for authenticated users.

## Compliance

This system ensures compliance with:

- ✅ **NCG 502 Section IV** (Risk Management & Governance)
- ✅ **Algorithmic Transparency** (every decision logged)
- ✅ **Explainability** (SHAP values for every prediction)
- ✅ **Right to Dispute** (users can challenge scores)
- ✅ **Drift Monitoring** (detect model degradation)

## Testing

```bash
# Unit tests
npm test -- audit.test.ts

# Integration tests
npm test -- integration/audit.test.ts

# Compliance tests
npm test -- compliance/traceability.test.ts
```

## TODO

- [ ] Implement admin role checks
- [ ] Add automated drift alerts
- [ ] Build admin dashboard
- [ ] Add PDF export for CMF reports
- [ ] Implement dispute workflow
- [ ] Add performance monitoring cron jobs

## Contact

Questions? Contact the Data Science team or Compliance Officer.
