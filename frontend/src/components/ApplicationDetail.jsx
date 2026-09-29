import { useState } from 'react';
import { api } from '../api.js';

function Evaluation({ evaluation }) {
  if (!evaluation?.decision) return null;
  return (
    <div className={`evaluation ${evaluation.decision}`}>
      <h3>Bank decision: {evaluation.decision}</h3>
      {evaluation.decision !== 'denied' && (
        <dl>
          <div>
            <dt>Amount</dt>
            <dd>${evaluation.approvedAmount?.toLocaleString()}</dd>
          </div>
          <div>
            <dt>APR</dt>
            <dd>{evaluation.interestRate}%</dd>
          </div>
          <div>
            <dt>Term</dt>
            <dd>{evaluation.termMonths} months</dd>
          </div>
          <div>
            <dt>Est. payment</dt>
            <dd>${evaluation.monthlyPayment?.toLocaleString()}/mo</dd>
          </div>
        </dl>
      )}
      <p className="muted">Risk score: {evaluation.riskScore}/100</p>
      <ul>
        {evaluation.reasons?.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function Conversation({ messages }) {
  return (
    <div className="conversation">
      {messages.map((m) => (
        <div key={m._id} className={`msg ${m.agent}`}>
          <span className="agent-name">
            {m.agent === 'bank-agent' ? '🏦 Bank agent' : m.agent === 'client-agent' ? '🙋 Client agent' : 'System'}
          </span>
          <p>{m.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function ApplicationDetail({ application, onBack, onUpdated }) {
  const [busy, setBusy] = useState(false);

  const renegotiate = async () => {
    setBusy(true);
    try {
      onUpdated(await api.renegotiate(application._id));
    } finally {
      setBusy(false);
    }
  };

  const { applicant, loan } = application;
  return (
    <div className="card">
      <button onClick={onBack} className="link">
        ← Back to list
      </button>
      <h2>
        {applicant.name} — ${loan.amount.toLocaleString()} {loan.purpose} loan
      </h2>
      <p className="muted">
        Income ${applicant.annualIncome.toLocaleString()}/yr · debt ${applicant.monthlyDebt.toLocaleString()}/mo ·
        credit {applicant.creditScore} · {applicant.employmentStatus} ·{' '}
        <span className={`badge ${application.status}`}>{application.status}</span>
      </p>

      <Evaluation evaluation={application.evaluation} />

      <h3>Agent-to-agent conversation</h3>
      <Conversation messages={application.conversation} />

      {['denied', 'countered', 'accepted'].includes(application.status) && (
        <button onClick={renegotiate} disabled={busy}>
          {busy ? 'Negotiating…' : 'Re-run negotiation'}
        </button>
      )}
    </div>
  );
}
