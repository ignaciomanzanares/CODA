# Motor de Credit Scoring Robusto para CODA
## Diseño Técnico Completo

**Autor:** AI Assistant (Cursor)  
**Fecha:** 2 de Marzo, 2026  
**Referencias:** 
- "The Value of Open Banking Data for Application Credit Scoring" (Hjelkrem et al., 2022)
- "XGBoost: A Scalable Tree Boosting System" (Chen & Guestrin, 2016)
- Notebooks de análisis credit risk (Google Colab)
- Business Plan CODA v.1

---

## 🎯 Objetivo

Construir un **motor de credit scoring de clase mundial** que:

1. ✅ Combine datos tradicionales (CMF) con datos transaccionales (Open Banking/SFA)
2. ✅ Use modelos estadísticamente sólidos y validados (Logistic Regression, XGBoost, Deep Learning)
3. ✅ Sea explicable y transparente (cumplimiento regulatorio CMF)
4. ✅ Supere significativamente al modelo actual (simulado)
5. ✅ Escale a producción con bajo latency (<500ms por predicción)

---

## 📊 Hallazgos de la Investigación

### Paper: "The Value of Open Banking Data" (2022)

**Resultados clave:**
- Los datos de Open Banking (transacciones 90 días) son **sorprendentemente predictivos** de default
- Deep Learning sobre transacciones raw **supera** a modelos tradicionales con features manuales
- **Ensemble model** (Open Banking + Traditional data) es el mejor performer
- Datos transaccionales contienen **más valor predictivo** que bureau data para nuevos clientes

**Arquitectura sugerida:**
```
Input Layer (transacciones 90 días)
    ↓
CNN/LSTM (feature extraction automática)
    ↓
Embedding Layer (128 dims)
    ↓
Dense Layers + Dropout
    ↓
Ensemble con Logistic Regression/XGBoost
    ↓
Output: Probability of Default (PD)
```

**Métricas de performance:**
- AUC (Area Under ROC Curve): 0.75-0.85 (objetivo)
- Brier Score: <0.15 (objetivo)
- Gini coefficient: >0.50 (objetivo)

### XGBoost Paper (2016)

**Ventajas para credit scoring:**
- Maneja **sparse data** y missing values naturalmente
- **Regularización** (L1/L2) evita overfitting
- **Feature importance** automática (explicabilidad)
- **Escalable** a datasets grandes (billones de ejemplos)
- Ganador en 17/29 competencias Kaggle 2015

**Hiperparámetros clave:**
```python
{
    'max_depth': 6,
    'learning_rate': 0.01,
    'n_estimators': 500,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'reg_alpha': 0.1,  # L1
    'reg_lambda': 1.0,  # L2
    'scale_pos_weight': ratio_neg/ratio_pos  # class imbalance
}
```

---

## 🏗️ Arquitectura del Motor de Credit Scoring

### Módulos Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    CODA Credit Scoring Engine                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────────┐  ┌──────────────────────────────┐   │
│  │ Feature Engine    │  │ Model Ensemble               │   │
│  ├───────────────────┤  ├──────────────────────────────┤   │
│  │ • CMF Features    │  │ • Logistic Regression (base) │   │
│  │ • SFA Features    │──▶│ • XGBoost (tree-based)       │   │
│  │ • Transactional   │  │ • Deep Learning (optional)   │   │
│  │ • Demographics    │  │ • Voting/Stacking ensemble   │   │
│  └───────────────────┘  └──────────────────────────────┘   │
│           │                        │                         │
│           ▼                        ▼                         │
│  ┌───────────────────┐  ┌──────────────────────────────┐   │
│  │ Preprocessing     │  │ Prediction & Calibration     │   │
│  ├───────────────────┤  ├──────────────────────────────┤   │
│  │ • Imputation      │  │ • PD (Probability Default)   │   │
│  │ • Scaling         │  │ • Score (300-850)            │   │
│  │ • Encoding        │  │ • Calibration curve          │   │
│  └───────────────────┘  └──────────────────────────────┘   │
│                                   │                          │
│                                   ▼                          │
│                        ┌──────────────────────────────┐     │
│                        │ Explainability & Monitoring  │     │
│                        ├──────────────────────────────┤     │
│                        │ • SHAP values                │     │
│                        │ • Feature importance         │     │
│                        │ • Adverse action reasons     │     │
│                        │ • Model drift detection      │     │
│                        └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Features Engineering

### 1. CMF Features (Informe de Deudas)

```typescript
interface CmfFeatures {
  // Raw data
  deudaTotalVigente: number;          // Deuda total en CLP
  deudaIndirecta: number;             // Deuda como codeudor/avalista
  numeroInstituciones: number;        // Cantidad de instituciones
  
  // Engineered features
  hasDebt: boolean;                   // Tiene deuda (0/1)
  debtRatio: number;                  // Deuda indirecta / total
  debtPerInstitution: number;         // Promedio por institución
  institutionDiversity: number;       // Diversificación
}
```

### 2. SFA Transactional Features (Cartolas)

```typescript
interface SfaTransactionalFeatures {
  // Liquidez
  avgMonthlyBalance: number;          // Saldo promedio mensual
  minBalance: number;                 // Saldo mínimo
  maxBalance: number;                 // Saldo máximo
  balanceVolatility: number;          // Volatilidad (std dev)
  
  // Flujo de caja
  totalIncome: number;                // Ingresos totales (abonos)
  totalExpenses: number;              // Gastos totales (cargos)
  netCashFlow: number;                // Flujo neto
  incomeRegularity: number;           // Regularidad de ingresos (0-1)
  
  // Comportamiento
  numTransactions: number;            // Cantidad transacciones
  avgTransactionSize: number;         // Tamaño promedio
  numOverdrafts: number;              // Número de sobregiros
  overdraftDays: number;              // Días en sobregiro
  
  // Categorías (si disponible)
  discretionarySpendingRatio: number; // % gasto discrecional
  essentialSpendingRatio: number;     // % gasto esencial
}
```

### 3. Ratios y Features Derivadas

```typescript
interface DerivedFeatures {
  // Capacity to Pay
  debtToIncomeRatio: number;          // Total debt / monthly income
  loanToIncomeRatio: number;          // Loan requested / monthly income
  
  // Stability
  employmentStability: number;        // Employment length score
  incomeStability: number;            // Income volatility score
  
  // Behavior
  savingsRate: number;                // (Income - Expenses) / Income
  transactionConsistency: number;     // Transaction pattern regularity
  
  // Risk indicators
  hasDefaultHistory: boolean;         // Default en CMF (Y/N)
  overdraftFrequency: number;         // Frecuencia sobregiros/mes
  latePaymentIndicators: number;      // Indicadores pago tardío
}
```

---

## 🤖 Modelos Estadísticos

### Modelo 1: Logistic Regression (Baseline)

**Uso:** Baseline interpretable, fast inference

**Formula:**
```
P(default = 1 | X) = 1 / (1 + e^(-(β₀ + β₁x₁ + β₂x₂ + ... + βₙxₙ)))
```

**Ventajas:**
- ✅ Altamente interpretable (coeficientes = impacto)
- ✅ Fast training & inference (<10ms)
- ✅ Bien entendido por reguladores
- ✅ Coefficients tienen significado directo

**Desventajas:**
- ❌ Asume relaciones lineales
- ❌ No captura interacciones complejas
- ❌ Requiere feature engineering manual

**Implementación:**
```python
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# Regularización L2 para evitar overfitting
lr_model = LogisticRegression(
    penalty='l2',
    C=1.0,  # Inverse regularization strength
    class_weight='balanced',  # Handle imbalance
    max_iter=1000,
    random_state=42
)
```

### Modelo 2: XGBoost (Production Model)

**Uso:** Modelo principal de producción

**Ventajas:**
- ✅ Mejor performance (AUC típicamente +5-10% vs LR)
- ✅ Captura interacciones no-lineales
- ✅ Maneja missing values nativamente
- ✅ Feature importance automática
- ✅ Regularización built-in

**Implementación:**
```python
import xgboost as xgb

xgb_model = xgb.XGBClassifier(
    max_depth=6,
    learning_rate=0.01,
    n_estimators=500,
    subsample=0.8,
    colsample_bytree=0.8,
    gamma=0.1,
    reg_alpha=0.1,    # L1 regularization
    reg_lambda=1.0,   # L2 regularization
    scale_pos_weight=(count_neg / count_pos),
    eval_metric='auc',
    early_stopping_rounds=50,
    random_state=42
)
```

### Modelo 3: Deep Learning (Advanced, Optional)

**Uso:** Extracción automática de features de transacciones raw

**Arquitectura:**
```python
import tensorflow as tf

# CNN para capturar patrones temporales
model = tf.keras.Sequential([
    # Input: [batch, 90 días, N transacciones/día]
    tf.keras.layers.Input(shape=(90, 30)),
    
    # Conv1D para patrones intra-día
    tf.keras.layers.Conv1D(64, 3, activation='relu'),
    tf.keras.layers.MaxPooling1D(2),
    tf.keras.layers.Dropout(0.3),
    
    # Conv1D para patrones inter-días
    tf.keras.layers.Conv1D(128, 5, activation='relu'),
    tf.keras.layers.MaxPooling1D(2),
    tf.keras.layers.Dropout(0.3),
    
    # Flatten y dense layers
    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(128, activation='relu'),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(64, activation='relu'),
    
    # Output: Probability of default
    tf.keras.layers.Dense(1, activation='sigmoid')
])
```

**Ventajas:**
- ✅ Aprende features automáticamente
- ✅ Captura patrones complejos en secuencias
- ✅ No requiere feature engineering manual

**Desventajas:**
- ❌ Requiere más datos (>10K samples)
- ❌ Menos interpretable (requiere SHAP/LIME)
- ❌ Mayor latency (50-200ms)
- ❌ Más complejo de deployar

---

## 🎭 Ensemble Strategy

### Voting Ensemble (Recomendado)

```python
from sklearn.ensemble import VotingClassifier

# Pesos basados en performance en validation set
ensemble = VotingClassifier(
    estimators=[
        ('lr', logistic_regression_model),
        ('xgb', xgboost_model),
        # ('dl', deep_learning_wrapper)  # opcional
    ],
    voting='soft',  # Probability-based
    weights=[0.3, 0.7]  # XGBoost domina, LR para estabilidad
)
```

**Rationale:**
- XGBoost: 70% weight (mejor performance)
- Logistic Regression: 30% weight (estabilidad, interpretabilidad)
- Deep Learning: Opcional, solo si mejora AUC >2%

---

## 📈 Calibración y Scoring

### 1. Calibración de Probabilidades

**Problema:** Los modelos de ML no siempre producen probabilidades bien calibradas

**Solución:** Isotonic Regression o Platt Scaling

```python
from sklearn.calibration import CalibratedClassifierCV

# Calibrar probabilities
calibrated_model = CalibratedClassifierCV(
    base_estimator=xgb_model,
    method='isotonic',  # o 'sigmoid' para Platt scaling
    cv=5
)
```

### 2. Conversión a Score (300-850)

**Formula:**
```python
def probability_to_score(pd: float, min_score=300, max_score=850):
    """
    Convierte Probability of Default (PD) a credit score.
    PD bajo → Score alto
    PD alto → Score bajo
    """
    # Log-odds transformation para mejor distribución
    odds = (1 - pd) / max(pd, 0.001)  # Avoid division by zero
    log_odds = np.log(odds)
    
    # Escalar a rango 300-850
    # Calibrar offset y scale basado en distribución deseada
    offset = 600  # Score promedio
    scale = 100   # Sensibilidad
    
    score = offset + scale * log_odds
    score = np.clip(score, min_score, max_score)
    
    return round(score)
```

### 3. Score Buckets & Risk Categories

```python
RISK_CATEGORIES = {
    'EXCELLENT': (750, 850),  # PD < 5%
    'GOOD':      (680, 749),  # PD 5-10%
    'AVERAGE':   (620, 679),  # PD 10-20%
    'POOR':      (550, 619),  # PD 20-40%
    'VERY_POOR': (300, 549),  # PD > 40%
}
```

---

## 🔍 Explicabilidad (SHAP Values)

### Implementación

```python
import shap

# SHAP explainer for XGBoost
explainer = shap.TreeExplainer(xgb_model)

def explain_prediction(features):
    # Calculate SHAP values
    shap_values = explainer.shap_values(features)
    
    # Top 5 features impacting the score
    feature_importance = pd.DataFrame({
        'feature': feature_names,
        'impact': shap_values[0],
        'value': features[0]
    }).sort_values('impact', key=abs, ascending=False).head(5)
    
    return feature_importance
```

### Output Example

```json
{
  "score": 680,
  "pd": 0.08,
  "risk_category": "GOOD",
  "top_factors": [
    {
      "feature": "debtToIncomeRatio",
      "value": 0.35,
      "impact": -15,
      "direction": "negative"
    },
    {
      "feature": "incomeRegularity",
      "value": 0.85,
      "impact": +25,
      "direction": "positive"
    },
    {
      "feature": "hasDefaultHistory",
      "value": false,
      "impact": +30,
      "direction": "positive"
    }
  ]
}
```

---

## 🎓 Training Pipeline

### 1. Data Collection & Labeling

```typescript
interface TrainingExample {
  // Input features (X)
  cmf: CmfFeatures;
  sfa: SfaTransactionalFeatures;
  demographics: {
    age: number;
    income: number;
    employment_length: number;
  };
  loan: {
    amount: number;
    purpose: string;
    term_months: number;
  };
  
  // Label (Y) - observed within 12 months
  defaulted: boolean;  // 0 = no default, 1 = default
  
  // Metadata
  observation_date: string;
  outcome_date: string;
}
```

**Labeling Strategy:**
- **Default definition:** 90+ días de morosidad OR quiebra
- **Performance window:** 12 meses post-originación
- **Minimum history:** 90 días de transacciones pre-originación

### 2. Train/Validation/Test Split

```python
# Temporal split para evitar data leakage
train_data = data[data['date'] < '2024-01-01']  # 70%
val_data = data[(data['date'] >= '2024-01-01') & 
                (data['date'] < '2024-07-01')]    # 15%
test_data = data[data['date'] >= '2024-07-01']    # 15%
```

**Importante:** NUNCA shuffle temporal - evita look-ahead bias

### 3. Handling Class Imbalance

**Técnicas:**
1. **SMOTE** (Synthetic Minority Over-sampling Technique)
2. **Class weights** en modelo
3. **Stratified sampling**

```python
from imblearn.over_sampling import SMOTE

smote = SMOTE(sampling_strategy=0.5, random_state=42)
X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)
```

### 4. Cross-Validation

```python
from sklearn.model_selection import TimeSeriesSplit

# 5-fold temporal cross-validation
tscv = TimeSeriesSplit(n_splits=5)

for train_idx, val_idx in tscv.split(X):
    X_train_fold = X[train_idx]
    y_train_fold = y[train_idx]
    # Train and validate
```

---

## 📊 Evaluation Metrics

### Métricas Primarias

```python
from sklearn.metrics import (
    roc_auc_score, 
    precision_recall_curve,
    brier_score_loss,
    log_loss
)

def evaluate_model(y_true, y_pred_proba):
    metrics = {
        'auc': roc_auc_score(y_true, y_pred_proba),
        'gini': 2 * roc_auc_score(y_true, y_pred_proba) - 1,
        'brier_score': brier_score_loss(y_true, y_pred_proba),
        'log_loss': log_loss(y_true, y_pred_proba),
        
        # Kolmogorov-Smirnov statistic
        'ks_statistic': compute_ks_statistic(y_true, y_pred_proba)
    }
    return metrics
```

### Benchmarks Objetivo

| Métrica | Baseline (LR) | Target (Ensemble) | World-Class |
|---------|---------------|-------------------|-------------|
| AUC | 0.70 | 0.78 | 0.85+ |
| Gini | 0.40 | 0.56 | 0.70+ |
| Brier Score | 0.18 | 0.14 | 0.10 |
| KS Statistic | 0.35 | 0.50 | 0.60+ |

---

## 🚀 Production Deployment

### API Endpoint

```typescript
POST /api/credit-score/predict

Request:
{
  "userId": "uuid",
  "cmfDocument": "base64_pdf",
  "cartolaDocument": "base64_pdf"
}

Response:
{
  "score": 680,
  "probability_default": 0.08,
  "risk_category": "GOOD",
  "confidence": 0.92,
  "factors": [
    {
      "name": "Debt-to-Income Ratio",
      "value": 0.35,
      "impact": -15,
      "explanation": "Your debt is 35% of your income, slightly above optimal"
    },
    {
      "name": "Income Regularity",
      "value": 0.85,
      "impact": +25,
      "explanation": "You have very regular income patterns"
    }
  ],
  "timestamp": "2026-03-02T19:00:00Z",
  "model_version": "v2.1.0"
}
```

### Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Latency (p50) | <200ms | Excluding PDF parsing |
| Latency (p99) | <500ms | Including parsing |
| Throughput | >100 req/s | Single instance |
| Availability | 99.9% | 43min downtime/month |

### Monitoring

```python
# Key metrics to monitor
MONITORING_METRICS = {
    'prediction_latency': histogram,
    'score_distribution': histogram,
    'pd_distribution': histogram,
    'feature_drift': kolmogorov_smirnov_test,
    'model_performance': {
        'auc': rolling_window(7_days),
        'default_rate': actual_vs_predicted
    }
}
```

---

## ✅ Summary: Recommended Implementation

### Phase 1: MVP (Week 1-2)
1. ✅ Logistic Regression baseline
2. ✅ CMF + SFA feature engineering
3. ✅ Basic calibration & scoring
4. ✅ API endpoint

### Phase 2: Production (Week 3-4)
1. ✅ XGBoost model
2. ✅ Ensemble (LR + XGBoost)
3. ✅ SHAP explainability
4. ✅ Monitoring dashboard

### Phase 3: Advanced (Optional)
1. ⚠️ Deep Learning model (if data >10K)
2. ⚠️ Real-time feature store
3. ⚠️ A/B testing framework
4. ⚠️ Auto-retraining pipeline

---

## 🎯 Expected Performance

### Baseline (Current)
- **Modelo:** Simulado
- **AUC:** N/A (no predictivo)
- **Explicabilidad:** Baja

### Proposed (Logistic Regression)
- **Modelo:** Estadístico sólido
- **AUC:** ~0.72-0.75
- **Explicabilidad:** Alta
- **Latency:** <50ms

### Proposed (Ensemble LR + XGBoost)
- **Modelo:** Estado del arte
- **AUC:** ~0.78-0.82
- **Explicabilidad:** Media-Alta (SHAP)
- **Latency:** <200ms

### World-Class (Ensemble + DL)
- **Modelo:** Research-grade
- **AUC:** ~0.85+
- **Explicabilidad:** Media (SHAP)
- **Latency:** <500ms

---

**✅ Este diseño cumple todos los requisitos del Business Plan y está respaldado por investigación académica de punta.**
