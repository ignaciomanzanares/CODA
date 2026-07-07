#!/usr/bin/env python3
"""
GiveMeSomeCredit (Kaggle, 150k prestatarios, 6.68% default) -> CSV de features en el vocabulario
CMF de CODA + `label`, para ENTRENAR el scorecard tradicional (regresión logística, Fase B).

## Por qué GMSC (y no Home Credit) para el score CMF

A diferencia de Home Credit, GMSC tiene EXACTAMENTE la señal que CODA sirve desde el Informe CMF:
  - `NumberOfTime30-59DaysPastDueNotWorse` -> mora30  (buckets de atraso)
  - `NumberOfTime60-89DaysPastDueNotWorse` -> mora60
  - `NumberOfTimes90DaysLate`              -> mora90
  - `DebtRatio`                            -> dti  (cuota mensual / ingreso mensual)
  - `RevolvingUtilizationOfUnsecuredLines` -> util (utilización de líneas)
  - `SeriousDlqin2yrs`                     -> label (default a 2 años)

Estas features SÍ las computa CODA (scoring/credit-score.ts + risk/cmfDerivation.ts). Por eso GMSC
produce un modelo SERVIBLE, no solo un benchmark.

## Alineación de definiciones (importante)

`DebtRatio` de GMSC = obligaciones mensuales / ingreso mensual bruto. El scorecard de CODA debe
computar el DTI con la MISMA definición al servir: estimarCuotaMensual(cmf) / ingresoMensual
(no deuda_total/ingreso_anual, que es otra escala). Ver credit-score.ts (Fase B).

## Quirks de GMSC que se limpian aquí
  - Buckets de mora traen sentinelas 96/98 (errores de captura) -> se recortan a MAX_MORA.
  - RevolvingUtilization trae outliers enormes (>50000) -> se recorta a [0, UTIL_CAP].
  - DebtRatio se winsoriza al percentil 99 (cuando el ingreso es 0/NaN, DebtRatio explota).
  - MonthlyIncome con NaN (~20%) -> no se usa como feature directa (se deja fuera del set core).

## Uso
  .venv/bin/python prepare_gmsc.py ~/Downloads/GiveMeSomeCredit/cs-training.csv out/gmsc_features.csv
"""
import sys
import pandas as pd
import numpy as np

MAX_MORA = 10       # recorta sentinelas 96/98 y colas absurdas de conteo de atrasos
UTIL_CAP = 2.0      # utilización razonable de líneas revolventes (>2 = error de datos)
# DebtRatio de GMSC guarda el PAGO ABSOLUTO cuando falta el ingreso (valores en miles). Un DTI
# legítimo (cuota/ingreso mensual) rara vez supera 2; >2 = distress severo o dato-basura → se capea.
DTI_CAP = 2.0

# Vocabulario CMF de CODA. Estas son las columnas de salida (+ label).
FEATURES = ["mora30", "mora60", "mora90", "dti", "util"]


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <cs-training.csv> <output_csv>")
    in_path, out_path = sys.argv[1], sys.argv[2]

    src = pd.read_csv(in_path)
    if "SeriousDlqin2yrs" not in src.columns:
        sys.exit("No se encontró 'SeriousDlqin2yrs' — ¿es cs-training.csv de GiveMeSomeCredit?")

    df = pd.DataFrame()
    df["label"] = src["SeriousDlqin2yrs"].astype(int)

    # Buckets de mora -> recorte de sentinelas/colas.
    df["mora30"] = src["NumberOfTime30-59DaysPastDueNotWorse"].clip(lower=0, upper=MAX_MORA)
    df["mora60"] = src["NumberOfTime60-89DaysPastDueNotWorse"].clip(lower=0, upper=MAX_MORA)
    df["mora90"] = src["NumberOfTimes90DaysLate"].clip(lower=0, upper=MAX_MORA)

    # Utilización de líneas -> recorte de outliers.
    df["util"] = src["RevolvingUtilizationOfUnsecuredLines"].clip(lower=0, upper=UTIL_CAP)

    # DTI (cuota/ingreso mensual) -> cap sano en 2.0 (ver nota en DTI_CAP).
    df["dti"] = src["DebtRatio"].astype(float).clip(lower=0, upper=DTI_CAP)

    df = df[["label"] + FEATURES].dropna()

    df.to_csv(out_path, index=False)
    pos = int(df["label"].sum())
    print(f"GMSC -> {out_path}: {len(df)} filas, {pos} defaults ({100*pos/len(df):.2f}%)")
    print(f"features: {FEATURES}")
    print("resumen:\n", df[FEATURES].describe().round(3).to_string())


if __name__ == "__main__":
    main()
