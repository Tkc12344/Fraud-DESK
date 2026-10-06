"""Pre-decision features only.

Everything here must be computable BEFORE a transaction is approved, so
newbalanceOrig / newbalanceDest (post-transaction) are deliberately excluded.
"""
import numpy as np
import pandas as pd

SCORED_TYPES = ["TRANSFER", "CASH_OUT"]  # the only types with fraud in PaySim

FEATURES = [
    "is_transfer", "log_amount", "oldbalanceOrg", "oldbalanceDest",
    "drains_account", "amount_ratio", "dest_empty", "hour",
]

# Human-readable text for reason codes
REASONS = {
    "is_transfer": "Transaction type is TRANSFER",
    "log_amount": "Unusually large amount",
    "oldbalanceOrg": "Sender balance level",
    "oldbalanceDest": "Destination balance level",
    "drains_account": "Amount equals the sender's entire balance",
    "amount_ratio": "Amount is a very high share of sender's balance",
    "dest_empty": "Destination account had a zero balance",
    "hour": "Time of day pattern",
}


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["is_transfer"] = (df["type"] == "TRANSFER").astype(int)
    out["log_amount"] = np.log1p(df["amount"])
    out["oldbalanceOrg"] = df["oldbalanceOrg"]
    out["oldbalanceDest"] = df["oldbalanceDest"]
    out["drains_account"] = (
        (df["oldbalanceOrg"] > 0) & np.isclose(df["amount"], df["oldbalanceOrg"])
    ).astype(int)
    out["amount_ratio"] = df["amount"] / (df["oldbalanceOrg"] + 1)
    out["dest_empty"] = (df["oldbalanceDest"] == 0).astype(int)
    out["hour"] = df["step"] % 24
    return out[FEATURES]
