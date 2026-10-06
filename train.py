"""Train the fraud model.

Usage:
  python train.py data
  python train.py data/paysim-01-of-06.csv
  python train.py /path/to/one.csv

A directory loads every CSV in it. The PaySim log in this repo is six equal
parts under data/, each with the header row.

Time-based split (train steps <= 600, test > 600) to mimic production.

Note: no class weighting. Weighting inflates probabilities, and we want
well-behaved probabilities because they feed the 0-100 risk score.
"""
import json
import sys
from pathlib import Path

import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, precision_recall_fscore_support

from features import FEATURES, SCORED_TYPES, build_features

SPLIT_STEP = 600
PARAMS = dict(n_estimators=200, learning_rate=0.1, max_depth=6,
              tree_method="hist", random_state=0)


def load_log(args: list[str]) -> pd.DataFrame:
    files = []
    for raw in args:
        path = Path(raw)
        if path.is_dir():
            files.extend(sorted(item for item in path.glob("*.csv") if item.is_file()))
        else:
            files.append(path)
    if not files:
        raise SystemExit("give a csv file or a directory of csv parts")
    frames = [pd.read_csv(path) for path in files]
    return pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]


df = load_log(sys.argv[1:])
df = df[df["type"].isin(SCORED_TYPES)].copy()
X, y = build_features(df), df["isFraud"]

tr, te = df["step"] <= SPLIT_STEP, df["step"] > SPLIT_STEP
model = xgb.XGBClassifier(**PARAMS).fit(X[tr], y[tr])

p = model.predict_proba(X[te])[:, 1]
metrics = {"pr_auc": float(average_precision_score(y[te], p)),
           "test_rows": int(te.sum()), "test_fraud": int(y[te].sum()),
           "test_fraud_rate": float(y[te].mean())}
for th in (0.1, 0.3, 0.5, 0.8):
    pr, rc, _, _ = precision_recall_fscore_support(y[te], p > th, average="binary", zero_division=0)
    metrics[f"thr_{th}"] = {"precision": float(pr), "recall": float(rc), "alerts": int((p > th).sum())}
print(json.dumps(metrics, indent=2))

# Refit on all data for the served model
final = xgb.XGBClassifier(**PARAMS).fit(X, y)
root = Path(__file__).resolve().parent
final.save_model(str(root / "model.json"))
(root / "model_meta.json").write_text(json.dumps({"features": FEATURES, "metrics": metrics}, indent=2))
print("saved model.json, model_meta.json")
