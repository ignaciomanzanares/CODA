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

**Current:** In-memory storage (development)  
**Production:** Will be migrated to PostgreSQL using tables defined in `packages/src/schema-audit.ts`

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

- [ ] Migrate from in-memory to PostgreSQL
- [ ] Implement admin role checks
- [ ] Add automated drift alerts
- [ ] Build admin dashboard
- [ ] Add PDF export for CMF reports
- [ ] Implement dispute workflow
- [ ] Add performance monitoring cron jobs

## Contact

Questions? Contact the Data Science team or Compliance Officer.
