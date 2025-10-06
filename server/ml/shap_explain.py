#!/usr/bin/env python3
import argparse, json, os, pathlib, sys
import numpy as np
import xgboost as xgb
import shap

# Usage:
#   python shap_explain.py --artifacts server/ml/artifacts/current --top 5 < features.json
# Reads a single JSON object from stdin representing a feature map {feature: value}
# Loads XGBoost booster from artifacts (xgb.json) and feature order from feature_meta.json
# Outputs JSON: { expected_value, shap: [{feature, value}], base_prediction_raw, top }

def load_artifacts(art_dir: pathlib.Path):
    feat_meta_path = art_dir / 'feature_meta.json'
    manifest_path = art_dir / 'manifest.json'
    model_json_path = art_dir / 'xgb.json'
    if not feat_meta_path.exists() or not model_json_path.exists():
        raise SystemExit("Artifacts incomplete: feature_meta.json or xgb.json missing")
    features = json.loads(feat_meta_path.read_text())['features']
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    booster = xgb.Booster()
    booster.load_model(str(model_json_path))
    return features, manifest, booster


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--artifacts', required=True)
    ap.add_argument('--top', type=int, default=5)
    args = ap.parse_args()

    art = pathlib.Path(args.artifacts)
    features, manifest, booster = load_artifacts(art)

    # Read one JSON object from stdin
    raw = sys.stdin.read()
    fv = json.loads(raw)

    # Build input vector in correct order
    X_row = np.array([[float(fv.get(k, 0.0)) for k in features]], dtype=float)
    dmat = xgb.DMatrix(X_row, feature_names=features)

    # SHAP TreeExplainer on Booster
    explainer = shap.TreeExplainer(booster, feature_perturbation='tree_path_dependent', model_output='raw')
    shap_vals = explainer.shap_values(X_row)
    expected_value = explainer.expected_value

    # Ensure shapes
    if isinstance(shap_vals, list):
        shap_arr = np.array(shap_vals[0])
    else:
        shap_arr = np.array(shap_vals)
    shap_row = shap_arr[0]

    # Raw model prediction (logit) and calibrated probability if available
    raw_pred = float(booster.predict(dmat)[0])
    prob = 1.0 / (1.0 + np.exp(-raw_pred))
    # Apply Platt calibration if provided (note: manifest params are for probability; we re-apply for consistency)
    cal = manifest.get('calibration') if manifest else None
    if cal and cal.get('type') == 'platt':
        a = cal.get('params', {}).get('a')
        b = cal.get('params', {}).get('b')
        if isinstance(a, (int,float)) and isinstance(b, (int,float)):
            z = a * prob + b
            prob = float(1.0 / (1.0 + np.exp(-z)))

    pairs = [{'feature': f, 'shap_value': float(v)} for f, v in zip(features, shap_row)]
    pairs_sorted = sorted(pairs, key=lambda p: abs(p['shap_value']), reverse=True)
    top = max(1, args.top)

    out = {
        'expected_value_raw': float(expected_value if np.isscalar(expected_value) else expected_value[0]),
        'prediction_raw': raw_pred,
        'prediction_prob_calibrated': prob,
        'top': top,
        'contributions': pairs_sorted[:top]
    }
    sys.stdout.write(json.dumps(out))

if __name__ == '__main__':
    main()
