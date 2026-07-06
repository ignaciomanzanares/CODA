#!/usr/bin/env python3
"""
Entrena una REGRESIÓN LOGÍSTICA (scorecard tradicional de CODA, Fase B) sobre un CSV de features
CMF + `label`, y exporta coeficientes + calibración a un JSON que consume `scoring/credit-score.ts`
(mismo patrón que el logístico de `services/pdScoring.ts`: logit = b0 + Σ wᵢ·fᵢ, PD = sigmoid).

No usa ONNX/XGBoost: el scorecard se sirve evaluando el logit en TS directamente (interpretable,
razones por contribución de feature). Solo requiere pandas/numpy/scikit-learn.

## Uso
  .venv/bin/python train_logreg.py --in out/gmsc_features.csv --out artifacts/logreg_cmf --label label
  # opcional validación transfer en 2ª población:
  .venv/bin/python train_logreg.py --in out/gmsc_features.csv --out artifacts/logreg_cmf --transfer out/lendingclub_features.csv
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, brier_score_loss


def dataset_hash(df: pd.DataFrame) -> str:
    return hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values.tobytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--label", default="label")
    ap.add_argument("--transfer", default=None, help="CSV de 2ª población para validación transfer (mismas columnas)")
    args = ap.parse_args()

    df = pd.read_csv(args.inp)
    features = [c for c in df.columns if c != args.label]
    X = df[features].astype(float).values
    y = df[args.label].astype(int).values
    base_rate = float(y.mean())

    # AUC out-of-fold (5-fold estratificado) — estimación honesta de generalización.
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof = cross_val_predict(
        LogisticRegression(max_iter=2000), X, y, cv=skf, method="predict_proba"
    )[:, 1]
    auc_cv = roc_auc_score(y, oof)
    brier = brier_score_loss(y, oof)

    # Modelo final sobre todo el set (coeficientes a servir).
    model = LogisticRegression(max_iter=2000).fit(X, y)
    coefs = {f: float(w) for f, w in zip(features, model.coef_[0])}
    intercept = float(model.intercept_[0])

    print(f"== LogReg scorecard ==")
    print(f"filas={len(df)}  base_rate={base_rate:.4f}  AUC(cv5)={auc_cv:.4f}  Brier={brier:.4f}")
    print(f"intercept(b0) = {intercept:+.4f}")
    for f, w in coefs.items():
        sign = "↑PD" if w > 0 else "↓PD"
        print(f"  w[{f:8s}] = {w:+.5f}   ({sign})")

    transfer_metrics = None
    if args.transfer and os.path.exists(args.transfer):
        tdf = pd.read_csv(args.transfer)
        common = [f for f in features if f in tdf.columns]
        if common and args.label in tdf.columns:
            Xt = tdf[common].astype(float).values
            yt = tdf[args.label].astype(int).values
            # Reordena/rellena columnas faltantes con 0 para respetar el orden del modelo.
            Xt_full = np.zeros((len(tdf), len(features)))
            for j, f in enumerate(features):
                if f in tdf.columns:
                    Xt_full[:, j] = tdf[f].astype(float).values
            auc_t = roc_auc_score(yt, model.predict_proba(Xt_full)[:, 1])
            transfer_metrics = {"auc": float(auc_t), "n": int(len(tdf)), "features_comunes": common}
            print(f"TRANSFER ({os.path.basename(args.transfer)}): AUC={auc_t:.4f} sobre {len(tdf)} filas (features comunes: {common})")

    os.makedirs(args.out, exist_ok=True)
    manifest = {
        "model_id": f"logreg_cmf_{int(datetime.now(timezone.utc).timestamp())}",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "algo": "logistic_regression",
        "features": features,
        "intercept": intercept,
        "coefficients": coefs,
        "metrics": {"auc_cv5": float(auc_cv), "brier": float(brier), "base_rate": base_rate},
        "transfer": transfer_metrics,
        "dataset_hash": dataset_hash(df),
        "source": f"GiveMeSomeCredit ({len(df)} filas) — features CMF (mora30/60/90, dti, util)",
        "note": "PD = sigmoid(intercept + sum(coef_i * feature_i)). El scorecard TS mapea PD -> 0-850.",
    }
    out_path = os.path.join(args.out, "coeffs.json")
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"-> {out_path}")


if __name__ == "__main__":
    main()
