#!/usr/bin/env python3
"""
Berka (PKDD'99 financial dataset) -> feature set TRANSACCIONAL de producción de CODA
(las 19 features de features.ts / artifacts/current/feature_meta.json), con etiqueta de
default REAL desde loan.status.

## Por qué Berka para el modelo transaccional

El XGB PD que sirve producción (modelRegistry.ts → XgbTreeModel) consume el vector de
buildUserFeatureVector() en features.ts: txCount, DTI, volatilidad de flujo, gasto
recurrente, regularidad de ingreso, etc. — todo derivado de TRANSACCIONES bancarias.
Berka es el único dataset público con transacciones reales (~1M en la tabla `trans`) +
outcome de préstamo real (`loan.status`), así que permite computar las 19 features REALES
con etiqueta REAL — a diferencia del entrenamiento sintético actual (syntheticChileanProvider).

Este script replica la MISMA semántica de features.ts (mismas fórmulas), de modo que el
modelo entrenado es servible tal cual sobre el vector que produce CODA en runtime.

## Etiqueta (loan.status)

  A = contrato terminado, sin problemas      -> label 0 (bueno)
  C = en curso, al día                        -> label 0 (bueno)
  B = contrato terminado, NO pagado           -> label 1 (default)
  D = en curso, cliente en mora               -> label 1 (default)

## Ventana temporal (anti-leakage)

Las features se computan SOLO con transacciones ANTERIORES a la fecha del préstamo
(`loan.date`), en una ventana de `--window-days` (default 90, igual que producción).
Así el modelo aprende a predecir el default con la info disponible al originar el crédito,
no con transacciones posteriores (que serían leakage).

## Caveats (ver README.md)

  - Set etiquetado chico: ~682 préstamos (~76 defaults). Alta varianza; es una BASE real,
    no la palabra final. Útil para validar pipeline + modelo base sobre datos reales.
  - Data checa, años 90, coronas (CZK): las features de RATIO (dti, debitCreditRatio,
    incomeRegularity, volatilidad, gasto recurrente, topCategoryShare, trend) son
    scale-free y transfieren; las ABSOLUTAS (totalDebits/Credits, avgAmount, monthlyIncome,
    monthlyDebits) están en CZK y no transfieren a CLP — el entrenamiento las incluye por
    compatibilidad de schema, pero conviene de-priorizarlas o normalizarlas (TODO).

## Uso

  npm run ml:setup
  # Descargar Berka (Kaggle: marceloventura/the-berka-dataset) — produce trans.csv y loan.csv:
  python -c "import kagglehub; print(kagglehub.dataset_download('marceloventura/the-berka-dataset'))"
  .venv/bin/python prepare_berka.py <dir_con_csvs> out/berka_features.csv [--window-days 90]
  .venv/bin/python train_xgb.py --in out/berka_features.csv --out artifacts/berka --label label
  # Promover si AUC >= 0.72 (deployNewModelVersion, modelType xgb_pd).
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

PRODUCTION_FEATURES = [
    "windowDays", "txCount", "debitCount", "creditCount", "totalDebits", "totalCredits",
    "avgAmount", "stdAmount", "activeDays", "debitCreditRatio", "incomeRegularity",
    "topCategoryShare", "monthlyIncome", "monthlyDebits", "dti", "dtiCapped",
    "incomeTrend30_90", "netCashflowVolatility", "recurringExpenseShare",
]

# Feature set INVARIANTE a la ventana (#B): tasas/shares en vez de conteos/totales que escalan
# con la ventana. Validado: misma AUC que el set crudo (mismo-ventana), y entrenando sobre un MIX
# de ventanas el modelo sirve cualquier ventana sin colapso de escala (ver README). Debe coincidir
# con el subset invariante de features.ts (buildUserFeatureVector).
INVARIANT_FEATURES = [
    "txPerMonth", "debitPerMonth", "creditPerMonth", "activeDaysShare",
    "avgAmount", "stdAmount", "debitCreditRatio", "incomeRegularity", "topCategoryShare",
    "monthlyIncome", "monthlyDebits", "dti", "dtiCapped", "incomeTrend30_90",
    "netCashflowVolatility", "recurringExpenseShare",
]

# Features absolutas en moneda (CZK en Berka) → NO transfieren a CLP. Validado: quitarlas no
# cuesta AUC (0.723 → 0.722, account-grouped). El feature set SCALE-FREE es el deployable a Chile.
CURRENCY_ABSOLUTE = ["avgAmount", "stdAmount", "monthlyIncome", "monthlyDebits"]
SCALE_FREE_FEATURES = [f for f in INVARIANT_FEATURES if f not in CURRENCY_ABSOLUTE]


def add_invariant_columns(row: dict) -> dict:
    """Deriva las features invariantes desde las crudas (mismas fórmulas que features.ts)."""
    months = max(1e-6, row["windowDays"] / 30.0)
    row["txPerMonth"] = row["txCount"] / months
    row["debitPerMonth"] = row["debitCount"] / months
    row["creditPerMonth"] = row["creditCount"] / months
    row["activeDaysShare"] = row["activeDays"] / row["windowDays"] if row["windowDays"] else 0.0
    return row

# Valores de `type` que cuentan como crédito (ingreso). El resto (withdrawal/VYDAJ/VYBER) = débito.
CREDIT_TYPES = {"credit", "prijem", "príjem"}


def read_csv_flexible(path):
    """Berka viene a veces separado por ';'. Detecta el separador."""
    for sep in (",", ";"):
        df = pd.read_csv(path, sep=sep, low_memory=False)
        if df.shape[1] > 1:
            return df
    return pd.read_csv(path)


def parse_berka_date(series):
    """Berka codifica fechas como entero YYMMDD (p.ej. 930101 = 1993-01-01)."""
    s = series.astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6)
    return pd.to_datetime(s, format="%y%m%d", errors="coerce")


def signed_amount(row):
    t = str(row["type"]).strip().lower()
    amt = abs(float(row["amount"]))
    return amt if t in CREDIT_TYPES else -amt


def compute_features(txs: pd.DataFrame, window_days: int) -> dict:
    """Replica buildUserFeatureVector() de features.ts sobre las transacciones de una cuenta."""
    amounts = txs["signed"].to_numpy(dtype=float)
    credits = amounts[amounts > 0]
    debits = amounts[amounts < 0]

    def mean(a): return float(a.mean()) if len(a) else 0.0
    def std(a): return float(a.std()) if len(a) else 0.0

    total_credits = float(credits.sum()) if len(credits) else 0.0
    total_debits_abs = float(np.abs(debits).sum()) if len(debits) else 0.0

    active_days = txs["date"].dt.date.nunique()

    # topCategoryShare por k_symbol (categoría de Berka)
    cats = txs.get("k_symbol")
    if cats is not None and len(txs):
        counts = cats.fillna("uncategorized").astype(str).str.lower().value_counts()
        top_category_share = float(counts.iloc[0] / len(txs)) if len(counts) else 0.0
    else:
        top_category_share = 0.0

    # incomeRegularity: 1 - coefVar de los créditos (igual que features.ts)
    income_regularity = 0.0
    if len(credits) >= 3 and mean(credits) > 0:
        coeff_var = std(credits) / mean(credits)
        income_regularity = max(0.0, min(1.0, 1.0 - coeff_var))

    months = max(1e-6, window_days / 30.0)
    monthly_income = total_credits / months
    monthly_debits = total_debits_abs / months
    dti = monthly_debits / (monthly_income + 1e-6)
    dti_capped = min(dti, 5.0)

    # incomeTrend30_90: créditos últimos 30d / créditos en la ventana
    to_date = txs["date"].max()
    from30 = to_date - pd.Timedelta(days=30)
    income30 = float(txs.loc[(txs["signed"] > 0) & (txs["date"] >= from30), "signed"].sum())
    income_trend = income30 / total_credits if total_credits > 0 else 0.0

    # netCashflowVolatility: std(neto diario) / (|media diaria| + eps)
    daily = txs.groupby(txs["date"].dt.date)["signed"].sum().to_numpy(dtype=float)
    net_vol = std(daily) / (abs(mean(daily)) + 1e-6) if len(daily) else 0.0

    # recurringExpenseShare: contrapartes con >=2 débitos (usa 'account' contraparte, o k_symbol)
    merchant_key = "account" if "account" in txs.columns else "k_symbol"
    recurring_total = 0.0
    if merchant_key in txs.columns:
        deb = txs[txs["signed"] < 0].copy()
        deb["mk"] = deb[merchant_key].fillna("unknown").astype(str).str.lower()
        grp = deb.groupby("mk")["signed"].agg(["count", "sum"])
        recurring_total = float(np.abs(grp.loc[grp["count"] >= 2, "sum"]).sum())
    recurring_share = recurring_total / total_debits_abs if total_debits_abs > 0 else 0.0

    return {
        "windowDays": window_days,
        "txCount": len(txs),
        "debitCount": int(len(debits)),
        "creditCount": int(len(credits)),
        "totalDebits": total_debits_abs,
        "totalCredits": total_credits,
        "avgAmount": mean(amounts),
        "stdAmount": std(amounts),
        "activeDays": int(active_days),
        "debitCreditRatio": total_debits_abs / (total_credits + 1e-6),
        "incomeRegularity": income_regularity,
        "topCategoryShare": top_category_share,
        "monthlyIncome": monthly_income,
        "monthlyDebits": monthly_debits,
        "dti": dti,
        "dtiCapped": dti_capped,
        "incomeTrend30_90": income_trend,
        "netCashflowVolatility": net_vol,
        "recurringExpenseShare": recurring_share,
    }


def build_rows(trans, loan, window_days):
    status_to_label = {"a": 0, "c": 0, "b": 1, "d": 1}
    rows = []
    window = pd.Timedelta(days=window_days)
    for _, ln in loan.iterrows():
        acc = ln["account_id"]
        loan_date = ln["date"]
        label = status_to_label.get(str(ln["status"]).strip().lower())
        if label is None or pd.isna(loan_date):
            continue
        acc_txs = trans[(trans["account_id"] == acc) & (trans["date"] < loan_date) & (trans["date"] >= loan_date - window)]
        if len(acc_txs) < 3:  # muy poca historia previa -> no aporta señal
            continue
        feats = add_invariant_columns(compute_features(acc_txs.copy(), window_days))
        feats["label"] = label
        rows.append(feats)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", help="Directorio con trans.csv y loan.csv de Berka")
    ap.add_argument("out_csv", help="CSV de salida (features + label)")
    ap.add_argument("--window-days", type=int, default=90, help="Ventana antes del préstamo (def 90)")
    ap.add_argument("--invariant", action="store_true",
                    help="Emite el feature set INVARIANTE (16 features) en vez del crudo (19). Para el artefacto servible robusto a la ventana (#B).")
    ap.add_argument("--scale-free", action="store_true",
                    help="Emite solo las 12 features SCALE-FREE (sin las 4 absolutas en moneda). Es el set deployable a Chile (transfiere CZK→CLP). Implica --invariant.")
    ap.add_argument("--multi-window", default=None,
                    help="CSV-list de ventanas, p.ej. '90,180,365'. Concatena las filas de cada ventana (data augmentation) para un modelo robusto a cualquier ventana de serving. Implica --invariant.")
    args = ap.parse_args()

    trans_path = os.path.join(args.data_dir, "trans.csv")
    loan_path = os.path.join(args.data_dir, "loan.csv")
    for p in (trans_path, loan_path):
        if not os.path.exists(p):
            sys.exit(f"No se encontró {p}. Pasa el directorio que contiene trans.csv y loan.csv.")

    trans = read_csv_flexible(trans_path)
    loan = read_csv_flexible(loan_path)
    trans.columns = [c.strip().lower() for c in trans.columns]
    loan.columns = [c.strip().lower() for c in loan.columns]

    trans["date"] = parse_berka_date(trans["date"])
    trans["signed"] = trans.apply(signed_amount, axis=1)
    loan["date"] = parse_berka_date(loan["date"])

    windows = [int(w) for w in args.multi_window.split(",")] if args.multi_window else [args.window_days]
    invariant = args.invariant or args.scale_free or bool(args.multi_window)

    rows = []
    for w in windows:
        rows.extend(build_rows(trans, loan, w))
    if not rows:
        sys.exit("No se generaron filas. ¿Coinciden account_id entre trans y loan? ¿Ventana muy corta?")

    if args.scale_free:
        feature_cols = SCALE_FREE_FEATURES
    elif invariant:
        feature_cols = INVARIANT_FEATURES
    else:
        feature_cols = PRODUCTION_FEATURES
    cols = feature_cols + ["label"]
    out = pd.DataFrame(rows)[cols]
    out.to_csv(args.out_csv, index=False)
    mode = f"{len(feature_cols)}f " + ("SCALE-FREE" if args.scale_free else "INVARIANTE" if invariant else "crudo")
    print(f"Wrote {len(out)} filas [{mode}, ventanas={windows}] -> {args.out_csv}")
    print(f"Label balance: {out['label'].value_counts(normalize=True).round(4).to_dict()}")
    print(f"Defaults: {int(out['label'].sum())} / {len(out)}")


if __name__ == "__main__":
    main()
