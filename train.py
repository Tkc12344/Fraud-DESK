"""Train the fraud model.

Usage: python train.py /path/to/PS_..._log.csv
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

df = pd.read_csv(sys.argv[1])
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
