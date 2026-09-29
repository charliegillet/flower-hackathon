import { useEffect, useMemo, useRef, useState } from 'react';
import { BANKS, logoUrl } from '../../core/banks.js';
import { startNegotiation, describeBands } from '../../core/negotiation.js';
import { flowerAvailable, startFlowerNegotiation } from '../../core/flowerNegotiation.js';
import { bandsForDisplay } from '../../core/bands.js';
import { Lock, Arrow, Check, Block, Shield, Spinner } from './Icons.jsx';

const STATUS = {
  waiting: ['idle', 'Waiting'], sent: ['work', 'Pricing'], thinking: ['work', 'Thinking'], request: ['warn', 'Asking for more'],
  blocked: ['warn', 'Blocked'], quote: ['done', 'Quoted'], improve: ['done', 'Improved'], hold: ['idle', 'Held'],
  flag: ['warn', 'APR flagged'], declined: ['idle', 'Declined'],
};

export default function StageBanks({ bands, mandate = {}, principal, horizonYears, consentToken, onAccept, onOpenLedger, onLedger }) {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(BANKS[0].id);
  const [done, setDone] = useState(null);
  // 'flower' = real Flower run (SuperLink + bank SuperNodes); 'simulated' = in-browser fallback.
  const [engine, setEngine] = useState(null);
  const [fallbackNote, setFallbackNote] = useState(null);
  const [live, setLive] = useState({ nodes: 0, attest: null, market: null, narrative: '', error: null });
  const logRef = useRef(null);

  useEffect(() => {
    let run = { cancel: () => {} };
    let cancelled = false;
    const startSimulated = () => {
      setEngine('simulated');
      run = startNegotiation(bands, BANKS, onEvent, { principal, horizonYears, mandate });
    };
    const onEvent = (e) => {
      if (e.type === 'fallback') {
        if (cancelled) return;
        setFallbackNote(e.reason === 'busy' ? 'Simulated: Flower busy' : 'Simulated: Flower prices home loans only');
        setEvents([]);
        startSimulated();
        return;
      }
      if (e.type === 'node') setLive((l) => ({ ...l, nodes: l.nodes + (e.role === 'coordinator' ? 0 : 1) }));
      else if (e.type === 'attest') setLive((l) => ({ ...l, attest: e }));
      else if (e.type === 'market') setLive((l) => ({ ...l, market: e }));
      else if (e.type === 'ledger') onLedger?.(e.parties);
      else if (e.type === 'error') setLive((l) => ({ ...l, error: e.text }));
      else if (e.type === 'done') { setDone(e); setLive((l) => ({ ...l, narrative: e.narrative || '' })); }
      setEvents((prev) => [...prev, e]);
    };
    flowerAvailable().then((st) => {
      if (cancelled) return;
      if (st.available) {
        setEngine('flower');
        const live = startFlowerNegotiation(bands, onEvent, { horizonYears, consentToken });
        // Private lenders have no Flower node yet: they run in the browser alongside the live banks.
        const priv = startNegotiation(bands, BANKS.filter((b) => b.kind === 'private'), onEvent, { principal, horizonYears, mandate });
        run = { cancel: () => { live.cancel(); priv.cancel(); } };
      } else {
        startSimulated();
      }
    });
    return () => { cancelled = true; run.cancel(); };
  }, [bands, principal, horizonYears, consentToken, onLedger, mandate]);

  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [events, selected]);

  const byBank = useMemo(() => {
    const m = Object.fromEntries(BANKS.map((b) => [b.id, { status: 'waiting', offer: null, blocked: 0, events: [], last: null }]));
    for (const e of events) {
      if (!e.bankId) continue;
      const s = m[e.bankId];
      s.events.push(e);
      s.last = e.t;
      if (e.type !== 'thinking' || s.status === 'sent' || s.status === 'waiting') s.status = e.type === 'thinking' ? 'thinking' : e.type;
      if (e.type === 'thinking' && (s.status === 'quote' || s.status === 'improve' || s.status === 'hold')) s.status = 'thinking';
      if (e.offer) s.offer = e.offer;
      if (e.type === 'blocked') s.blocked++;
    }
    return m;
  }, [events]);

  const scoreKey = mandate.priority === 'Lowest monthly payment' ? 'monthly' : mandate.priority === 'Least cash at closing' ? 'cash' : mandate.priority === 'Fastest close' ? 'closeDays' : 'total';
  const score = (o) => (scoreKey === 'cash' ? (o.points / 100) * principal + o.fees : o[scoreKey]);
  const ranking = useMemo(() => {
    const quoted = BANKS.filter((b) => byBank[b.id].offer).sort((a, b) => score(byBank[a.id].offer) - score(byBank[b.id].offer));
    const verdict = engine === 'flower' ? events.find((e) => e.type === 'verdict') : null;
    if (!verdict?.ranking?.length) return quoted;
    const pos = (b) => { const i = verdict.ranking.indexOf(b.id); return i < 0 ? Infinity : i; };
    return [...quoted].sort((a, b) => pos(a) - pos(b));
  }, [byBank, events, engine, scoreKey]);
  const checks = (o) => [
    mandate.maxPayment ? { label: `Payment under $${mandate.maxPayment.toLocaleString()}`, ok: o.monthly <= mandate.maxPayment, val: `$${o.monthly.toLocaleString()}` } : null,
    mandate.walkAwayRate ? { label: `Rate under ${mandate.walkAwayRate}%`, ok: o.rate < mandate.walkAwayRate, val: `${o.rate.toFixed(3)}%` } : null,
    mandate.noPrepayPenalty === 'Required' ? { label: 'No prepayment penalty', ok: !o.prepayPenalty, val: o.prepayPenalty ? 'has one' : 'none' } : null,
    mandate.cashToClose ? { label: `Closing cash under $${mandate.cashToClose.toLocaleString()}`, ok: (o.points / 100) * principal + o.fees <= mandate.cashToClose, val: `$${Math.round((o.points / 100) * principal + o.fees).toLocaleString()}` } : null,
  ].filter(Boolean);
  const meetsAll = (o) => checks(o).every((c) => c.ok);
  const leader = ranking[0];
  const round2 = events.find((e) => e.type === 'round2');
  const bank = BANKS.find((b) => b.id === selected);
  const bs = byBank[selected];
  const blockedTotal = events.filter((e) => e.type === 'blocked').length;
  const rows = bandsForDisplay(bands);

  return (
    <div className="stage stage-banks">
      <aside className="bank-tabs">
        <div className="stage-head">
          <h2>Lenders</h2>
          <p className="sub">Six banks and two private lenders got the same sealed envelope. Click one to watch its agent.</p>
          <EngineBadge engine={engine} live={live} note={fallbackNote} />
        </div>
        {BANKS.map((b, idx) => {
          const s = byBank[b.id];
          const firstPrivate = b.kind === 'private' && BANKS.findIndex((x) => x.kind === 'private') === idx;
          const [cls, label] = STATUS[s.status] || STATUS.waiting;
          const isLeader = leader?.id === b.id && done;
          return (
            <div key={b.id} style={{ display: 'contents' }}>
            {firstPrivate && <div className="kicker" style={{ padding: '12px 22px 2px' }}>Private lenders</div>}
            {idx === 0 && <div className="kicker" style={{ padding: '6px 22px 2px' }}>Banks</div>}
            <button type="button" className={`bank-tab ${selected === b.id ? 'selected' : ''} ${s.blocked ? 'flag' : ''}`} onClick={() => setSelected(b.id)}>
              <Logo bank={b} />
              <span className="txt">
                <span className="name">{b.name}{isLeader && <span className="tag done" style={{ marginLeft: 6 }}>Best</span>}</span>
                <span className="st">{s.offer ? `${s.offer.rate.toFixed(3)}% · $${s.offer.total.toLocaleString()} over ${horizonYears} yrs` : s.status === 'waiting' ? 'Waiting for the envelope' : 'Reading the ranges…'}</span>
              </span>
              <span className={`tag ${cls}`}>{s.status === 'thinking' || s.status === 'sent' ? <Spinner width={11} height={11} /> : null}{label}</span>
            </button>
            </div>
          );
        })}
        <div className="footnote"><Lock width={12} height={12} /> No bank can see another bank's tab. You can see all of them.</div>
      </aside>

      <section className="bank-main">
        <div className="card bank-detail">
          <div className="card-h row">
            <Logo bank={bank} size={40} />
            <div>
              <h2>{bank.name}</h2>
              <p className="sub">{bank.persona}. {bs.last != null ? `Last message ${bs.last}s in.` : ''}</p>
            </div>
            <span className="spacer" />
            <span className={`tag ${(STATUS[bs.status] || STATUS.waiting)[0]}`}>{(STATUS[bs.status] || STATUS.waiting)[1]}</span>
          </div>

          <div className="knows">
            <div className="knows-h"><Shield width={14} height={14} /><b>What {bank.short} knows about you</b><span className="sub">and nothing else</span></div>
            <div className="chips">
              {rows.map((r) => <span className="chip blue" key={r.key}>{r.label}: {r.value}</span>)}
              {round2 && (engine === 'flower'
                ? <span className="chip blue">Round 2: its rank and % gap to the best offer</span>
                : <span className="chip blue">Best competing cost: ${round2.bestTotal.toLocaleString()}</span>)}
            </div>
            <div className="chips">
              {['Your name', 'Exact income', 'Exact assets', 'Exact credit score', 'SSN', 'Employer', 'Address', 'Other banks\' offers'].map((x) => <span className="chip slate" key={x}><Lock width={10} height={10} />{x}</span>)}
            </div>
          </div>

          <div className="transcript" ref={logRef}>
            {bs.events.length === 0 && <div className="sub">Waiting for the coordinator to deliver the envelope…</div>}
            {bs.events.map((e, i) => <Msg key={i} e={e} bank={bank} />)}
            {round2 && bs.events.some((e) => e.type === 'quote') && !bs.events.some((e) => e.t >= round2.t && e.type !== 'quote') && (
              <div className="msg coord"><span className="who">Coordinator → {bank.short}</span>{round2.text}</div>
            )}
          </div>

          {bs.offer && (
            <div className="offer">
              <div className="kpi"><span className="k">Rate</span><span className="v">{bs.offer.rate.toFixed(3)}%</span></div>
              <div className="kpi"><span className="k">Points</span><span className="v">{bs.offer.points}</span></div>
              <div className="kpi"><span className="k">Fees</span><span className="v">${bs.offer.fees.toLocaleString()}</span></div>
              <div className="kpi"><span className="k">Monthly</span><span className="v">${bs.offer.monthly.toLocaleString()}</span></div>
              <div className="kpi strong"><span className="k">{horizonYears}-year total cost</span><span className="v">${bs.offer.total.toLocaleString()}</span></div>
              <div className="kpi"><span className="k">Prepay penalty</span><span className="v small">{bs.offer.prepayPenalty ? 'Yes' : 'None'}</span></div>
              <div className="kpi"><span className="k">Close in</span><span className="v small">{bs.offer.closeDays} days</span></div>
            </div>
          )}
        </div>

        <div className="rankbar">
          <div className="rank-h">
            <b>{done ? 'Final ranking' : 'Live ranking'}</b>
            <span className="sub">by {mandate.priority ? mandate.priority.toLowerCase() : 'total cost'}{scoreKey === 'total' ? ` over the ${horizonYears} years you'll keep the loan` : ''}</span>
            <span className="spacer" />
            <span className="tag shared"><Arrow width={11} height={11} />{rows.length} ranges shared</span>
            <span className="tag warn"><Block width={11} height={11} />{blockedTotal} request{blockedTotal === 1 ? '' : 's'} blocked</span>
          </div>
          <div className="rank-rows">
            {ranking.length === 0 && <div className="sub">Quotes appear here as they arrive.</div>}
            {ranking.map((b, i) => {
              const o = byBank[b.id].offer;
              const flag = byBank[b.id].blocked > 0;
              return (
                <button type="button" key={b.id} className={`rank-row ${i === 0 ? 'lead' : ''} ${flag ? 'flag' : ''}`} onClick={() => setSelected(b.id)}>
                  <span className="n">{i + 1}</span>
                  <Logo bank={b} size={22} />
                  <span className="name">{b.name}</span>
                  <span className="m">{o.rate.toFixed(3)}%</span>
                  <span className="m">{o.points} pts</span>
                  <span className="m strong">${o.total.toLocaleString()}</span>
                  <span className="note">{flag ? 'Low rate, high fees. Asked for data it may not see.' : meetsAll(o) ? (i === 0 ? 'Best, and meets everything you asked for' : `Meets everything · +$${(o.total - byBank[ranking[0].id].offer.total).toLocaleString()} vs. best`) : `Misses: ${checks(o).filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(', ')}`}</span>
                  {i === 0 && done && <span className="accept" onClick={(ev) => { ev.stopPropagation(); onAccept(b, o); }} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && onAccept(b, o)}>Accept offer</span>}
                </button>
              );
            })}
          </div>
          {done && leader && (
            <div className="report">
              <div className="report-h"><b>Did you get what you asked for?</b><span className="sub">Checked against the private half of your mandate. Banks never saw these numbers.</span></div>
              <div className="report-rows">
                {checks(byBank[leader.id].offer).map((c) => (
                  <div className={`report-row ${c.ok ? 'ok' : 'miss'}`} key={c.label}>{c.ok ? <Check width={12} height={12} /> : <Block width={12} height={12} />}<span>{c.label}</span><span className="m">{c.val}</span></div>
                ))}
                {checks(byBank[leader.id].offer).length === 0 && <div className="sub">You set no hard lines, so the ranking is by {mandate.priority?.toLowerCase() || 'total cost'} alone.</div>}
              </div>
              {(() => { const alt = ranking.find((b) => b.id !== leader.id && meetsAll(byBank[b.id].offer)); return !meetsAll(byBank[leader.id].offer) && alt ? <p className="sub report-alt">{alt.name} costs ${(byBank[alt.id].offer.total - byBank[leader.id].offer.total).toLocaleString()} more but meets every condition. Your call.</p> : null; })()}
            </div>
          )}
          {live.narrative && <div className="narrative"><b>Coordinator's explanation</b><p>{live.narrative}</p></div>}
          <div className="rank-f">
            <span className="sub">{live.error ? `Run failed: ${live.error}` : done ? 'Run complete.' : engine === 'flower'
              ? 'Negotiation in progress on Flower. In round 2 banks hear only their rank and % gap; your horizon stays private.'
              : 'Negotiation in progress. In round 2 banks hear the best competing cost and one ask from your agent.'}</span>
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={onOpenLedger}>Open disclosure ledger</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Logo({ bank, size = 32 }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="logo mono" style={{ width: size, height: size, background: bank.color }}>{bank.short[0]}</span>;
  return <img className="logo" src={logoUrl(bank)} alt="" width={size} height={size} onError={() => setBroken(true)} />;
}

function Msg({ e, bank }) {
  if (e.type === 'sent') return <div className="msg coord"><span className="who">Coordinator → {bank.short}</span>{e.text}</div>;
  if (e.type === 'thinking') return <div className="msg think"><span className="who">{bank.short} agent, reasoning</span>{e.text}</div>;
  if (e.type === 'request') return <div className="msg request"><span className="who">{bank.short} → Coordinator</span>{e.text}<div className="chips">{e.fields.map((f) => <span className="chip amber" key={f}>{f}</span>)}</div></div>;
  if (e.type === 'blocked') return <div className="msg blocked"><span className="who"><Block width={11} height={11} /> Guard → {bank.short}</span>{e.text}</div>;
  if (e.type === 'quote') return <div className="msg out"><span className="who">{bank.short} → Coordinator <span className="tag sealed"><Lock width={10} height={10} />Sealed</span></span>{e.text}</div>;
  if (e.type === 'improve') return <div className="msg out"><span className="who">{bank.short} → Coordinator <span className="tag done"><Check width={10} height={10} />Improved</span></span>{e.text}</div>;
  if (e.type === 'hold') return <div className="msg out"><span className="who">{bank.short} → Coordinator</span>{e.text}</div>;
  if (e.type === 'declined') return <div className="msg out"><span className="who">{bank.short} → Coordinator</span>Declined to quote: {e.text}</div>;
  if (e.type === 'flag') return <div className="msg blocked"><span className="who"><Block width={11} height={11} /> Guard → {bank.short}</span>{e.text}</div>;
  return null;
}

function EngineBadge({ engine, live, note }) {
  if (!engine) return <div className="engine sub"><Spinner width={11} height={11} /> Connecting…</div>;
  if (engine === 'simulated') return <div className="engine sub">{note || 'Simulated in your browser (Flower bridge offline)'}</div>;
  const credit = live.attest
    ? live.attest.selfReported
      ? `credit ${live.attest.ficoBand} self-reported (no bureau file)`
      : live.attest.verified ? `credit ${live.attest.ficoBand} bureau-signed, verified by ${live.attest.verifiedBy} banks` : `credit ${live.attest.ficoBand} bureau-signed`
    : null;
  return (
    <div className="engine">
      <span className="tag done"><Shield width={11} height={11} />Live on Flower</span>
      <span className="sub">{live.nodes ? `${live.nodes} SuperNodes` : 'starting run…'}{credit ? ` · ${credit}` : ''}{live.market ? ` · market ${live.market.pmms}%` : ''}</span>
    </div>
  );
}
