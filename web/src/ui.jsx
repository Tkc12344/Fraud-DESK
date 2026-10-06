import { Link } from "react-router-dom";
import { amount, when } from "./format.js";

export function DecisionBadge({ decision }) {
  if (!decision) return null;
  return <span className={`badge badge-${decision.toLowerCase()}`}>{decision}</span>;
}

export function ScoreBar({ score }) {
  const tone = score >= 80 ? "block" : score >= 30 ? "review" : "approve";
  return (
    <div className="scorebar" aria-hidden="true">
      <div className={`scorebar-fill tone-${tone}`} style={{ width: `${Math.max(score, 1.5)}%` }} />
      <span className="scorebar-tick" style={{ left: "30%" }} title="Review at 30" />
      <span className="scorebar-tick block" style={{ left: "80%" }} title="Block at 80" />
    </div>
  );
}

export function CaseTable({ cases, empty }) {
  if (!cases.length) {
    return <p className="empty">{empty}</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th className="num">Amount</th>
            <th className="num">Score</th>
            <th>Decision</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={`/cases/${row.id}`}>{when(row.created_at)}</Link>
              </td>
              <td>{row.type}</td>
              <td className="num">{amount(row.amount)}</td>
              <td className="num">{row.risk_score}</td>
              <td>
                <DecisionBadge decision={row.final_decision} />
                {row.final_decision !== row.model_decision ? (
                  <span className="override">model said {row.model_decision}</span>
                ) : null}
              </td>
              <td className="muted">{row.stage === "type_gate" ? "Type gate" : "Model"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RuleFloorNote({ row }) {
  if (row.model_probability == null || row.model_probability >= 0.3 || row.risk_score < 30) return null;
  return (
    <p className="muted">
      The model probability is under 0.30. Rules raised this score into the review band.
    </p>
  );
}

export function Reasons({ reasons }) {
  if (!reasons?.length) {
    return <p className="muted">No reason codes. Approved scores stay unexplained so noise is not narrated.</p>;
  }
  const max = Math.max(...reasons.map((reason) => reason.impact), 0.01);
  return (
    <ul className="reasons">
      {reasons.map((reason) => (
        <li key={reason.feature}>
          <div className="reason-top">
            <strong>{reason.text}</strong>
            <span className="mono">+{reason.impact.toFixed(3)}</span>
          </div>
          <div className="reason-track">
            <div style={{ width: `${(reason.impact / max) * 100}%` }} />
          </div>
          <span className="muted mono">{reason.feature}</span>
        </li>
      ))}
    </ul>
  );
}
