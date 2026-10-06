import express from "express";
import { randomUUID } from "node:crypto";
import { getCase, insertCase, listCases, resolveCase, stats } from "./db.js";

const SCORER = process.env.SCORER_URL ?? "http://127.0.0.1:8000";
const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());

function transactionFrom(body) {
  return {
    step: body?.step,
    type: body?.type,
    amount: body?.amount,
    oldbalanceOrg: body?.oldbalanceOrg,
    oldbalanceDest: body?.oldbalanceDest,
    nameOrig: body?.nameOrig || null,
    nameDest: body?.nameDest || null,
  };
}

app.get("/api/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", async (_req, res) => {
  try {
    const response = await fetch(`${SCORER}/health`);
    if (!response.ok) throw new Error(`scorer ${response.status}`);
    res.json({ status: "ok", scorer: await response.json() });
  } catch {
    res.status(503).json({ status: "degraded", error: "Scoring service is not reachable." });
  }
});

app.get("/api/stats", (_req, res) => {
  res.json(stats());
});

app.get("/api/cases", (req, res) => {
  const status = req.query.status;
  if (status && status !== "open" && status !== "closed") {
    res.status(400).json({ error: "status must be open or closed" });
    return;
  }
  res.json(listCases({ status, limit: req.query.limit }));
});

app.get("/api/cases/:id", (req, res) => {
  const row = getCase(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  res.json(row);
});

app.post("/api/score", async (req, res) => {
  const transaction = transactionFrom(req.body);
  let scored;
  try {
    const response = await fetch(`${SCORER}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transaction),
    });
    const body = await response.json();
    if (!response.ok) {
      res.status(response.status).json(body);
      return;
    }
    scored = body;
  } catch {
    res.status(503).json({ error: "Scoring service is not reachable." });
    return;
  }

  const decision = scored.decision;
  const row = insertCase({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...transaction,
    risk_score: scored.risk_score,
    model_decision: decision,
    final_decision: decision,
    model_probability: scored.model_probability,
    rules_triggered: scored.rules_triggered,
    reasons: scored.reasons,
    stage: scored.stage,
    status: decision === "REVIEW" ? "open" : "closed",
    analyst_note: null,
    resolved_at: decision === "REVIEW" ? null : new Date().toISOString(),
  });
  res.status(201).json(row);
});

app.post("/api/cases/:id/resolve", (req, res) => {
  const decision = req.body?.decision;
  if (decision !== "APPROVE" && decision !== "BLOCK") {
    res.status(400).json({ error: "decision must be APPROVE or BLOCK" });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const row = resolveCase(req.params.id, decision, note);
  if (!row) {
    res.status(404).json({ error: "Case not found" });
    return;
  }
  res.json(row);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`fraud desk api on http://0.0.0.0:${PORT}`);
});
