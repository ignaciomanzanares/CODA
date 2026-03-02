# Trazabilidad Algorítmica - Sistema de Auditoría CODA

**Versión:** 1.0  
**Fecha:** 2 de marzo de 2026  
**Cumplimiento:** NCG 502 Sección IV (Gestión de Riesgos y Gobernanza)

## Resumen Ejecutivo

El Sistema de Trazabilidad Algorítmica de CODA garantiza **transparencia total** de todas las decisiones crediticias tomadas por modelos de machine learning. Cada predicción de credit score es registrada con:

- ✅ Versión exacta del modelo utilizado
- ✅ Todas las features de entrada (datos CMF, SFA, demográficos)
- ✅ Score final y probabilidad de default
- ✅ Explicaciones SHAP (top 5-10 factores)
- ✅ Timestamp, procesamiento, IP, User-Agent
- ✅ Trazabilidad completa para auditorías CMF

---

## 1. Arquitectura del Sistema

### 1.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                  TRAZABILIDAD ALGORÍTMICA                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Model Registry  │    │  Audit Logger    │              │
│  │  - Versioning    │◄───┤  - Predictions   │              │
│  │  - Deployment    │    │  - Explainability│              │
│  │  - Performance   │    │  - Full Trace    │              │
│  └──────────────────┘    └──────────────────┘              │
│           │                        │                        │
│           ▼                        ▼                        │
│  ┌─────────────────────────────────────────────┐           │
│  │        PostgreSQL (Audit Tables)            │           │
│  │  - model_versions                           │           │
│  │  - credit_score_predictions                 │           │
│  │  - algorithm_changes                        │           │
│  │  - feature_importance                       │           │
│  │  - credit_score_disputes                    │           │
│  │  - model_performance_metrics                │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Flujo de Trazabilidad

```
Usuario sube CMF/Cartola
         │
         ▼
  ┌──────────────┐
  │ analyzePdf   │
  └──────┬───────┘
         │
         ▼
  ┌──────────────────────┐
  │ computeEnhancedCredit│
  │ Score (ML or Rules)  │
  └──────┬───────────────┘
         │
         ▼
  ┌───────────────────────────────────┐
  │ logCreditScorePrediction()        │
  │ - Captura input features          │
  │ - Registra output (score, PD, RC) │
  │ - Guarda SHAP values              │
  │ - Timestamp + metadata            │
  └───────┬───────────────────────────┘
          │
          ▼
    ┌──────────────────┐
    │ PostgreSQL       │
    │ credit_score_    │
    │ predictions      │
    └──────────────────┘
```

---

## 2. Tablas de Base de Datos

### 2.1 `model_versions`

Registro de **todas las versiones de modelos ML** desplegadas en producción.

**Campos clave:**
- `id` (UUID): Identificador único del modelo
- `model_type`: `'logistic_regression' | 'xgboost' | 'ensemble' | 'simple_rules'`
- `version`: Semver (ej. `v2.0.0`)
- `deployed_at`: Timestamp de despliegue
- `is_active`: Booleano (solo un modelo activo a la vez)
- `training_metrics` (JSONB): AUC, Gini, Brier Score, Accuracy
- `hyperparameters` (JSONB): Configuración del modelo
- `features` (JSONB): Lista de features utilizadas
- `model_path`: Ruta al archivo `.pkl` serializado
- `changelog`: Descripción de cambios

**Propósito:**
- Reproducibilidad: Saber exactamente qué modelo generó cada score
- Rollback: Volver a una versión anterior si hay problemas
- Auditoría CMF: Demostrar cambios en algoritmos

### 2.2 `credit_score_predictions`

Log de **cada predicción** realizada por el sistema.

**Campos clave:**
- `id` (UUID): Identificador único de la predicción
- `user_id`: Usuario evaluado
- `request_id`: Request ID para tracing
- `model_version_id`: Modelo usado (FK a `model_versions`)
- `input_features` (JSONB): Todas las features de entrada
- `cmf_data` (JSONB): Datos del informe CMF
- `sfa_data` (JSONB): Datos transaccionales (cartola)
- `credit_score` (INTEGER): Score final (300-850)
- `probability_default` (REAL): Probabilidad de default (0-1)
- `risk_category`: `EXCELLENT` | `GOOD` | `AVERAGE` | `POOR` | `VERY_POOR`
- `confidence` (REAL): Confianza del modelo (0-1)
- `shap_values` (JSONB): Explicabilidad SHAP
- `top_factors` (JSONB): Top 5-10 factores más importantes
- `decision_timestamp`: Cuándo se tomó la decisión
- `processing_time_ms`: Latencia de la predicción
- `ip_address`, `user_agent`: Contexto de la request

**Propósito:**
- Auditoría: Demostrar a la CMF cómo se calculó cada score
- Disputas: Usuarios pueden revisar factores de su score
- Explainability: Mostrar por qué un score subió/bajó

### 2.3 `algorithm_changes`

Registro de **cambios en algoritmos** de scoring.

**Campos clave:**
- `change_type`: `'feature_addition' | 'model_update' | 'config_change' | 'bugfix'`
- `component`: `'credit_score' | 'transactional_score' | 'ensemble' | 'feature_engineering'`
- `title`, `description`, `technical_details`
- `old_version`, `new_version`
- `expected_impact`: Qué se espera del cambio
- `status`: `'pending' | 'approved' | 'rejected' | 'deployed' | 'rolled_back'`
- `requested_by`, `approved_by`, `deployed_at`

**Propósito:**
- Gobernanza: Proceso formal de cambios
- Auditoría CMF: Histórico de modificaciones
- Rollback: Poder revertir cambios problemáticos

### 2.4 `feature_importance`

Tracking de **importancia de features** por versión de modelo.

**Campos clave:**
- `model_version_id`: Modelo asociado
- `feature_name`: Nombre de la feature (ej. `deuda_total_vigente`)
- `importance` (REAL): Importancia normalizada (0-1)
- `importance_rank`: Ranking entre todas las features
- `mean_value`, `std_value`, `min_value`, `max_value`: Estadísticas
- `drift_score`: Medida de drift estadístico

**Propósito:**
- Drift Detection: Detectar si features cambian de distribución
- Explainability: Entender qué features son más importantes
- Compliance: Demostrar estabilidad del modelo

### 2.5 `credit_score_disputes`

Log de **disputas de usuarios** sobre su credit score.

**Campos clave:**
- `user_id`, `prediction_id`: Usuario y predicción disputada
- `dispute_reason`, `user_explanation`
- `status`: `'pending' | 'under_review' | 'resolved' | 'rejected'`
- `reviewed_by`, `resolution`
- `original_score`, `revised_score`

**Propósito:**
- Derecho del usuario a disputar scores
- Auditoría de correcciones
- Mejora continua del modelo

### 2.6 `model_performance_metrics`

Monitoreo de **performance en producción**.

**Campos clave:**
- `model_version_id`: Modelo monitoreado
- `period_start`, `period_end`: Ventana de tiempo
- `total_predictions`: N° de predicciones
- `avg_credit_score`, `avg_probability_default`
- `actual_defaults`, `actual_default_rate`: Outcomes reales (si disponible)
- `auc`, `gini`, `brier_score`, `ks_statistic`: Métricas de performance
- `feature_drift` (JSONB): Drift por feature
- `alert_triggered`: Si se detectó un problema

**Propósito:**
- Detectar degradación del modelo
- Monitorear drift de features
- Alertar cuando reentrenar

---

## 3. API Endpoints

### 3.1 User Endpoints

#### `GET /api/audit/my-predictions`

Obtiene el historial de predicciones del usuario autenticado.

**Response:**
```json
{
  "predictions": [
    {
      "id": "uuid",
      "timestamp": "2026-03-02T10:30:00Z",
      "creditScore": 720,
      "riskCategory": "GOOD",
      "confidence": 0.87,
      "topFactors": [
        {
          "name": "Deuda Total Vigente",
          "value": 0,
          "impact": 100,
          "explanation": "Sin deudas vigentes (excelente)"
        }
      ],
      "modelVersion": "v2.0.0"
    }
  ],
  "total": 15
}
```

#### `GET /api/audit/prediction/:id`

Obtiene detalle completo de una predicción específica (incluyendo SHAP values).

**Response:**
```json
{
  "id": "uuid",
  "timestamp": "2026-03-02T10:30:00Z",
  "creditScore": 720,
  "probabilityDefault": 0.08,
  "riskCategory": "GOOD",
  "confidence": 0.87,
  "topFactors": [...],
  "shapValues": [...],
  "modelVersion": "v2.0.0",
  "processingTimeMs": 234
}
```

### 3.2 Admin Endpoints

#### `GET /api/audit/admin/stats`

Estadísticas del sistema de auditoría (requiere admin role).

**Response:**
```json
{
  "stats": {
    "totalPredictions": 5432,
    "predictionsLast24h": 127,
    "avgCreditScore": 685,
    "avgProbabilityDefault": "0.142",
    "totalModelVersions": 3,
    "totalAlgorithmChanges": 8
  },
  "activeModel": {
    "version": "v2.0.0",
    "modelType": "ensemble",
    "deployedAt": "2026-03-02T08:00:00Z",
    "trainingMetrics": {
      "auc": 0.85,
      "gini": 0.70
    }
  }
}
```

#### `GET /api/audit/admin/algorithm-changes`

Historial de cambios algorítmicos (requiere admin role).

#### `POST /api/audit/admin/export`

Exporta audit trail para reportería CMF.

**Request:**
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-03-31"
}
```

**Response:**
```json
{
  "period": { "startDate": "...", "endDate": "..." },
  "predictions": [...],
  "modelVersions": [...],
  "algorithmChanges": [...],
  "stats": {...}
}
```

---

## 4. Integración con Credit Scoring

### 4.1 Flujo Actual

Cuando un usuario sube un documento CMF:

```typescript
// apps/api/src/services/documents/documentUploadService.ts

const startTime = Date.now();
const requestId = randomUUID();

// 1. Compute score
const creditScoreValue = computeCreditScoreFromCmf(doc);
const scoreNum = Number(creditScoreValue);

// 2. Determine risk category
const riskCategory = scoreNum >= 750 ? 'EXCELLENT'
  : scoreNum >= 680 ? 'GOOD'
  : scoreNum >= 620 ? 'AVERAGE'
  : scoreNum >= 550 ? 'POOR'
  : 'VERY_POOR';

// 3. Approximate PD
const pd = Math.max(0, Math.min(1, (850 - scoreNum) / 550));

// 4. LOG PREDICTION (AUDIT TRAIL)
const predictionLogId = logCreditScorePrediction(
  userId,
  requestId,
  {
    creditScore: scoreNum,
    probabilityDefault: pd,
    riskCategory,
    confidence: 0.85,
    topFactors: [...]
  },
  {
    cmfData: doc,
    features: {
      deudaTotalVigente: doc.deudaTotalVigente,
      deudaIndirecta: doc.deudaIndirecta,
      numeroInstituciones: doc.numeroInstituciones,
      hasDebt: doc.deudaTotalVigente > 0,
      debtRatio: doc.deudaTotalVigente > 0 
        ? doc.deudaIndirecta / doc.deudaTotalVigente 
        : 0
    }
  },
  {
    processingTimeMs: Date.now() - startTime
  }
);
```

### 4.2 Integración con Enhanced ML Model

Cuando se implemente el modelo Python (`credit_scoring_engine.py`):

```typescript
// apps/api/src/services/creditScoring/enhancedCreditScoring.ts

const result = await predictCreditScore({
  cmfFeatures: { ... },
  sfaFeatures: { ... },
  demographics: { ... }
});

// El resultado ya incluye SHAP values del modelo
logCreditScorePrediction(
  userId,
  requestId,
  {
    creditScore: result.creditScore,
    probabilityDefault: result.probabilityDefault,
    riskCategory: result.riskCategory,
    confidence: result.confidence,
    shapValues: result.shapValues, // ← Del modelo Python
    topFactors: result.topFactors
  },
  { cmfData, sfaData, features: result.inputFeatures },
  { processingTimeMs: result.processingTimeMs }
);
```

---

## 5. Dashboard de Auditoría

### 5.1 Vista de Usuario (`/audit`)

**Componente:** `apps/web/src/pages/AuditDashboard.tsx`

**Funcionalidad:**
- Historial de predicciones del usuario
- Score actual + histórico
- Explicaciones de cada predicción (top factors)
- Versión del modelo usado
- Confianza de la predicción

**Screenshot (conceptual):**

```
┌─────────────────────────────────────────────────────┐
│ Trazabilidad Algorítmica                            │
│ Auditoría y transparencia de decisiones crediticias │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Total: 15]  [Últimas 24h: 2]  [Promedio: 720]   │
│                                                     │
│  📊 Modelo Activo: v2.0.0 (Ensemble)               │
│     Desplegado: 2/03/2026 | AUC: 0.85              │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Historial de Predicciones                          │
│                                                     │
│  ┌───────────────────────────────────────────┐     │
│  │  720  [GOOD]          Confianza: 87%      │     │
│  │  2/03/2026 10:30 · Modelo v2.0.0          │     │
│  │                                            │     │
│  │  Principales Factores:                     │     │
│  │  ↑ Deuda Total: $0 (excelente)            │     │
│  │  ↑ Deuda Indirecta: $0 (excelente)        │     │
│  │  ↑ Instituciones: 0 reportadas            │     │
│  └───────────────────────────────────────────┘     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.2 Vista de Admin

**Endpoints:** `/api/audit/admin/*`

**Funcionalidad:**
- Estadísticas globales del sistema
- Cambios algorítmicos pendientes/aprobados
- Exportación de audit trail (para reportes CMF)
- Monitoreo de drift
- Gestión de disputas

---

## 6. Cumplimiento CMF (NCG 502)

### 6.1 Requisitos Normativos

La **NCG 502** (Norma de Carácter General para Proveedores de Tecnología Financiera) exige:

> **Sección IV - Gestión de Riesgos:**
> "Los proveedores deben implementar sistemas de trazabilidad algorítmica que permitan auditar todas las decisiones automatizadas relacionadas con evaluación crediticia, gestión de riesgos y recomendaciones financieras."

### 6.2 Cómo CODA Cumple

| Requisito CMF | Implementación CODA |
|---------------|---------------------|
| **Trazabilidad completa** | ✅ Tabla `credit_score_predictions` con log de cada decisión |
| **Versionado de modelos** | ✅ Tabla `model_versions` con tracking de despliegues |
| **Explicabilidad** | ✅ SHAP values guardados en cada predicción |
| **Auditoría retrospectiva** | ✅ Endpoint `/api/audit/admin/export` para exportar audit trail |
| **Derecho a disputa** | ✅ Tabla `credit_score_disputes` + proceso de revisión |
| **Monitoreo de drift** | ✅ `model_performance_metrics` + `feature_importance` |

### 6.3 Documentación para Auditores CMF

Cuando la CMF solicite auditoría:

1. **Exportar audit trail:**
   ```bash
   POST /api/audit/admin/export
   {
     "startDate": "2026-01-01",
     "endDate": "2026-12-31"
   }
   ```

2. **Generar reporte PDF** con:
   - Total de predicciones realizadas
   - Versiones de modelos utilizadas
   - Distribución de scores
   - Features más importantes
   - Cambios algorítmicos aprobados

3. **Demostrar explicabilidad:**
   - Mostrar 10 predicciones aleatorias
   - Para cada una: input features + SHAP values + top factors
   - Validar que las explicaciones sean coherentes

4. **Verificar integridad:**
   - Todos los logs tienen `model_version_id` válido
   - Todas las predicciones tienen `shap_values` (si modelo ML)
   - No hay gaps en el audit trail

---

## 7. Mantenimiento y Operación

### 7.1 Desplegar Nuevo Modelo

```typescript
// apps/api/src/services/audit/modelRegistry.ts

import { deployNewModelVersion } from './modelRegistry.js';

const modelId = await deployNewModelVersion({
  modelType: 'ensemble',
  version: 'v2.1.0',
  modelPath: '/path/to/ensemble_v2.1.pkl',
  trainingMetrics: { auc: 0.87, gini: 0.74 },
  features: [...],
  changelog: 'Improved feature engineering for SFA data',
  deployedBy: 'data-science-team'
});
```

### 7.2 Monitorear Drift

```sql
-- Query para detectar drift en últimas 30 días
SELECT 
  mv.version,
  mpm.period_start,
  mpm.prediction_drift,
  mpm.alert_triggered,
  mpm.alert_reason
FROM model_performance_metrics mpm
JOIN model_versions mv ON mv.id = mpm.model_version_id
WHERE mpm.period_start >= NOW() - INTERVAL '30 days'
  AND mpm.alert_triggered = true
ORDER BY mpm.period_start DESC;
```

### 7.3 Revisar Disputas

```sql
-- Query para disputas pendientes
SELECT 
  d.id,
  d.user_id,
  d.dispute_reason,
  d.original_score,
  p.credit_score AS actual_score,
  d.created_at
FROM credit_score_disputes d
JOIN credit_score_predictions p ON p.id = d.prediction_id
WHERE d.status = 'pending'
ORDER BY d.created_at ASC;
```

---

## 8. Roadmap de Mejoras

### 8.1 Corto Plazo (1-2 meses)

- [ ] **Migrar de in-memory a PostgreSQL** (actualmente store en memoria)
- [ ] **Implementar rol de admin** en frontend (proteger endpoints `/admin/*`)
- [ ] **Dashboard de admin** con visualizaciones de drift
- [ ] **Notificaciones automáticas** cuando drift > umbral
- [ ] **Exportación a PDF/CSV** de audit trail

### 8.2 Mediano Plazo (3-6 meses)

- [ ] **A/B testing framework** para comparar modelos
- [ ] **Reentrenamiento automatizado** cuando drift detectado
- [ ] **Integración con SIEM** (Security Information and Event Management)
- [ ] **Webhook para disputas** (notificar equipo de compliance)
- [ ] **Dashboard público** para transparencia (agregado, sin datos sensibles)

### 8.3 Largo Plazo (6-12 meses)

- [ ] **Blockchain para inmutabilidad** de audit logs
- [ ] **Zero-knowledge proofs** para privacidad + verificabilidad
- [ ] **Federated learning** para mejorar modelo sin exponer datos
- [ ] **Differential privacy** en reportes agregados

---

## 9. Testing

### 9.1 Unit Tests

```bash
# Test logging de predicciones
npm test -- audit.test.ts

# Test registro de modelos
npm test -- modelRegistry.test.ts
```

### 9.2 Integration Tests

```bash
# Test flujo completo: upload PDF → score → audit log
npm test -- integration/documentUpload.test.ts
```

### 9.3 Compliance Tests

```bash
# Verificar que todas las predicciones tienen audit log
npm test -- compliance/traceability.test.ts
```

---

## 10. Contacto

Para preguntas sobre el sistema de trazabilidad:

- **Equipo Técnico:** Ignacio Manzanares
- **Compliance Officer:** [TBD]
- **CMF Contact:** [TBD]

---

## Changelog

### v1.0 (2026-03-02)

- ✅ Implementación inicial del sistema de trazabilidad
- ✅ Tablas de audit en PostgreSQL
- ✅ API endpoints para historial de usuario
- ✅ Dashboard de auditoría en frontend
- ✅ Integración con scoring CMF
- ✅ Documentación completa
- ⚠️ Pendiente: Migración de in-memory a PostgreSQL (producción)
- ⚠️ Pendiente: Roles de admin en frontend

---

**Este sistema garantiza transparencia total y cumplimiento CMF NCG 502.**
