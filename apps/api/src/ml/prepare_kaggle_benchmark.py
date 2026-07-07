#!/usr/bin/env python3
"""
Mapea el dataset público "Give Me Some Credit" (Kaggle, 2011, ~150k filas reales con
default real) al formato que espera train_xgb.py (CSV de features numéricas + columna
`label`). train_xgb.py es agnóstico al nombre/significado de las columnas — no requiere
el feature set de make_synth_training.ts (windowDays, txCount, dti, etc.), que está atado
a transacciones bancarias y no tiene equivalente en este dataset de buró de crédito.

Por eso este script no fuerza un mapeo artificial columna-a-columna: usa las columnas
nativas del dataset como features. El objetivo es aislar si el AUC 0.4172 (peor que azar)
del modelo en producción es un bug del pipeline de entrenamiento/evaluación (se replicaría
aquí, con datos reales y señal real) o es específico de la etiqueta sintética
`Math.random() < pd` en make_synth_training.ts (ver docs/ y manifest.json de
artifacts/current).

Uso:
  .venv/bin/python prepare_kaggle_benchmark.py <input_csv> <output_csv>

Dataset: https://www.kaggle.com/c/GiveMeSomeCredit (cs-training.csv / GiveMeSomeCredit-training.csv)
"""
import sys
import pandas as pd


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <input_csv> <output_csv>")
    in_path, out_path = sys.argv[1], sys.argv[2]

    df = pd.read_csv(in_path, index_col=0)
    df = df.rename(columns={"SeriousDlqin2yrs": "label"})

    # MonthlyIncome y NumberOfDependents tienen NaNs en el dataset original (~20% y ~2.6%
    # de las filas); imputar con la mediana en vez de descartar filas, para no sesgar
    # hacia los casos con datos completos.
    for col in ("MonthlyIncome", "NumberOfDependents"):
        df[col] = df[col].fillna(df[col].median())

    df.to_csv(out_path, index=False)
    print(f"Wrote {len(df)} rows, {len(df.columns) - 1} features -> {out_path}")
    print(f"Label balance: {df['label'].value_counts(normalize=True).to_dict()}")


if __name__ == "__main__":
    main()
