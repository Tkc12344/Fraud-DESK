# Fraud-DESK

Fraud-DESK scores a payment before it settles. A Python model returns a risk score and reason codes, a Node API stores the case, and the React desk is where an analyst works the queue.

Only fields that exist before approval are used. Post-transaction balances are excluded.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
npm run dev
```

- Scoring API: http://127.0.0.1:8000/docs
- Desk API: http://127.0.0.1:4000
- Fraud-DESK: http://127.0.0.1:5173

`model.json` is already trained. The PaySim log is in `data/` as six equal parts, about 82MB each, because the original file is 493MB and GitHub rejects files over 100MB. Each part has the header row. Together they are the full log, 6,362,620 transactions. To refit the model:

```bash
.venv/bin/python train.py data
```

## Docker

The Fraud-DESK UI is the only published port. The scorer and the API stay on the compose network. Cases are stored in the `cases` volume.

```bash
docker compose up --build
```

Fraud-DESK: http://127.0.0.1:8080

## End-to-end tests

The API suite and the browser suite both go through Fraud-DESK on port 8080, so the scorer, the case store, and the UI are all in the path.

```bash
docker compose up --build -d
npm install
npx playwright install chromium
npm run e2e
```

## CI/CD

`.github/workflows/ci.yml` renders the Kubernetes manifests, builds the Compose stack, and runs both suites on every push and pull request.

`.github/workflows/cd.yml` runs after that succeeds on `main`. It publishes `fraud-desk-scorer`, `fraud-desk-api`, and `fraud-desk-web` to GHCR, tagged with the commit and `latest`. If the repository secret `KUBECONFIG` is set, it deploys those images into the `fraud-desk` namespace. The cluster has to be able to pull from GHCR.

## Kubernetes

SQLite keeps the API at one replica. The scorer and the web tier can scale. Build the same images, load them into the cluster, then apply the manifests. `imagePullPolicy` is `IfNotPresent`, and the tag is `local`.

```bash
docker compose build
kind load docker-image fraud-desk-scorer:local fraud-desk-api:local fraud-desk-web:local
kubectl apply -k k8s
```

Fraud-DESK is a NodePort service on port 30080. The API calls the scorer at `http://scorer:8000`. A 1Gi volume holds `cases.sqlite`.

## Score one transaction

```bash
curl -X POST localhost:8000/score -H 'content-type: application/json' \
  -d '{"step":4,"type":"TRANSFER","amount":181000,"oldbalanceOrg":181000,"oldbalanceDest":0}'
```

Returns `risk_score` (0-100), `decision` (`APPROVE` / `REVIEW` / `BLOCK`), `rules_triggered`, and `reasons` (top model contributions). Fraud-DESK stores that response. `REVIEW` opens a case; `APPROVE` and `BLOCK` close it. An analyst can still override a closed case.

## Design notes

- **Pre-decision features only** (`features.py`): post-transaction balances are excluded because they don't exist before approval.
- **Type gate**: PAYMENT / CASH_IN / DEBIT had zero fraud in the data and skip the model.
- **No class weighting**: it inflated probabilities in testing; unweighted keeps the 0-100 score meaningful.
- **Thresholds** (`REVIEW_AT=30`, `BLOCK_AT=80` in `app.py`) are placeholders: set them from your cost of missed fraud vs. analyst time.
- **Rule floor**: a transfer over 200,000 into an empty destination is raised to at least review.
- **Caveat**: PaySim is synthetic and fraud is near-deterministic (drain the account into an empty destination), so ~100% test accuracy will NOT carry over to real data.
- LightGBM was tried first and underperformed badly on these features; XGBoost and sklearn both worked, so XGBoost is used (it also gives native per-feature contributions for reason codes).
