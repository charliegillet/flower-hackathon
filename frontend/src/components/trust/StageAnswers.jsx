import { useRef, useState } from 'react';
import { ALL_FIELDS, DOC_TYPES, classifyDoc } from '../../core/bands.js';
import { Lock, Arrow, Check, Doc, Shield } from './Icons.jsx';

const MARK = { never: Lock, range: Arrow, asis: Check };
const TITLE = { never: 'Never sent', range: 'Sent as a range', asis: 'Sent as entered' };

// The seven need-to-haves, in the order they're asked. Everything else is optional.
const CORE = ['amount', 'purpose', 'propertyPrice', 'annualIncome', 'monthlyDebt', 'creditScore', 'fullName', 'email', 'priority', 'horizonYears'];

function Field({ f, form, set, verified }) {
  const Mark = MARK[f.policy];
  const id = `q-${f.name}`;
  const v = verified[f.name];
  return (
    <div className={`q ${v ? 'verified' : ''}`}>
      <label htmlFor={id}>{f.label}</label>
      <div className="q-in">
        {f.money && <span className="pre">$</span>}
        {f.type === 'select' ? (
          <select id={id} value={form[f.name] ?? ''} onChange={set(f.name)}>
            <option value="">—</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input id={id} type={f.type} min={f.min} max={f.max} maxLength={f.maxLength} step={f.name === 'walkAwayRate' ? '0.125' : undefined} value={form[f.name] ?? ''} onChange={set(f.name)} placeholder={f.hint || ''} />
        )}
        {v ? <span className="mark verified" title={`Confirmed from ${v}`}><Shield width={13} height={13} /></span> : <span className={`mark ${f.policy}`} title={TITLE[f.policy]}><Mark width={13} height={13} /></span>}
      </div>
    </div>
  );
}

export default function StageAnswers({ form, setForm, onSeal, onFillSample }) {
  const [docs, setDocs] = useState([]); // { name, type, status }
  const [verified, setVerified] = useState({}); // field -> doc label
  const [more, setMore] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  const byName = Object.fromEntries(ALL_FIELDS.map((f) => [f.name, f]));
  const isHome = form.purpose === 'home';
  const core = CORE.filter((n) => n !== 'propertyPrice' || isHome).map((n) => byName[n]);
  const rest = ALL_FIELDS.filter((f) => !CORE.includes(f.name));
  const missing = core.filter((f) => f.required && (form[f.name] === '' || form[f.name] == null));
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  const ingest = (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    let next = { ...form };
    const nextVerified = { ...verified };
    const added = list.map((file) => {
      const type = classifyDoc(file.name);
      if (type) {
        for (const [k, val] of Object.entries(type.fills)) if (next[k] === '' || next[k] == null) next[k] = val;
        for (const k of type.verifies) nextVerified[k] = type.label;
      }
      return { name: file.name, type, status: 'reading' };
    });
    setDocs((d) => [...added, ...d]);
    // Simulated local read. Real version: parse in the browser, never upload.
    setTimeout(() => {
      setForm(next);
      setVerified(nextVerified);
      setDocs((d) => d.map((x) => (added.some((a) => a.name === x.name) ? { ...x, status: x.type ? 'read' : 'unknown' } : x)));
    }, 900);
  };

  const setDocType = (name, typeId) => {
    const type = DOC_TYPES.find((t) => t.id === typeId);
    setDocs((d) => d.map((x) => (x.name === name ? { ...x, type, status: 'read' } : x)));
    let next = { ...form };
    const nv = { ...verified };
    for (const [k, val] of Object.entries(type.fills)) if (next[k] === '' || next[k] == null) next[k] = val;
    for (const k of type.verifies) nv[k] = type.label;
    setForm(next);
    setVerified(nv);
  };

  return (
    <div className="stage split">
      <div className="split-l">
        <div className="split-h">
          <h2>Seven answers. That's it.</h2>
          <p className="sub">Most become a range. Your name and email never leave this device.</p>
        </div>

        <div className="qs">
          <div className="kicker">The loan</div>
          {core.filter((f) => ['amount', 'purpose', 'propertyPrice'].includes(f.name)).map((f) => <Field key={f.name} f={f} form={form} set={set} verified={verified} />)}
          <div className="kicker">Your finances</div>
          {core.filter((f) => ['annualIncome', 'monthlyDebt', 'creditScore'].includes(f.name)).map((f) => <Field key={f.name} f={f} form={form} set={set} verified={verified} />)}
          <div className="kicker">You</div>
          {core.filter((f) => ['fullName', 'email'].includes(f.name)).map((f) => <Field key={f.name} f={f} form={form} set={set} verified={verified} />)}
          <div className="kicker blue">What you want</div>
          {core.filter((f) => ['priority', 'horizonYears'].includes(f.name)).map((f) => <Field key={f.name} f={f} form={form} set={set} verified={verified} />)}
        </div>

        <button type="button" className={`more ${more ? 'open' : ''}`} onClick={() => setMore(!more)}>
          <span>{more ? 'Hide' : 'More details'}</span>
          <span className="sub">{more ? '' : 'Assets, employment, payment cap, walk-away rate. Or drop a document instead.'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d={more ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
        </button>
        {more && (
          <div className="qs more-qs">
            {rest.map((f) => <Field key={f.name} f={f} form={form} set={set} verified={verified} />)}
          </div>
        )}

      </div>

      <div className="split-r">
        <div
          className={`dropbox ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { ingest(e.target.files); e.target.value = ''; }} />
          <div className="drop-ic"><Doc width={26} height={26} /></div>
          <h3>Drop documents here</h3>
          <p>Pay stub, bank statement, credit report, ID, purchase agreement. They're read on this device and fill the answers for you. The files never upload.</p>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Choose files</button>
          <div className="doc-kinds">
            {DOC_TYPES.map((d) => <span key={d.id} className={`kind ${docs.some((x) => x.type?.id === d.id && x.status === 'read') ? 'have' : ''}`}>{docs.some((x) => x.type?.id === d.id && x.status === 'read') ? <Check width={11} height={11} /> : null}{d.label}</span>)}
          </div>
        </div>

        {docs.length > 0 && (
          <div className="docs">
            {docs.map((d) => (
              <div className={`doc ${d.status}`} key={d.name}>
                <Doc width={16} height={16} />
                <span className="doc-n">{d.name}</span>
                {d.status === 'reading' && <span className="tag work">Reading on device…</span>}
                {d.status === 'read' && <span className="tag done"><Shield width={11} height={11} />{d.type.note}</span>}
                {d.status === 'unknown' && (
                  <select className="doc-pick" defaultValue="" onChange={(e) => setDocType(d.name, e.target.value)}>
                    <option value="" disabled>What is this?</option>
                    {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                )}
              </div>
            ))}
            <p className="sub docs-note"><Lock width={11} height={11} /> Files and the numbers in them stay here. You'll see exactly what leaves in the next step.</p>
          </div>
        )}

      </div>

      <div className="split-foot">
          <span className="sub">{missing.length ? `${missing.length} to go` : 'Ready. Nothing has left this device.'}</span>
          <button type="button" className="btn ghost small" onClick={onFillSample}>Sample data</button>
          <span className="spacer" />
          <button type="button" className="btn primary" disabled={missing.length > 0} onClick={onSeal}>Seal and continue</button>
      </div>
    </div>
  );
}
