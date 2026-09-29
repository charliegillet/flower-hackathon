import { useState } from 'react';
import StageAnswers from './StageAnswers.jsx';
import StageSeal from './StageSeal.jsx';
import StageBanks from './StageBanks.jsx';
import { EMPTY_FORM, SAMPLE_FORM, mandateOf } from '../../core/bands.js';
import { Check, Lock } from './Icons.jsx';

// Prefill from the user's saved profile where the field names line up.
function fromProfile(user) {
  const p = user?.profile || {};
  const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return {
    ...EMPTY_FORM,
    fullName: user?.name || '',
    email: user?.email || '',
    state: p.personal?.address?.state || '',
    annualIncome: p.income?.annualIncome ?? '',
    employmentStatus: p.income?.employmentStatus || 'employed',
    monthlyDebt: sum(p.debts) || '',
    totalAssets: sum(p.assets) || '',
    creditScore: p.credit?.score ?? '',
  };
}

const STAGES = [
  { key: 'answers', n: 1, label: 'Your answers' },
  { key: 'seal', n: 2, label: 'Sealing' },
  { key: 'banks', n: 3, label: 'Banks' },
];

export default function TrustFlow({ user, onAccepted, onError }) {
  const [form, setForm] = useState(() => (user?.demo ? SAMPLE_FORM : fromProfile(user)));
  const [stage, setStage] = useState('answers');
  const [bands, setBands] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const reached = STAGES.findIndex((s) => s.key === stage);

  const principal = Number(form.amount) || 0;
  const horizonYears = Number(form.horizonYears) || 7;

  return (
    <div className="trust-flow">
      <div className="tabstrip" role="tablist" aria-label="Application stages">
        {STAGES.map((s, i) => {
          const state = i < reached ? 'done' : i === reached ? 'current' : 'todo';
          return (
            <button type="button" role="tab" aria-selected={state === 'current'} key={s.key} className={`stage-tab ${state}`} disabled={state === 'todo'} onClick={() => { if (state === 'done' && s.key === 'answers') { setStage('answers'); setBands(null); } }}>
              <span className="num">{state === 'done' ? <Check width={12} height={12} /> : s.n}</span>
              <span className="lbl">{s.label}</span>
            </button>
          );
        })}
        <span className="spacer" />
        <span className="strip-note"><Lock width={12} height={12} /> Raw data has never left this device</span>
      </div>

      {stage === 'answers' && (
        <StageAnswers form={form} setForm={setForm} onSeal={() => setStage('seal')} onFillSample={() => setForm(SAMPLE_FORM)} />
      )}
      {stage === 'seal' && (
        <StageSeal form={form} onBack={() => setStage('answers')} onApprove={(b) => { setBands(b); setStage('banks'); }} />
      )}
      {stage === 'banks' && bands && (
        <StageBanks bands={bands} mandate={mandateOf(form)} principal={principal} horizonYears={horizonYears} onOpenLedger={() => setLedgerOpen(true)} onAccept={(bank, offer) => onAccepted?.({ form, bands, bank, offer })} />
      )}

      {ledgerOpen && (
        <div className="scrim" onClick={() => setLedgerOpen(false)}>
          <div className="ledger" onClick={(e) => e.stopPropagation()}>
            <div className="card-h row"><Lock width={18} height={18} /><div><h2>Disclosure ledger</h2><p className="sub">Who learned what, and what they never learned. Kept on your device.</p></div><span className="spacer" /><button type="button" className="btn ghost small" onClick={() => setLedgerOpen(false)}>Close</button></div>
            <LedgerRow who="Each bank (6)" learned="The ranges in the sealed envelope, a bureau-signed credit range, and in round 2 one number: the best competing total cost." never="Your name, exact income, exact assets, exact score, SSN, employer, address, and any other bank's identity or offer." />
            <LedgerRow who="Credit bureau" learned="A one-time applicant code." never="Loan details, property price, which banks are bidding." />
            <LedgerRow who="Coordinator" learned="The ranges and the sealed quotes." never="Any exact value of yours. Any bank's rate sheet, margin or floor." />
            <LedgerRow who="Blocked requests" learned="U.S. Bank asked for exact income, assets and employer. Refused by the guard in code. Nothing sent." never="" amber />
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerRow({ who, learned, never, amber }) {
  return (
    <div className={`lg ${amber ? 'amber' : ''}`}>
      <div className="lh">{who}</div>
      <div className="two">
        <div><span className="lbl b">Learned</span>{learned}</div>
        {never && <div><span className="lbl s"><Lock width={11} height={11} />Never learned</span>{never}</div>}
      </div>
    </div>
  );
}
