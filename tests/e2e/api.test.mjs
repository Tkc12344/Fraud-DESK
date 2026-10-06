import assert from "node:assert/strict";
import { describe, test } from "node:test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8080";

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function score(transaction) {
  return api("/api/score", { method: "POST", body: JSON.stringify(transaction) });
}

describe("fraud desk API", () => {
  test("health reports the scorer policy", async () => {
    const { status, body } = await api("/api/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.scorer.policy.review_at, 30);
    assert.equal(body.scorer.policy.block_at, 80);
    assert.ok(body.scorer.model_metrics.pr_auc > 0.99);
  });

  test("payment, cash-in, and debit skip the model", async () => {
    const samples = [
      { step: 1, type: "PAYMENT", amount: 9839.64, oldbalanceOrg: 170136, oldbalanceDest: 0 },
      { step: 1, type: "CASH_IN", amount: 143236.26, oldbalanceOrg: 0, oldbalanceDest: 608932.17 },
      { step: 1, type: "DEBIT", amount: 5337.77, oldbalanceOrg: 41720, oldbalanceDest: 41898 },
    ];
    for (const transaction of samples) {
      const { status, body } = await score(transaction);
      assert.equal(status, 201, transaction.type);
      assert.equal(body.final_decision, "APPROVE");
      assert.equal(body.risk_score, 1);
      assert.equal(body.stage, "type_gate");
      assert.equal(body.status, "closed");
      assert.equal(body.model_probability, null);
      assert.deepEqual(body.rules_triggered, []);
    }
  });

  test("a full-balance transfer is blocked with a drain reason", async () => {
    const { status, body } = await score({
      step: 4,
      type: "TRANSFER",
      amount: 181000,
      oldbalanceOrg: 181000,
      oldbalanceDest: 0,
    });
    assert.equal(status, 201);
    assert.equal(body.final_decision, "BLOCK");
    assert.ok(body.risk_score >= 80);
    assert.equal(body.status, "closed");
    assert.ok(body.rules_triggered.includes("DRAINS_ENTIRE_BALANCE"));
    assert.ok(body.reasons.some((reason) => reason.feature === "drains_account"));
  });

  test("a full-balance cash-out is blocked without the empty-destination rule", async () => {
    const { status, body } = await score({
      step: 1,
      type: "CASH_OUT",
      amount: 181,
      oldbalanceOrg: 181,
      oldbalanceDest: 21182,
    });
    assert.equal(status, 201);
    assert.equal(body.final_decision, "BLOCK");
    assert.ok(body.rules_triggered.includes("DRAINS_ENTIRE_BALANCE"));
    assert.equal(body.rules_triggered.includes("DESTINATION_ACCOUNT_EMPTY"), false);
  });

  test("a small funded transfer is approved", async () => {
    const { status, body } = await score({
      step: 8,
      type: "TRANSFER",
      amount: 500,
      oldbalanceOrg: 20000,
      oldbalanceDest: 8000,
    });
    assert.equal(status, 201);
    assert.equal(body.final_decision, "APPROVE");
    assert.equal(body.status, "closed");
    assert.deepEqual(body.reasons, []);
  });

  test("a large transfer into an empty account waits for an analyst", async () => {
    const { status, body } = await score({
      step: 12,
      type: "TRANSFER",
      amount: 250000,
      oldbalanceOrg: 900000,
      oldbalanceDest: 0,
      nameOrig: `api-${Date.now()}`,
    });
    assert.equal(status, 201);
    assert.equal(body.final_decision, "REVIEW");
    assert.equal(body.risk_score, 30);
    assert.equal(body.status, "open");
    assert.ok(body.rules_triggered.includes("LARGE_TRANSFER_OVER_200K"));
    assert.ok(body.rules_triggered.includes("DESTINATION_ACCOUNT_EMPTY"));

    const open = await api("/api/cases?status=open");
    assert.equal(open.status, 200);
    assert.ok(open.body.some((row) => row.id === body.id));

    const bad = await api(`/api/cases/${body.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision: "MAYBE" }),
    });
    assert.equal(bad.status, 400);

    const released = await api(`/api/cases/${body.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", note: "api release" }),
    });
    assert.equal(released.status, 200);
    assert.equal(released.body.final_decision, "APPROVE");
    assert.equal(released.body.model_decision, "REVIEW");
    assert.equal(released.body.status, "closed");
    assert.equal(released.body.analyst_note, "api release");

    const stillOpen = await api("/api/cases?status=open");
    assert.equal(stillOpen.body.some((row) => row.id === body.id), false);

    const blocked = await api(`/api/cases/${body.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision: "BLOCK", note: "api override" }),
    });
    assert.equal(blocked.body.final_decision, "BLOCK");
    assert.equal(blocked.body.analyst_note, "api override");
  });

  test("invalid transactions and missing cases are rejected", async () => {
    const badType = await score({
      step: 1,
      type: "WIRE",
      amount: 10,
      oldbalanceOrg: 10,
      oldbalanceDest: 0,
    });
    assert.equal(badType.status, 422);

    const negative = await score({
      step: 1,
      type: "TRANSFER",
      amount: -5,
      oldbalanceOrg: 10,
      oldbalanceDest: 0,
    });
    assert.equal(negative.status, 422);

    const missing = await api("/api/cases/does-not-exist");
    assert.equal(missing.status, 404);

    const badStatus = await api("/api/cases?status=nope");
    assert.equal(badStatus.status, 400);
  });

  test("stats match the stored book", async () => {
    const stats = await api("/api/stats");
    const listed = await api("/api/cases?limit=500");
    assert.equal(stats.status, 200);
    assert.equal(listed.status, 200);
    const by = { APPROVE: 0, REVIEW: 0, BLOCK: 0 };
    let open = 0;
    for (const row of listed.body) {
      by[row.final_decision] += 1;
      if (row.status === "open") open += 1;
    }
    assert.equal(stats.body.total, listed.body.length);
    assert.equal(stats.body.open, open);
    assert.deepEqual(stats.body.by_final_decision, by);
  });
});
