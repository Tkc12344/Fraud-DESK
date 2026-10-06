"""Fraud scoring service.

Run:  uvicorn app:app --port 8000
Docs: http://localhost:8000/docs

Pipeline: type gate -> rules -> ML model -> risk engine -> decision + reason codes.
The LLM explanation layer should consume `reasons` from this response;
it should never decide or invent reasons itself.
"""
import json
from pathlib import Path
from typing import Literal

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI
from pydantic import BaseModel, Field

from features import FEATURES, REASONS, SCORED_TYPES, build_features

ROOT = Path(__file__).resolve().parent
REVIEW_AT = 30   # score >= 30 -> manual review / step-up auth
BLOCK_AT = 80    # score >= 80 -> block

booster = xgb.Booster()
booster.load_model(str(ROOT / "model.json"))
meta = json.loads((ROOT / "model_meta.json").read_text())

app = FastAPI(title="Fraud Scoring Service", version="0.1.0")


class Transaction(BaseModel):
    step: int = Field(ge=0, description="Hour index (1 step = 1 hour)")
    type: Literal["PAYMENT", "TRANSFER", "CASH_OUT", "CASH_IN", "DEBIT"]
    amount: float = Field(ge=0)
    oldbalanceOrg: float = Field(ge=0)
    oldbalanceDest: float = Field(ge=0)
    nameOrig: str | None = None
    nameDest: str | None = None


class Decision(BaseModel):
    risk_score: int
    decision: Literal["APPROVE", "REVIEW", "BLOCK"]
    model_probability: float | None
    rules_triggered: list[str]
    reasons: list[dict]
    stage: str


def run_rules(t: Transaction) -> list[str]:
    hits = []
    if t.type in SCORED_TYPES and t.oldbalanceOrg > 0 and abs(t.amount - t.oldbalanceOrg) < 0.01:
        hits.append("DRAINS_ENTIRE_BALANCE")
    if t.type == "TRANSFER" and t.amount > 200_000:
        hits.append("LARGE_TRANSFER_OVER_200K")  # mirrors the dataset's legacy isFlaggedFraud rule
    if t.type in SCORED_TYPES and t.oldbalanceDest == 0:
        hits.append("DESTINATION_ACCOUNT_EMPTY")
    return hits


def band(score: int) -> str:
    return "BLOCK" if score >= BLOCK_AT else "REVIEW" if score >= REVIEW_AT else "APPROVE"


@app.get("/health")
def health():
    return {
        "status": "ok",
        "policy": {"review_at": REVIEW_AT, "block_at": BLOCK_AT},
        "model_metrics": meta["metrics"],
    }


@app.post("/score", response_model=Decision)
def score(t: Transaction) -> Decision:
    # 1. Type gate: PAYMENT / CASH_IN / DEBIT showed zero fraud in the training data
    if t.type not in SCORED_TYPES:
        return Decision(risk_score=1, decision="APPROVE", model_probability=None,
                        rules_triggered=[], reasons=[], stage="type_gate")

    # 2. Rules
    rules = run_rules(t)

    # 3. ML model (+ per-feature contributions as reason codes)
    X = build_features(pd.DataFrame([t.model_dump()]))
    dm = xgb.DMatrix(X, feature_names=FEATURES)
    prob = float(booster.predict(dm)[0])
    contribs = booster.predict(dm, pred_contribs=True)[0][:-1]  # last col is the bias term
    top = sorted(zip(FEATURES, contribs), key=lambda kv: kv[1], reverse=True)[:3]
    reasons = [{"feature": f, "impact": round(float(c), 3), "text": REASONS[f]}
               for f, c in top if c > 0]

    # 4. Risk engine: model probability sets the score; a hard rule combo can only raise it
    risk = round(prob * 100)
    if "LARGE_TRANSFER_OVER_200K" in rules and "DESTINATION_ACCOUNT_EMPTY" in rules:
        risk = max(risk, REVIEW_AT)
    risk = max(0, min(100, risk))

    decision = band(risk)
    if decision == "APPROVE":
        reasons = []  # nothing to explain; positive contributions here are just noise vs. the baseline
    return Decision(risk_score=risk, decision=decision, model_probability=round(prob, 4),
                    rules_triggered=rules, reasons=reasons, stage="model")
