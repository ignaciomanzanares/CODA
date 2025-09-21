#!/usr/bin/env python3
import argparse, json, os, pathlib, time
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
import xgboost as xgb
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType


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
    ap.add_argument('--in', dest='inp', required=True, help='CSV with features + label')
    ap.add_argument('--out', dest='out_dir', required=True, help='Artifacts output dir')
    ap.add_argument('--label', dest='label', default='label', help='Label column name')
    ap.add_argument('--time', dest='time_col', default=None, help='Optional time column for split')
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.inp)
    if args.label not in df.columns:
        raise SystemExit(f"Label column '{args.label}' not found in input")

    label = df[args.label].astype(int).values
    feature_cols = [c for c in df.columns if c not in (args.label,)]
    X = df[feature_cols].astype(float).values

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        learning_rate=0.05,
        reg_lambda=1.0,
        objective='binary:logistic',
        eval_metric='logloss',
        n_jobs=4,
    )

    splits = time_split_indices(df, n_splits=3, time_col=args.time_col)
    aucs, briers = [], []
    for train_idx, test_idx in splits:
        model.fit(X[train_idx], label[train_idx])
        p = model.predict_proba(X[test_idx])[:,1]
        aucs.append(roc_auc_score(label[test_idx], p))
        briers.append(brier_score_loss(label[test_idx], p))
    auc = float(np.mean(aucs)) if aucs else 0.0
    brier = float(np.mean(briers)) if briers else 0.0
    gini = 2*auc - 1

    model.fit(X, label)

    lr = LogisticRegression(max_iter=1000)
    lr.fit(model.predict_proba(X)[:,1].reshape(-1,1), label)
    a = float(lr.coef_[0][0]); b = float(lr.intercept_[0])

    initial_type = [('input', FloatTensorType([None, X.shape[1]]))]
    onnx_model = convert_sklearn(model, initial_types=initial_type)
    onnx_path = out_dir / 'xgb_pd.onnx'
    with open(onnx_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    feature_meta = {'features': feature_cols}
    (out_dir / 'feature_meta.json').write_text(json.dumps(feature_meta, indent=2))

    manifest = {
        'model_id': f"xgb_{int(time.time())}",
        'trained_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'algo': 'xgb',
        'onnx_path': 'xgb_pd.onnx',
        'feature_meta_path': 'feature_meta.json',
        'metrics': { 'auc': auc, 'gini': gini, 'brier': brier },
        'calibration': { 'type': 'platt', 'params': { 'a': a, 'b': b } }
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2))

    print(f"Model saved to {out_dir}")

if __name__ == '__main__':
    main()