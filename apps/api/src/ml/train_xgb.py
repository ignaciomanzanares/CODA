#!/usr/bin/env python3
import argparse, hashlib, json, os, pathlib, time
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
import xgboost as xgb

# Imports OPCIONALES: shap (importancia global) y skl2onnx/onnxconverter-common (export ONNX).
# Ninguno es requisito para producir un artefacto SERVIBLE (xgb.json + feature_meta + calibración):
# el serving evalúa xgb.json en TS (sin ONNX), y shap_summary es solo diagnóstico. Se hacen
# opcionales para no exigir el chain pesado/frágil de onnx en entornos sin esas wheels (p.ej.
# Python nuevo). Su USO ya está envuelto en try/except más abajo.
try:
    import shap
except Exception:
    shap = None
try:
    from skl2onnx import convert_sklearn
    from onnxconverter_common.data_types import FloatTensorType as OCCFloatTensorType
except Exception:
    convert_sklearn = None
    OCCFloatTensorType = None


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

    # Hash del dataset de entrenamiento (#39): identifica de forma reproducible con qué
    # datos exactos se entrenó este artefacto. Va al manifest junto al n de filas/features.
    dataset_hash = hashlib.sha256(pathlib.Path(args.inp).read_bytes()).hexdigest()

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
        base_score=0.5,
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

    # Fit on all
    model.fit(X, label)

    # Overall predictions for KS and calibration fit
    p_all = model.predict_proba(X)[:,1]

    # KS statistic
    # Empirical CDFs of scores for pos/neg
    pos = np.sort(p_all[label == 1])
    neg = np.sort(p_all[label == 0])
    all_scores = np.sort(np.unique(p_all))
    def cdf_at(scores, arr):
        # proportion <= each score
        return np.searchsorted(arr, scores, side='right') / max(1, len(arr))
    cdf_pos = cdf_at(all_scores, pos)
    cdf_neg = cdf_at(all_scores, neg)
    ks = float(np.max(np.abs(cdf_pos - cdf_neg))) if len(pos) and len(neg) else 0.0

    # Simple calibration: Platt scaling on full data (placeholder)
    lr = LogisticRegression(max_iter=1000)
    lr.fit(p_all.reshape(-1,1), label)
    a = float(lr.coef_[0][0]); b = float(lr.intercept_[0])

    # Export a ONNX: OPCIONAL. El serving en producción evalúa `xgb.json` directamente en
    # TypeScript (`XgbTreeModel.predictProba`), así que un ONNX válido ya NO es requisito para
    # promover un modelo. Lo intentamos igual (útil para validación cruzada externa), pero si
    # falla por la incompatibilidad de versiones onnxmltools/onnx/xgboost (ver README.md) el
    # entrenamiento continúa y el manifest registra onnx_path=None — antes esto abortaba todo
    # el pipeline y bloqueaba la promoción de modelos buenos (#9).
    onnx_export_path = None
    try:
        initial_type_skl2onnx = [('input', OCCFloatTensorType([None, X.shape[1]]))]
        try:
            onnx_model = convert_sklearn(model, initial_types=initial_type_skl2onnx)
        except Exception:
            from onnxmltools import convert_xgboost
            from onnxmltools.convert.common.data_types import FloatTensorType as OMLFloatTensorType
            initial_type_onnxmltools = [('input', OMLFloatTensorType([None, X.shape[1]]))]
            onnx_model = convert_xgboost(model, initial_types=initial_type_onnxmltools)
        onnx_path = out_dir / 'xgb_pd.onnx'
        with open(onnx_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        onnx_export_path = 'xgb_pd.onnx'
    except Exception as e:
        print(f"[train_xgb] ONNX export omitido (no bloquea): {type(e).__name__}: {e}")

    feature_meta = {'features': feature_cols}
    (out_dir / 'feature_meta.json').write_text(json.dumps(feature_meta, indent=2))

    # SHAP global importance (mean |SHAP| per feature)
    try:
        explainer = shap.TreeExplainer(model)
        shap_vals = explainer.shap_values(X)
        if isinstance(shap_vals, list):
            shap_arr = np.array(shap_vals[0])
        else:
            shap_arr = np.array(shap_vals)
        mean_abs = np.mean(np.abs(shap_arr), axis=0)
        feats = feature_cols
        shap_summary = [{ 'feature': f, 'mean_abs_shap': float(m) } for f, m in sorted(zip(feats, mean_abs), key=lambda t: t[1], reverse=True)]
        top_features = [s['feature'] for s in shap_summary[:10]]
        (out_dir / 'shap_summary.json').write_text(json.dumps(shap_summary, indent=2))
    except Exception as e:
        shap_summary = []
        top_features = []

    # Save native XGBoost model for per-instance SHAP explanations
    try:
        booster = model.get_booster()
        booster.save_model(str(out_dir / 'xgb.json'))
    except Exception:
        pass

    manifest = {
        'model_id': f"xgb_{int(time.time())}",
        'trained_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'algo': 'xgb',
        'onnx_path': onnx_export_path,
        'feature_meta_path': 'feature_meta.json',
        'dataset_hash': dataset_hash,
        'n_rows': int(len(df)),
        'n_features': int(X.shape[1]),
        'metrics': { 'auc': auc, 'gini': gini, 'brier': brier, 'ks': ks },
        'calibration': { 'type': 'platt', 'params': { 'a': a, 'b': b } },
        'shap_top': top_features,
        'shap_summary_path': 'shap_summary.json' if shap_summary else None,
        'xgb_json_path': 'xgb.json'
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2))

    print(f"Model saved to {out_dir}")

if __name__ == '__main__':
    main()