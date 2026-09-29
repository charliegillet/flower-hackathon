import { useState } from 'react';
import { api } from '../api.js';

function Evaluation({ evaluation }) {
  if (!evaluation?.decision) return null;
  return (
    <div className={`evaluation ${evaluation.decision}`}>
      <h3>Agent evaluation: {evaluation.decision}</h3>
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

function BankDecision({ bankDecision }) {
  if (!bankDecision?.decision) return null;
  return (
    <div className={`evaluation ${bankDecision.decision}`}>
      <h3>Final decision: {bankDecision.decision}</h3>
      <p className="muted">
        by {bankDecision.decidedBy} · {new Date(bankDecision.decidedAt).toLocaleString()}
      </p>
      {bankDecision.note && <p>{bankDecision.note}</p>}
    </div>
  );
}

function BankActions({ application, onUpdated }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    setBusy(true);
    try {
      onUpdated(await api.decide(application._id, decision, note || undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bank-actions">
      <h3>Banker review</h3>
      <textarea
        placeholder="Optional note to the applicant…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div>
        <button className="approve" disabled={busy} onClick={() => decide('approved')}>
          Approve
        </button>
        <button className="deny" disabled={busy} onClick={() => decide('denied')}>
          Deny
        </button>
      </div>
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

export default function ApplicationDetail({ application, user, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const isBank = user.role === 'bank';

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
    <div className="detail">
      <h2>
        {applicant.name || `Applicant ${applicant.code}`} — ${loan.amount.toLocaleString()} {loan.purpose} loan
      </h2>
      {applicant.bands ? (
        <p className="muted">
          Ranges only · debt vs. income {applicant.bands.dtiBand || 'n/a'} · credit {applicant.bands.ficoBand || 'n/a'} ·
          assets {applicant.bands.assetBand || 'n/a'} · {applicant.bands.employmentStatus} ·{' '}
          <span className={`badge ${application.status}`}>{application.status}</span>
        </p>
      ) : (
        <p className="muted">
          Income ${applicant.annualIncome.toLocaleString()}/yr · debt ${applicant.monthlyDebt.toLocaleString()}/mo ·
          credit {applicant.creditScore} · {applicant.employmentStatus} ·{' '}
          <span className={`badge ${application.status}`}>{application.status}</span>
        </p>
      )}
      {isBank && <p className="muted">You are seeing this applicant as a code and ranges. Name, contact and exact figures are withheld by the server until the applicant accepts your offer.</p>}

      <BankDecision bankDecision={application.bankDecision} />
      <Evaluation evaluation={application.evaluation} />

      {isBank && !application.bankDecision?.decision && (
        <BankActions application={application} onUpdated={onUpdated} />
      )}

      <h3>Agent-to-agent conversation</h3>
      <Conversation messages={application.conversation} />

      {!isBank && ['denied', 'countered', 'accepted'].includes(application.status) && (
        <button onClick={renegotiate} disabled={busy}>
          {busy ? 'Negotiating…' : 'Re-run negotiation'}
        </button>
      )}
    </div>
  );
}
