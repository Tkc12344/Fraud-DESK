import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "cases.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    step INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    oldbalance_org REAL NOT NULL,
    oldbalance_dest REAL NOT NULL,
    name_orig TEXT,
    name_dest TEXT,
    risk_score INTEGER NOT NULL,
    model_decision TEXT NOT NULL,
    final_decision TEXT NOT NULL,
    model_probability REAL,
    rules_triggered TEXT NOT NULL,
    reasons TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    analyst_note TEXT,
    resolved_at TEXT
  );
`);

function rowToCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    step: row.step,
    type: row.type,
    amount: row.amount,
    oldbalanceOrg: row.oldbalance_org,
    oldbalanceDest: row.oldbalance_dest,
    nameOrig: row.name_orig,
    nameDest: row.name_dest,
    risk_score: row.risk_score,
    model_decision: row.model_decision,
    final_decision: row.final_decision,
    model_probability: row.model_probability,
    rules_triggered: JSON.parse(row.rules_triggered),
    reasons: JSON.parse(row.reasons),
    stage: row.stage,
    status: row.status,
    analyst_note: row.analyst_note,
    resolved_at: row.resolved_at,
  };
}

const insert = db.prepare(`
  INSERT INTO cases (
    id, created_at, step, type, amount, oldbalance_org, oldbalance_dest,
    name_orig, name_dest, risk_score, model_decision, final_decision,
    model_probability, rules_triggered, reasons, stage, status, analyst_note, resolved_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function insertCase(row) {
  insert.run(
    row.id,
    row.created_at,
    row.step,
    row.type,
    row.amount,
    row.oldbalanceOrg,
    row.oldbalanceDest,
    row.nameOrig,
    row.nameDest,
    row.risk_score,
    row.model_decision,
    row.final_decision,
    row.model_probability,
    JSON.stringify(row.rules_triggered),
    JSON.stringify(row.reasons),
    row.stage,
    row.status,
    row.analyst_note,
    row.resolved_at,
  );
  return getCase(row.id);
}

export function getCase(id) {
  return rowToCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(id));
}

export function listCases({ status, limit = 100 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (status === "open" || status === "closed") {
    return db
      .prepare("SELECT * FROM cases WHERE status = ? ORDER BY created_at DESC LIMIT ?")
      .all(status, cap)
      .map(rowToCase);
  }
  return db
    .prepare("SELECT * FROM cases ORDER BY created_at DESC LIMIT ?")
    .all(cap)
    .map(rowToCase);
}

export function resolveCase(id, decision, note) {
  const existing = db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE cases SET final_decision = ?, status = 'closed', analyst_note = ?, resolved_at = ? WHERE id = ?",
  ).run(decision, note, now, id);
  return getCase(id);
}

export function stats() {
  const rows = db
    .prepare("SELECT final_decision, status, COUNT(*) AS n FROM cases GROUP BY final_decision, status")
    .all();
  const byFinalDecision = { APPROVE: 0, REVIEW: 0, BLOCK: 0 };
  let total = 0;
  let open = 0;
  for (const row of rows) {
    total += row.n;
    if (row.status === "open") open += row.n;
    if (byFinalDecision[row.final_decision] != null) byFinalDecision[row.final_decision] += row.n;
  }
  return { total, open, by_final_decision: byFinalDecision };
}
