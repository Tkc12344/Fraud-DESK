import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { amount, when } from "../format.js";
import { DecisionBadge } from "../ui.jsx";

export default function Queue() {
  const [cases, setCases] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  async function load() {
    setCases(await api("/api/cases?status=open"));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function resolve(id, decision) {
    setPendingId(id);
    setError("");
    try {
      await api(`/api/cases/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision, note: notes[id] ?? "" }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingId("");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Queue</h1>
          <p className="lede">Scores from 30 to 79 wait here. Approve to release, or block to stop the payment.</p>
        </div>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {cases == null ? <p className="muted">Loading queue…</p> : null}
      {cases?.length === 0 ? (
        <p className="empty">Nothing is waiting. A case lands here when the score is at least 30 and below 80.</p>
      ) : null}
      <div className="queue">
        {cases?.map((row) => (
          <article key={row.id} className="panel queue-card">
            <div className="queue-top">
              <div>
                <DecisionBadge decision={row.model_decision} />
                <h2>
                  <Link to={`/cases/${row.id}`}>{row.type}</Link>
                </h2>
                <p className="muted">
                  {when(row.created_at)} · score {row.risk_score}
                </p>
              </div>
              <p className="queue-amount">{amount(row.amount)}</p>
            </div>
            <dl className="facts compact">
              <div>
                <dt>Sender balance</dt>
                <dd className="mono">{amount(row.oldbalanceOrg)}</dd>
              </div>
              <div>
                <dt>Destination balance</dt>
                <dd className="mono">{amount(row.oldbalanceDest)}</dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd>{row.rules_triggered.length ? row.rules_triggered.join(", ") : "None"}</dd>
              </div>
            </dl>
            <label>
              Analyst note
              <input
                value={notes[row.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="row-actions">
              <button type="button" className="btn approve" disabled={pendingId === row.id} onClick={() => resolve(row.id, "APPROVE")}>
                Approve
              </button>
              <button type="button" className="btn block" disabled={pendingId === row.id} onClick={() => resolve(row.id, "BLOCK")}>
                Block
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
