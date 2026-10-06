import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { amount, hourOf } from "../format.js";
import { PRESETS } from "../presets.js";
import { DecisionBadge, Reasons, RuleFloorNote, ScoreBar } from "../ui.jsx";

const TYPES = ["TRANSFER", "CASH_OUT", "PAYMENT", "CASH_IN", "DEBIT"];

export default function Score() {
  const [tx, setTx] = useState(PRESETS[0].tx);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setField(name, value) {
    setPresetId("");
    setTx((current) => ({ ...current, [name]: value }));
  }

  function applyPreset(preset) {
    setPresetId(preset.id);
    setTx(preset.tx);
    setResult(null);
    setError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        ...tx,
        step: Number(tx.step),
        amount: Number(tx.amount),
        oldbalanceOrg: Number(tx.oldbalanceOrg),
        oldbalanceDest: Number(tx.oldbalanceDest),
      };
      setResult(await api("/api/score", { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Score</h1>
          <p className="lede">
            Only fields known before approval are sent. Post-transaction balances are never used.
          </p>
        </div>
      </div>

      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset${presetId === preset.id ? " active" : ""}`}
            onClick={() => applyPreset(preset)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.detail}</span>
          </button>
        ))}
      </div>

      <div className="split">
        <form className="panel form" onSubmit={onSubmit}>
          <label>
            Hour step
            <input
              type="number"
              min="0"
              required
              value={tx.step}
              onChange={(event) => setField("step", event.target.value)}
            />
            <small>Hour {hourOf(tx.step)} in the simulated day.</small>
          </label>
          <label>
            Type
            <select value={tx.type} onChange={(event) => setField("type", event.target.value)}>
              {TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="any"
              required
              value={tx.amount}
              onChange={(event) => setField("amount", event.target.value)}
            />
          </label>
          <label>
            Sender balance before
            <input
              type="number"
              min="0"
              step="any"
              required
              value={tx.oldbalanceOrg}
              onChange={(event) => setField("oldbalanceOrg", event.target.value)}
            />
          </label>
          <label>
            Destination balance before
            <input
              type="number"
              min="0"
              step="any"
              required
              value={tx.oldbalanceDest}
              onChange={(event) => setField("oldbalanceDest", event.target.value)}
            />
          </label>
          <label>
            Origin account
            <input value={tx.nameOrig ?? ""} onChange={(event) => setField("nameOrig", event.target.value)} />
          </label>
          <label>
            Destination account
            <input value={tx.nameDest ?? ""} onChange={(event) => setField("nameDest", event.target.value)} />
          </label>
          {error ? <p className="banner">{error}</p> : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Scoring…" : "Score transaction"}
          </button>
        </form>

        <section className="panel result">
          {result ? <Result result={result} /> : <p className="empty">The decision, rules, and reason codes land here.</p>}
        </section>
      </div>
    </div>
  );
}

function Result({ result }) {
  return (
    <>
      <div className="result-head">
        <div>
          <span className="kicker">Risk score</span>
          <p className="score-num">{result.risk_score}</p>
        </div>
        <DecisionBadge decision={result.final_decision} />
      </div>
      <ScoreBar score={result.risk_score} />
      <RuleFloorNote row={result} />
      <dl className="facts">
        <div>
          <dt>Stage</dt>
          <dd>{result.stage === "type_gate" ? "Type gate" : "Model"}</dd>
        </div>
        <div>
          <dt>Model probability</dt>
          <dd className="mono">{result.model_probability == null ? "—" : result.model_probability.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="mono">{amount(result.amount)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{result.status === "open" ? "Waiting on an analyst" : "Closed"}</dd>
        </div>
      </dl>
      <h2>Rules</h2>
      {result.rules_triggered.length ? (
        <ul className="chips">
          {result.rules_triggered.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No rules fired.</p>
      )}
      <h2>Reason codes</h2>
      <Reasons reasons={result.reasons} />
      <Link className="text-link" to={`/cases/${result.id}`}>
        Open case
      </Link>
    </>
  );
}
