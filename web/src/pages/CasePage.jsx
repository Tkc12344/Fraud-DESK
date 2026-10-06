import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { amount, hourOf, when } from "../format.js";
import { DecisionBadge, Reasons, RuleFloorNote, ScoreBar } from "../ui.jsx";

export default function CasePage() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api(`/api/cases/${id}`)
      .then((body) => {
        if (stop) return;
        setRow(body);
        setNote(body.analyst_note ?? "");
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    return () => {
      stop = true;
    };
  }, [id]);

  async function resolve(decision) {
    setBusy(true);
    setError("");
    try {
      const updated = await api(`/api/cases/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      });
      setRow(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !row) return <div className="page"><p className="banner">{error}</p></div>;
  if (!row) return <div className="page"><p className="muted">Loading case…</p></div>;

  return (
    <div className="page">
      <p className="crumb">
        <Link to="/">Desk</Link> / Case
      </p>
      <div className="page-head">
        <div>
          <h1>{row.type}</h1>
          <p className="lede">
            Scored {when(row.created_at)} · hour {hourOf(row.step)} · {row.status === "open" ? "open" : "closed"}
          </p>
        </div>
        <DecisionBadge decision={row.final_decision} />
      </div>
      {error ? <p className="banner">{error}</p> : null}

      <div className="split">
        <section className="panel">
          <div className="result-head">
            <div>
              <span className="kicker">Risk score</span>
              <p className="score-num">{row.risk_score}</p>
            </div>
            <p className="muted">
              Model said <strong>{row.model_decision}</strong>
              {row.model_probability == null ? "" : ` · p ${row.model_probability.toFixed(4)}`}
            </p>
          </div>
          <ScoreBar score={row.risk_score} />
          <RuleFloorNote row={row} />
          <h2>Transaction</h2>
          <dl className="facts">
            <div>
              <dt>Amount</dt>
              <dd className="mono">{amount(row.amount)}</dd>
            </div>
            <div>
              <dt>Sender balance</dt>
              <dd className="mono">{amount(row.oldbalanceOrg)}</dd>
            </div>
            <div>
              <dt>Destination balance</dt>
              <dd className="mono">{amount(row.oldbalanceDest)}</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd className="mono">{row.nameOrig || "—"}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd className="mono">{row.nameDest || "—"}</dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{row.stage === "type_gate" ? "Type gate" : "Model"}</dd>
            </div>
          </dl>
          <h2>Rules</h2>
          {row.rules_triggered.length ? (
            <ul className="chips">
              {row.rules_triggered.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rules fired.</p>
          )}
          <h2>Reason codes</h2>
          <Reasons reasons={row.reasons} />
        </section>

        <section className="panel">
          <h2>Analyst decision</h2>
          <p className="muted">
            {row.status === "open"
              ? "This score is in the review band. Release it or stop it."
              : "This case is closed. You can still override the final decision."}
          </p>
          {row.resolved_at ? <p className="muted">Last decision {when(row.resolved_at)}.</p> : null}
          <label>
            Note
            <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="row-actions">
            <button type="button" className="btn approve" disabled={busy} onClick={() => resolve("APPROVE")}>
              Approve
            </button>
            <button type="button" className="btn block" disabled={busy} onClick={() => resolve("BLOCK")}>
              Block
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
