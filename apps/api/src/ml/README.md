# Modelo de credit scoring (XGBoost)

## Hallazgo de auditoría: AUC 0.4172 (peor que azar) en `artifacts/current`

`artifacts/current/manifest.json` reporta `auc: 0.4172`, `gini: -0.1655` — peor que un
clasificador aleatorio (AUC≈0.5). La causa raíz es la generación de la etiqueta en
`make_synth_training.ts`: `const label = Math.random() < pd ? 1 : 0;` — la etiqueta de
default es ruido puro, sin relación con las features. Ruido puro normalmente da AUC≈0.5,
no <0.5 de forma consistente; ese patrón (peor que azar de forma sistemática) es la señal
de que también podría haber un bug de pipeline (inversión de etiqueta, leakage, orden de
columnas), no solo "datos sintéticos sin señal".

## Benchmark diagnóstico con datos reales

Para aislar si el bug está en el **pipeline de entrenamiento/evaluación** (`train_xgb.py`)
o es específico de la **generación de datos sintéticos**, se entrenó el mismo algoritmo
(`XGBClassifier`, mismos hiperparámetros, mismo split temporal de 3 folds que
`train_xgb.py`) contra un dataset público con señal real: **Give Me Some Credit**
(Kaggle, 2011 — 150.000 prestatarios reales, ~6.7% con default real a 2 años).

- Script de preparación: `prepare_kaggle_benchmark.py` — usa las columnas nativas del
  dataset (no el feature set de `features.ts`/`make_synth_training.ts`, que está atado a
  transacciones bancarias y no tiene equivalente en un dataset de buró de crédito).
  `train_xgb.py` es agnóstico al nombre/significado de las columnas, así que esto es
  válido para el propósito del benchmark.
- Script de entrenamiento: `train_xgb_benchmark.py` (variante de `train_xgb.py` sin
  exportación a ONNX/SHAP — ver docstring del módulo, es un problema de compatibilidad de
  versiones de `onnxmltools`/`onnx` con `xgboost==3.0.5` en este entorno, no relacionado
  con los datos; se reproduce igual con el CSV sintético actual).
- Artefacto resultante: `artifacts/benchmark/manifest.json` (no usar en producción —
  feature set distinto al de `artifacts/current`).

**Resultado: AUC 0.8649 (gini 0.7299) con datos reales**, usando el pipeline de
entrenamiento/evaluación sin modificar. Esto confirma que `train_xgb.py` **no tiene un bug
estructural** — el AUC 0.4172 de `artifacts/current` es específico de la etiqueta sintética
`Math.random()` en `make_synth_training.ts`, no del código de entrenamiento.

## Cómo reproducir

```bash
npm run ml:setup   # crea .venv con las deps de requirements.txt

# Descargar el dataset (no se redistribuye en este repo, ver .gitignore):
# https://www.kaggle.com/c/GiveMeSomeCredit -> cs-training.csv
.venv/bin/python prepare_kaggle_benchmark.py <ruta-al-csv-de-kaggle> out/kaggle_benchmark_features.csv
.venv/bin/python train_xgb_benchmark.py --in out/kaggle_benchmark_features.csv --out artifacts/benchmark --label label
```

## Arquitectura de datos: un dataset por modelo

CODA tiene dos modelos en espacios de features distintos. Cada uno tiene su dataset real:

| Modelo CODA | Feature space | Dataset real | Rol |
|---|---|---|---|
| **Transaccional** (XGB PD, `features.ts`, 19 features) | Transacciones bancarias | **Berka** | **Servible** — datos reales reemplazan al sintético |
| **Evaluador de riesgo** (score CMF, `credit-score.ts`) | Mora + deuda/ingreso (Informe CMF) | **Home Credit** | **Solo benchmark** — ver abajo |

### Berka → modelo transaccional SERVIBLE (`prepare_berka.py`)

Berka (PKDD'99) es el único dataset público con **transacciones reales** (~1M en `trans`) +
**outcome de préstamo real** (`loan.status`). `prepare_berka.py` replica la semántica exacta de
`buildUserFeatureVector()` (features.ts) sobre las transacciones ANTERIORES a cada préstamo
(ventana de 90d, anti-leakage), con etiqueta desde `loan.status` (B/D = default). El artefacto
es servible tal cual sobre el vector que produce CODA en runtime.

```bash
npm run ml:setup
python -c "import kagglehub; print(kagglehub.dataset_download('marceloventura/the-berka-dataset'))"
.venv/bin/python prepare_berka.py <dir_con_csvs> out/berka_features.csv --window-days 90
.venv/bin/python train_xgb.py --in out/berka_features.csv --out artifacts/berka --label label
# Si AUC >= 0.72: promover con deployNewModelVersion() (modelType xgb_pd).
```

**Caveats:** set etiquetado chico (~682 préstamos, ~76 defaults → alta varianza, es una BASE
real no la palabra final); data checa/CZK/años 90 → las features de RATIO transfieren
(scale-free), las ABSOLUTAS (totalCredits, monthlyIncome en CZK) no → de-priorizarlas o
normalizarlas (TODO). Aun así es muchísimo mejor que el sintético actual (AUC 0.61 / 2000 filas).

### Home Credit → solo benchmark del evaluador de riesgo (`prepare_home_credit.py`)

**No produce un modelo servible.** El evaluador de riesgo de CODA puntúa sobre el Informe CMF:
su señal central son los **buckets de mora (30/60/90)** + deuda/ingreso. Home Credit es data de
solicitud cuyos predictores fuertes (`EXT_SOURCE_*`, `DAYS_EMPLOYED`) **CODA no puede recolectar**,
y **no tiene mora**. La intersección con lo que CODA sirve es demasiado fina para servir.

Como **no existe dataset público con features estilo CMF (mora) + default**, el evaluador ML
sobre features CMF no es entrenable con datos públicos → **se mantiene la heurística calibrada**
(`credit-score.ts`) como evaluador en vivo. Home Credit valida el pipeline sobre un 2º dataset
real grande (~307k filas) y cuantifica el techo de la señal de afordabilidad de forma aislada.

```bash
python -c "import kagglehub; print(kagglehub.competition_download('home-credit-default-risk'))"
.venv/bin/python prepare_home_credit.py <dir>/application_train.csv out/home_credit_features.csv
.venv/bin/python train_xgb_benchmark.py --in out/home_credit_features.csv --out artifacts/home_credit_benchmark --label label
```

**Camino a un evaluador de riesgo genuinamente mejor:** (1) datos chilenos reales con mora +
default (DICOM/Equifax, validar contrato de datos con legal), o (2) usar Home Credit para
calibrar la función de etiqueta del provider sintético en su componente de afordabilidad.

## Fix aplicado: heterogeneidad real + etiqueta calibrada a Chile (`artifacts/synthetic_chile_v2`)

Implementado: `apps/api/src/ml/syntheticChileanProvider.ts` reemplaza `MockProvider` para la
generación de entrenamiento. Causa raíz más profunda que la etiqueta `Math.random()`:
`MockProvider` generaba transacciones **casi idénticas para los 200 usuarios sintéticos**
(mismo saldo, mismo patrón de gasto, solo ruido menor en montos/fechas) — sin heterogeneidad
real entre usuarios no había señal real para que el modelo aprendiera, independientemente de
cómo se sorteara la etiqueta.

`SyntheticChileanProvider` introduce un perfil latente por usuario (`ChileanProfile`: ingreso
mensual lognormal, carga financiera, volatilidad de ingreso) calibrado contra estadísticas
públicas de Chile (BCCh, Encuesta Financiera de Hogares 2024; CMF, morosidad de cartera —
ver docstring del módulo para las cifras exactas y sus caveats de cobertura), y deriva tanto
las transacciones como la etiqueta de default (`sampleLabel`) de ese mismo perfil latente —
ya no de `pdScoring.ts` (el scorer heurístico de producción, que además asigna peso cero a
varias de las features nuevas de DTI/volatilidad) ni de `Math.random()` puro.

`make_synth_training.ts` ahora usa este provider (y crea la fila de usuario en la BD local
antes de ingestar — `accounts.userId` es FK a `users.id`, paso que faltaba y causaba
`SQLITE_CONSTRAINT_FOREIGNKEY` con 0 filas generadas en SQLite local).

**Resultado** (`train_xgb_benchmark.py`, mismo pipeline sin modificar, 2000 usuarios
sintéticos, `artifacts/synthetic_chile_v2/manifest.json`): **AUC 0.6147 (gini 0.2293)**,
frente al 0.4172 (peor que azar) de `artifacts/current`. Confirma que el problema era la
falta de heterogeneidad/señal en los datos generadores, no un bug de `train_xgb.py`.

**Resuelto — el modelo chileno (AUC 0.6147) ya está promovido a `artifacts/current`.** El
bloqueador del export ONNX se eliminó **dejando de depender de ONNX para servir**:
`modelRegistry.ts` ahora evalúa el dump nativo `xgb.json` directamente en TypeScript
(`XgbTreeModel.predictProba` = `sigmoid(margin)`), no `onnxruntime`. Esto cierra dos problemas
a la vez:

1. **El export ONNX seguía fallando** (`onnx.helper.make_attribute: TypeError: Field
   onnx.AttributeProto.ints: Expected an int, got a boolean`, incompatibilidad
   `onnxmltools==1.14.0`/`onnx==1.19.0`/`xgboost==3.0.5`). `train_xgb.py` ahora trata el export
   ONNX como **opcional** (lo intenta, y si falla registra `onnx_path=null` y continúa) — ya no
   aborta el pipeline ni bloquea la promoción.
2. **Bug de serving real**: el código previo leía `outputs[Object.keys(outputs)[0]]` de la
   sesión ONNX, que es el tensor `label` (clase 0/1 int64), **no** `probabilities` — devolvía
   un PD binarizado, no una probabilidad. La evaluación en TS lo elimina.

La paridad `XgbTreeModel` ↔ booster está verificada a tolerancia float32 en
`services/__tests__/treeExplain.test.ts` (margin y `predictProba` contra
`booster.predict(output_margin=True)`/`predict()`), reproduciendo el camino de decisión float32
de XGBoost vía `Math.fround` sobre features y umbrales de split. El manifest de `current`
reporta `auc: 0.6147` (≥ 0.60), `dataset_hash` (sha256 del CSV de entrenamiento, #39),
`n_rows`/`n_features`.

## Próximos pasos

1. ~~Reemplazar la etiqueta `Math.random()` en `make_synth_training.ts` por una relación
   determinística entre features y default~~ — hecho, ver sección anterior.
2. ~~Calibrar las distribuciones sintéticas contra la Encuesta Financiera de Hogares del
   Banco Central de Chile~~ — hecho (`syntheticChileanProvider.ts`).
3. ~~Resolver la incompatibilidad de versiones ONNX para poder promover un artefacto~~ — ya no
   aplica: el serving evalúa `xgb.json` en TS (sin ONNX), así que la promoción no depende del
   export ONNX. El artefacto chileno (AUC 0.6147) ya está en `artifacts/current`.
4. Evaluar la compra de un piloto de datos chilenos reales (Equifax/DICOM) — validar antes
   con legal el contrato de tratamiento de datos.
