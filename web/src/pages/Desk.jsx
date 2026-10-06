import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PRESETS } from "../presets.js";
import { CaseTable } from "../ui.jsx";

export default function Desk() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [nextStats, nextCases] = await Promise.all([api("/api/stats"), api("/api/cases?limit=12")]);
    setStats(nextStats);
    setCases(nextCases);
  }

  useEffect(() => {
    api("/api/health")
      .then(setHealth)
      .catch((err) => setHealthError(err.message));
    load().catch((err) => setError(err.message));
  }, []);

  async function scoreBook() {
    setBusy(true);
    setError("");
    try {
      for (const preset of PRESETS) {
        await api("/api/score", { method: "POST", body: JSON.stringify(preset.tx) });
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = stats?.by_final_decision ?? { APPROVE: 0, REVIEW: 0, BLOCK: 0 };
  const metrics = health?.scorer?.model_metrics;
  const policy = health?.scorer?.policy;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Desk</h1>
          <p className="lede">
            Every transfer and cash-out is scored before it settles. Payments, cash-in, and debit skip the model.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={scoreBook} disabled={busy || Boolean(healthError)}>
            {busy ? "Scoring…" : "Score sample book"}
          </button>
          <Link className="btn" to="/score">
            Score a transaction
          </Link>
        </div>
      </div>

      {healthError ? <p className="banner">{healthError} Start the scoring service on port 8000.</p> : null}
      {error ? <p className="banner">{error}</p> : null}

      <section className="stats">
        <Stat label="Open reviews" value={stats?.open ?? "—"} tone="review" />
        <Stat label="Approved" value={counts.APPROVE} tone="approve" />
        <Stat label="Blocked" value={counts.BLOCK} tone="block" />
        <Stat label="Scored" value={stats?.total ?? "—"} />
      </section>

      <section className="panel policy">
        <div>
          <h2>Policy</h2>
          <p>
            Review at <strong>{policy?.review_at ?? 30}</strong>. Block at <strong>{policy?.block_at ?? 80}</strong>.
            A transfer over 200,000 into an empty account is raised to review even when the model is quiet.
          </p>
        </div>
        <div>
          <h2>Model</h2>
          <p>
            Holdout PR-AUC{" "}
            <strong className="mono">{metrics ? metrics.pr_auc.toFixed(3) : "—"}</strong>
            {metrics ? ` on ${metrics.test_fraud.toLocaleString()} fraud rows.` : ""} PaySim fraud is nearly
            deterministic, so this number will not carry over to live traffic.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent cases</h2>
          <Link to="/queue">Open queue</Link>
        </div>
        {cases == null ? (
          <p className="muted">Loading cases…</p>
        ) : (
          <CaseTable cases={cases} empty="No cases yet. Score a transaction, or load the sample book." />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <article className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
