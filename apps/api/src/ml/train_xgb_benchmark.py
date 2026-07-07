#!/usr/bin/env python3
"""
Variante de train_xgb.py para el benchmark diagnóstico con datos reales (ver
prepare_kaggle_benchmark.py y docs del checklist de auditoría, hallazgo #6).

Reusa exactamente la misma lógica de split/entrenamiento/métricas que train_xgb.py
(XGBClassifier con los mismos hiperparámetros, TimeSeriesSplit de 3 folds) para que el
AUC sea comparable. Omite la exportación a ONNX y el cálculo de SHAP: ambos fallan en este
entorno por una incompatibilidad de versiones entre xgboost==3.0.5 y onnxmltools==1.14.0/
onnx==1.19.0 (independiente de los datos — se reproduce igual con el CSV sintético actual),
que es un problema separado del pipeline de entrenamiento en sí y queda fuera del alcance
de este benchmark. Lo único que importa aquí es la métrica de AUC con datos reales.

Uso:
  .venv/bin/python train_xgb_benchmark.py --in out/kaggle_benchmark_features.csv --out artifacts/benchmark --label label
"""
import argparse
import json
import pathlib
import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.model_selection import TimeSeriesSplit


def time_split_indices(df, n_splits=3, time_col=None):
    if time_col and time_col in df.columns:
        df = df.sort_values(time_col)
        idx = np.arange(len(df))
        tss = TimeSeriesSplit(n_splits=n_splits)
        return list(tss.split(idx))
    n = len(df)
    fold = n // (n_splits + 1)
    splits = []
    for i in range(1, n_splits + 1):
        train_idx = np.arange(0, fold * i)
        test_idx = np.arange(fold * i, fold * (i + 1))
        splits.append((train_idx, test_idx))
    return splits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', dest='out_dir', required=True)
    ap.add_argument('--label', dest='label', default='label')
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.inp)
    label = df[args.label].astype(int).values
    feature_cols = [c for c in df.columns if c != args.label]
    X = df[feature_cols].astype(float).values

    model = xgb.XGBClassifier(
        n_estimators=300, max_depth=4, subsample=0.8, colsample_bytree=0.8,
        learning_rate=0.05, reg_lambda=1.0, objective='binary:logistic',
        eval_metric='logloss', n_jobs=4, base_score=0.5,
    )

    splits = time_split_indices(df, n_splits=3)
    aucs, briers = [], []
    for train_idx, test_idx in splits:
        model.fit(X[train_idx], label[train_idx])
        p = model.predict_proba(X[test_idx])[:, 1]
        aucs.append(roc_auc_score(label[test_idx], p))
        briers.append(brier_score_loss(label[test_idx], p))
    auc = float(np.mean(aucs))
    brier = float(np.mean(briers))
    gini = 2 * auc - 1

    manifest = {
        'model_id': f"xgb_kaggle_benchmark_{int(time.time())}",
        'trained_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'algo': 'xgb',
        'source': 'Give Me Some Credit (Kaggle, 2011) — ver prepare_kaggle_benchmark.py',
        'feature_cols': feature_cols,
        'metrics': {'auc_per_fold': aucs, 'auc': auc, 'gini': gini, 'brier': brier},
        'note': (
            'Benchmark diagnóstico, no apto para producción: no usa el feature set de '
            'make_synth_training.ts/features.ts (transacciones bancarias), sino las '
            'columnas nativas del dataset de buró de crédito. Objetivo: confirmar que el '
            'pipeline train_xgb.py no tiene un bug estructural, comparando contra el AUC '
            '0.4172 (peor que azar) de artifacts/current con etiqueta sintética '
            'Math.random(). No incluye export a ONNX (ver docstring del módulo).'
        ),
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f"AUC per fold: {aucs}")
    print(f"Mean AUC: {auc:.4f}  Gini: {gini:.4f}  Brier: {brier:.4f}")
    print(f"Manifest written to {out_dir / 'manifest.json'}")


if __name__ == '__main__':
    main()
