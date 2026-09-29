import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTIONS, FIELD_BY_NAME, computeBands, bandsForDisplay, sealEvents, formatValue, BAND_LABELS, totals } from '../../core/bands.js';
import { Lock, Arrow, Check, Shield, Device, Spinner } from './Icons.jsx';

const STEP_MS = 160;

export default function StageSeal({ form, onApprove, onBack, autoplay = true }) {
  const events = useMemo(() => sealEvents(form), [form]);
  const [idx, setIdx] = useState(0); // how many events have played
  const [showRaw, setShowRaw] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (!autoplay) return;
    if (idx >= events.length) return;
    const ev = events[idx];
    const delay = ev.type === 'scan' ? 900 : ev.type === 'sign' ? 900 : ev.type === 'sealed' ? 700 : STEP_MS;
    const t = setTimeout(() => setIdx(idx + 1), delay);
    return () => clearTimeout(t);
  }, [idx, events, autoplay]);

  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [idx]);

  const played = events.slice(0, idx);
  const state = {};
  for (const e of played) if (e.field) state[e.field] = e.type;
  const scanning = idx > 0 && idx < events.length;
  const activeField = events[idx - 1]?.field;
  const signed = played.some((e) => e.type === 'sign');
  const sealed = played.find((e) => e.type === 'sealed');
  const bands = sealed?.payload || computeBands(form);
  const rows = bandsForDisplay(bands);
  const t = totals(form);
  const counts = {
    ranges: rows.length,
    locked: played.filter((e) => e.type === 'lock').length,
    passed: played.filter((e) => e.type === 'pass').length,
  };

  const verdict = verdictFor(bands);

  return (
    <div className="stage stage-seal">
      <div className="answers-col readonly">
        <div className="stage-head">
          <h2>Your answers</h2>
          <p className="sub">Read-only while your agent seals them. Go back to edit.</p>
        </div>
        {SECTIONS.map((s) => (
          <section className="qsection" key={s.key}>
            <h3>{s.title}</h3>
            {s.fields.map((f) => {
              const v = form[f.name];
              if (v === '' || v == null) return null;
              const st = state[f.name];
              const active = activeField === f.name;
              return (
                <div className={`srow ${st || 'pending'} ${active ? 'active' : ''} ${scanning && !st ? 'dim' : ''}`} key={f.name}>
                  <span className="k">{f.label}</span>
                  <span className={`v ${st === 'lock' || st === 'band' ? 'blur' : ''}`}>{formatValue(f, v)}</span>
                  <span className="mark">
                    {st === 'lock' && <span className="tag local"><Lock width={11} height={11} />Locked</span>}
                    {st === 'band' && <span className="tag shared"><Arrow width={11} height={11} />{bands[f.band + 'Band'] || BAND_LABELS[f.band + 'Band']}</span>}
                    {st === 'pass' && <span className="tag asis"><Check width={11} height={11} />As entered</span>}
                    {!st && scanning && <span className="tag idle">…</span>}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="seal-col">
        <div className="card work">
          <div className="card-h row">
            <span className="ic blue"><Device width={18} height={18} /></span>
            <div>
              <h2>Your agent is sealing your data</h2>
              <p className="sub">Runs on your device. Each line below is a real step, in order.</p>
            </div>
            {!sealed && <span className="tag work"><Spinner width={12} height={12} />Working</span>}
            {sealed && <span className="tag done"><Check width={12} height={12} />Sealed</span>}
          </div>
          <div className="worklog" ref={logRef}>
            {played.map((e, i) => <WorkLine key={i} e={e} bands={bands} />)}
            {idx === 0 && <div className="wl muted">Starting…</div>}
          </div>
          {sealed && (
            <div className="envelope">
              <div className="env-h"><Shield width={16} height={16} /><b>Sealed envelope</b><span className="sub">applicant code {bands.token}</span><span className="spacer" /><button type="button" className="btn ghost small" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Show plain words' : 'Show raw message'}</button></div>
              {!showRaw ? (
                <div className="band-list compact">
                  {rows.map((r) => <div className="band-row" key={r.key}><span className="k">{r.label}</span><span className="v">{r.value}</span></div>)}
                </div>
              ) : (
                <pre className="code">{JSON.stringify(bands, null, 2)}</pre>
              )}
            </div>
          )}
        </div>

        <div className={`card summary ${sealed ? '' : 'pending'}`}>
          <div className="card-h">
            <h2>What every bank will know about you</h2>
            {!sealed && <p className="sub">Fills in when sealing finishes.</p>}
          </div>
          {sealed && (
            <>
              <p className="line"><b>Financial position:</b> {verdict.position}</p>
              <p className="line"><b>Your agent's read:</b> {verdict.read}</p>
              <div className="counts">
                <span className="tag shared"><Arrow width={11} height={11} />{counts.ranges} ranges shared</span>
                <span className="tag local"><Lock width={11} height={11} />{counts.locked} exact values locked</span>
                <span className="tag asis"><Check width={11} height={11} />{counts.passed} choices as entered</span>
                <span className="tag warn">0 requests blocked</span>
              </div>
              <p className="sub">Kept with you: ${t.income.toLocaleString()} income, ${t.monthlyDebt.toLocaleString()}/mo debt, ${t.assets.toLocaleString()} assets, your name, address, date of birth and SSN.</p>
            </>
          )}
          <div className="stage-foot">
            <button type="button" className="btn ghost" onClick={onBack}>Back and edit</button>
            <span className="spacer" />
            <span className="sub">Nothing is sent to any bank until you click Approve.</span>
            <button type="button" className="btn primary" disabled={!sealed} onClick={() => onApprove(bands)}>Approve and send to banks</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkLine({ e, bands }) {
  const f = e.field ? FIELD_BY_NAME[e.field] : null;
  if (e.type === 'scan') return <div className="wl"><span className="dot blue" />Reading your answers, top to bottom.</div>;
  if (e.type === 'lock') return <div className="wl"><Lock width={12} height={12} className="c-slate" />Locked <b>{f.label.toLowerCase()}</b>. Never sent.</div>;
  if (e.type === 'band') return <div className="wl"><Arrow width={12} height={12} className="c-blue" />Blurred <b>{f.label.toLowerCase()}</b>; folded into <b>{BAND_LABELS[e.band + 'Band'].toLowerCase()}{bands[e.band + 'Band'] ? ` = ${bands[e.band + 'Band']}` : ''}</b>.</div>;
  if (e.type === 'pass') return <div className="wl"><Check width={12} height={12} className="c-green" />Kept <b>{f.label.toLowerCase()}</b> as entered. Not identifying.</div>;
  if (e.type === 'sign') return <div className="wl"><Shield width={12} height={12} className="c-green" />Credit bureau confirmed the range <b>{bands.ficoBand}</b> and signed it. The exact score stayed at the bureau.</div>;
  if (e.type === 'sealed') return <div className="wl"><Check width={12} height={12} className="c-green" />Sealed. One envelope, {Object.values(e.payload).filter((v) => v != null && v !== false).length - 1} facts, all ranges or categories.</div>;
  return null;
}

function verdictFor(b) {
  const lo = (s) => (s ? Number(String(s).replace(/[^0-9]/g, ' ').trim().split(' ')[0]) : null);
  const fico = lo(b.ficoBand), dti = lo(b.dtiBand), ltv = lo(b.ltvBand);
  let strength = 'Strong';
  if ((fico ?? 0) < 700 || (dti ?? 0) >= 43 || (ltv ?? 0) >= 90 || b.derogatory) strength = 'Mixed';
  if ((fico ?? 0) < 640 || (dti ?? 0) >= 50) strength = 'Weak';
  const parts = [b.dtiBand && `debt-to-income ${b.dtiBand}`, b.ltvBand && `loan-to-value ${b.ltvBand}`, b.assetBand && `assets ${b.assetBand}`, b.ficoBand && `credit ${b.ficoBand}`].filter(Boolean).join(', ');
  const read = strength === 'Strong' ? 'Likely approvable at every bank. Expect offers close to the market rate before negotiation, and at least one bank to improve in round 2.'
    : strength === 'Mixed' ? 'Approvable at most banks, likely with a rate premium. Expect a spread of offers; negotiation matters more here.'
      : 'Some banks may decline. Expect counter-offers on amount or a higher rate.';
  return { position: `${strength}. ${parts}.`, read };
}
