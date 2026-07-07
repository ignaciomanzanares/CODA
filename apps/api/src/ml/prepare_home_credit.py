#!/usr/bin/env python3
"""
Home Credit Default Risk (Kaggle) -> CSV de features nativas + `label`, para BENCHMARK del
evaluador de riesgo crediticio (afordabilidad). NO produce un modelo servible en CODA — ver
abajo el porqué.

## Por qué BENCHMARK y no un modelo servible

El evaluador de riesgo de CODA puntúa sobre el Informe de Deudas CMF: su señal central son
los **buckets de mora (30/60/89/90+)** + deuda/ingreso (ver scoring/credit-score.ts ->
historialCmfPoints / endeudamientoPoints). Home Credit es data de SOLICITUD: sus predictores
fuertes son `EXT_SOURCE_1/2/3` (scores de buró externos) y `DAYS_EMPLOYED` (antigüedad
laboral) — que CODA NO puede recolectar — y NO tiene buckets de mora. La intersección con lo
que CODA sirve (mora + deuda + ingreso inferido de cartola) es demasiado fina para servir un
modelo Home Credit como reemplazo del score CMF.

Conclusión (ver README.md y plan de mejora): NO existe dataset público con features estilo
CMF (mora) + outcome de default, así que el evaluador ML sobre features CMF no es entrenable
con datos públicos. Se mantiene la HEURÍSTICA calibrada (credit-score.ts) como evaluador en
vivo. Home Credit se usa solo para:
  1. Validar que el pipeline train_xgb.py rinde sobre un 2º dataset real grande (~307k filas).
  2. Cuantificar el techo de la señal de AFORDABILIDAD (ingreso/cuota/empleo) de forma aislada.

## Uso

  npm run ml:setup
  python -c "import kagglehub; print(kagglehub.competition_download('home-credit-default-risk'))"
  .venv/bin/python prepare_home_credit.py <dir>/application_train.csv out/home_credit_features.csv
  .venv/bin/python train_xgb_benchmark.py --in out/home_credit_features.csv --out artifacts/home_credit_benchmark --label label
"""
import sys
import pandas as pd

# Columnas numéricas de afordabilidad/buró con señal real (sin IDs ni alta cardinalidad categórica).
NUMERIC_FEATURES = [
    "AMT_INCOME_TOTAL", "AMT_CREDIT", "AMT_ANNUITY", "AMT_GOODS_PRICE",
    "DAYS_BIRTH", "DAYS_EMPLOYED", "DAYS_REGISTRATION", "DAYS_ID_PUBLISH",
    "CNT_CHILDREN", "CNT_FAM_MEMBERS",
    "EXT_SOURCE_1", "EXT_SOURCE_2", "EXT_SOURCE_3",
    "REGION_POPULATION_RELATIVE",
]
DAYS_EMPLOYED_SENTINEL = 365243  # desempleado/pensionado en Home Credit


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <application_train.csv> <output_csv>")
    in_path, out_path = sys.argv[1], sys.argv[2]

    src = pd.read_csv(in_path)
    if "TARGET" not in src.columns:
        sys.exit("No se encontró 'TARGET' — ¿es application_train.csv de Home Credit?")

    df = pd.DataFrame()
    df["label"] = src["TARGET"].astype(int)

    # DTI derivado (la única feature que también existe en el flujo de CODA, vía cartola).
    income = src["AMT_INCOME_TOTAL"].astype(float)
    annuity = src["AMT_ANNUITY"].astype(float)
    df["dti"] = annuity / (income + 1e-6)
    df["credit_to_income"] = src["AMT_CREDIT"].astype(float) / (income + 1e-6)

    for col in NUMERIC_FEATURES:
        if col not in src.columns:
            continue
        s = src[col].astype(float)
        if col == "DAYS_EMPLOYED":
            s = s.replace(DAYS_EMPLOYED_SENTINEL, pd.NA).astype(float)
        df[col] = s.fillna(s.median())

    # label al final no es requisito de train_xgb.py (usa --label), pero ordenamos por claridad.
    cols = [c for c in df.columns if c != "label"] + ["label"]
    df = df[cols]
    df.to_csv(out_path, index=False)
    print(f"Wrote {len(df)} rows, {len(df.columns) - 1} features -> {out_path}")
    print(f"Label balance: {df['label'].value_counts(normalize=True).round(4).to_dict()}")


if __name__ == "__main__":
    main()
