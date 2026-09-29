import { useCallback, useEffect, useState } from 'react';
import StageAnswers from './StageAnswers.jsx';
import StageSeal from './StageSeal.jsx';
import StageBanks from './StageBanks.jsx';
import StageHome from './StageHome.jsx';
import Approval from './Approval.jsx';
import ReleaseStrip from './ReleaseStrip.jsx';
import { ALL_FIELDS, bandsForDisplay } from '../../core/bands.js';
import { computeBands } from '../../core/bands.js';
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
  { key: 'home', n: 3, label: 'Home', homeOnly: true },
  { key: 'banks', n: 4, label: 'Lenders' },
];

export default function TrustFlow({ user, onAccepted, onError }) {
  const [form, setForm] = useState(() => (user?.demo ? SAMPLE_FORM : fromProfile(user)));
  const [stage, setStage] = useState('answers');
  const [bands, setBands] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  // Disclosure ledger recorded by the real Flower run (null = show the policy summary).
  const [ledger, setLedger] = useState(null);
  const onLedger = useCallback((parties) => setLedger(parties), []);
  useEffect(() => { if (stage !== 'banks') setLedger(null); }, [stage]);
  // Editing any answer after "Fill with sample data" invalidates the demo consent token.
  const editForm = useCallback((next) => setForm((prev) => {
    const value = typeof next === 'function' ? next(prev) : next;
    return value === SAMPLE_FORM || !value._consentToken ? value : (({ _consentToken, ...rest }) => rest)(value);
  }), []);
  const stages = STAGES.filter((s) => !s.homeOnly || form.purpose === 'home').map((s, i) => ({ ...s, n: i + 1 }));
  const reached = stages.findIndex((s) => s.key === stage);
  const [deal, setDeal] = useState(null);
  // Gates: nothing crosses until the user approves. `gate` is the card being shown.
  const [gate, setGate] = useState(null); // 'seal' | 'send' | 'ranges' | { accept }
  const [counts, setCounts] = useState({ shared: 0, locked: 0, blocked: 0 });
  const lockedCount = ALL_FIELDS.filter((f) => f.policy === 'never' && form[f.name] !== '' && form[f.name] != null).length;
  const rangeRows = bands ? bandsForDisplay(bands).map((r) => `${r.label}: ${r.value}`) : [];
  const KEEPS = ['Your name and email', 'Exact income, debt and assets', 'Exact credit score', 'SSN', 'Payment cap and walk-away rate', 'Your documents'];

  const principal = Number(form.amount) || 0;
  const horizonYears = Number(form.horizonYears) || 7;

  return (
    <div className="trust-flow">
      <div className="tabstrip" role="tablist" aria-label="Application stages">
        {stages.map((s, i) => {
          const state = i < reached ? 'done' : i === reached ? 'current' : 'todo';
          return (
            <button type="button" role="tab" aria-selected={state === 'current'} key={s.key} className={`stage-tab ${state}`} disabled={state === 'todo'} onClick={() => { if (state === 'done' && s.key === 'answers') { setStage('answers'); setBands(null); setDeal(null); } }}>
              <span className="num">{state === 'done' ? <Check width={12} height={12} /> : s.n}</span>
              <span className="lbl">{s.label}</span>
            </button>
          );
        })}
        <span className="spacer" />
        <ReleaseStrip shared={counts.shared} locked={counts.locked} blocked={counts.blocked} />
      </div>

      {stage === 'answers' && (
        <StageAnswers form={form} setForm={editForm} onSeal={() => setGate('seal')} onFillSample={() => setForm(SAMPLE_FORM)} />
      )}
      {stage === 'seal' && (
        <StageSeal form={form} onBack={() => setStage('answers')} onApprove={(b) => { setBands(b); setGate('send'); }} />
      )}
      {stage === 'home' && bands && (
        <StageHome
          form={form}
          bands={bands}
          onSkip={() => setStage('banks')}
          onDone={(d) => { setDeal(d); setGate('ranges'); }}
        />
      )}
      {stage === 'banks' && bands && (
        <StageBanks bands={bands} mandate={mandateOf(form)} principal={principal} horizonYears={horizonYears} consentToken={form._consentToken || null} onLedger={onLedger} onOpenLedger={() => setLedgerOpen(true)} onBlocked={() => setCounts((c) => ({ ...c, blocked: c.blocked + 1 }))} onAccept={(bank, offer) => setGate({ accept: { bank, offer } })} />
      )}

      {gate === 'seal' && (
        <Approval kicker="Gate 1 of 4" title="Seal your answers on this device" releases={[]} keeps={['Everything. Sealing runs here; nothing is sent yet.']} approveLabel="Seal" onBack={() => setGate(null)} onApprove={() => { setGate(null); setCounts((c) => ({ ...c, locked: lockedCount })); setStage('seal'); }}>
          <p className="sub">Your exact values get locked and turned into ranges. You'll see the envelope before anything goes out.</p>
        </Approval>
      )}
      {gate === 'send' && bands && (
        <Approval kicker="Gate 2 of 4" title="Send the sealed envelope" releases={[...rangeRows, 'A one-time code to the credit bureau']} keeps={KEEPS} approveLabel="Approve and send" onBack={() => setGate(null)} onApprove={() => { setGate(null); setCounts((c) => ({ ...c, shared: rangeRows.length })); setStage(form.purpose === 'home' ? 'home' : 'banks'); }}>
          <p className="sub">This is the first thing that crosses. The coordinator and every lender get exactly this, and nothing else.</p>
        </Approval>
      )}
      {gate === 'ranges' && deal && bands && (() => {
        const next = { ...form, propertyPrice: deal.price, amount: deal.loan };
        const nb = computeBands({ ...next, _token: bands.token });
        const rows = bandsForDisplay(nb).map((r) => `${r.label}: ${r.value}`);
        return (
          <Approval kicker="Gate 3 of 4" title="Send the new ranges to the lenders" releases={rows} keeps={['The address', 'The agreed price itself', ...KEEPS]} approveLabel="Send to lenders" onBack={() => setGate(null)} onApprove={() => { setGate(null); setForm(next); setBands(nb); setCounts((c) => ({ ...c, shared: rows.length })); setStage('banks'); }}>
            <p className="sub">The home agent's result becomes the lenders' input. Loan vs. value: {bands.ltvBand} → {nb.ltvBand}.</p>
          </Approval>
        );
      })()}
      {gate?.accept && (
        <Approval kicker="Gate 4 of 4" title={`Accept ${gate.accept.bank.name} at ${gate.accept.offer.rate.toFixed(3)}%`} releases={[`Your name and contact details, to ${gate.accept.bank.name} only`, 'Your full application, to start the paperwork']} keeps={['Anything to the other seven lenders', 'Your documents, until you send them to this lender']} approveLabel="Accept and release" onBack={() => setGate(null)} onApprove={() => { const g = gate.accept; setGate(null); onAccepted?.({ form, bands, bank: g.bank, offer: g.offer }); }}>
          <p className="sub">This is the only moment your identity leaves, and it goes to one lender.</p>
        </Approval>
      )}
      {ledgerOpen && (
        <div className="scrim" onClick={() => setLedgerOpen(false)}>
          <div className="ledger" onClick={(e) => e.stopPropagation()}>
            <div className="card-h row"><Lock width={18} height={18} /><div><h2>Disclosure ledger</h2><p className="sub">{ledger ? 'Recorded by the Flower run: who learned what, and what they never learned.' : 'Who learned what, and what they never learned. Kept on your device.'}</p></div><span className="spacer" /><button type="button" className="btn ghost small" onClick={() => setLedgerOpen(false)}>Close</button></div>
            {ledger ? ledger.map((p) => (
              <LedgerRow key={p.party} who={`${p.party}${p.role === 'coordinator' ? '' : ` (${p.role})`}`} learned={p.learned.join('; ') || 'Nothing.'} never={p.never.join(', ')} amber={p.learned.some((x) => x.includes('refused'))} />
            )) : <>
            <LedgerRow who="Each bank (6)" learned="The ranges in the sealed envelope, a bureau-signed credit range, and in round 2 one number: the best competing total cost." never="Your name, exact income, exact assets, exact score, SSN, employer, address, and any other bank's identity or offer." />
            <LedgerRow who="Credit bureau" learned="A one-time applicant code." never="Loan details, property price, which banks are bidding." />
            <LedgerRow who="Coordinator" learned="The ranges and the sealed quotes." never="Any exact value of yours. Any bank's rate sheet, margin or floor." />
            <LedgerRow who="Blocked requests" learned="U.S. Bank asked for exact income, assets and employer. Refused by the guard in code. Nothing sent." never="" amber />
            </>}
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
