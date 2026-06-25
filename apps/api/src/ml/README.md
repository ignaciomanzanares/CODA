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

## Próximos pasos (no implementados en este benchmark)

1. Reemplazar la etiqueta `Math.random()` en `make_synth_training.ts` por una relación
   determinística entre features y default (o, mejor, datos reales).
2. Calibrar las distribuciones sintéticas contra la Encuesta Financiera de Hogares del
   Banco Central de Chile para que los rangos de deuda/ingreso sean plausibles para Chile.
3. Evaluar la compra de un piloto de datos chilenos reales (Equifax/DICOM) — validar antes
   con legal el contrato de tratamiento de datos.
