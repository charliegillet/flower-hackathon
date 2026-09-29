import { useMemo } from 'react';
import { SECTIONS, computeBands, bandsForDisplay, totals } from '../../core/bands.js';
import { Lock, Arrow, Check } from './Icons.jsx';

const MARK = { never: Lock, range: Arrow, asis: Check };
const TITLE = { never: 'Never sent', range: 'Sent as a range', asis: 'Sent as entered' };

function Field({ f, form, set }) {
  const Mark = MARK[f.policy];
  const id = `q-${f.name}`;
  return (
    <div className="dq">
      <label htmlFor={id}>{f.label}{f.required && <span className="req"> *</span>}</label>
      <div className="dq-in">
        {f.money && <span className="pre">$</span>}
        {f.type === 'select' ? (
          <select id={id} value={form[f.name] ?? ''} onChange={set(f.name)}>
            <option value="">—</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input id={id} type={f.type} min={f.min} max={f.max} maxLength={f.maxLength} step={f.name === 'walkAwayRate' ? '0.125' : undefined} value={form[f.name] ?? ''} onChange={set(f.name)} placeholder={f.hint || ''} />
        )}
        <span className={`mark ${f.policy}`} title={TITLE[f.policy]}><Mark width={13} height={13} /></span>
      </div>
    </div>
  );
}

export default function StageAnswers({ form, setForm, onSeal, onFillSample }) {
  const bands = useMemo(() => computeBands(form), [form]);
  const rows = bandsForDisplay(bands);
  const t = totals(form);
  const missing = SECTIONS.flatMap((s) => s.fields).filter((f) => f.required && (form[f.name] === '' || form[f.name] == null));
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });
  const monthlyIncome = t.income / 12;
  const dti = monthlyIncome ? Math.round((t.monthlyDebt / monthlyIncome) * 100) : null;

  return (
    <div className="stage dash">
      <div className="dash-top">
        <div>
          <h2>Tell us what you need</h2>
          <p className="sub">Fourteen answers. Most become a range. The rest never leave this device.</p>
        </div>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={onFillSample}>Fill with sample data</button>
      </div>

      <div className="dash-grid">
        {SECTIONS.map((s) => (
          <section className={`tile ${s.mandate ? 'mandate' : ''}`} key={s.key}>
            <div className="tile-h">
              <span className="kicker">{s.title}</span>
              {s.mandate && <span className="sub">Your agent negotiates toward this</span>}
            </div>
            <div className="tile-f">
              {s.fields.map((f) => <Field key={f.name} f={f} form={form} set={set} />)}
            </div>
          </section>
        ))}

        <aside className="tile see">
          <div className="tile-h"><span className="kicker">What banks see</span><span className="sub">Ranges only. Updates as you type.</span></div>
          {rows.length === 0 ? <p className="sub">Start answering and the ranges appear here.</p> : (
            <div className="band-list">
              {rows.map((r) => <div className="band-row" key={r.key}><span className="k">{r.label}</span><span className="v">{r.value}</span></div>)}
            </div>
          )}
          <div className="see-foot">
            <Lock width={13} height={13} />
            <span>Kept here: your name, email, SSN, exact income, debt, assets, score, payment cap and walk-away rate.</span>
          </div>
        </aside>

        <aside className="tile glance">
          <div className="tile-h"><span className="kicker">At a glance</span></div>
          <div className="glance-grid">
            <div><span className="k">Debt vs. income</span><b>{dti != null ? `${dti}%` : '—'}</b></div>
            <div><span className="k">Loan vs. value</span><b>{bands.ltvBand || '—'}</b></div>
            <div><span className="k">Credit range</span><b>{bands.ficoBand || '—'}</b></div>
            <div><span className="k">Banks bidding</span><b>6</b></div>
          </div>
          <div className="legend"><span><Lock width={12} height={12} />never sent</span><span><Arrow width={12} height={12} />as a range</span><span><Check width={12} height={12} />as entered</span></div>
        </aside>
      </div>

      <div className="dash-foot">
        <span className="sub">{missing.length ? `${missing.length} required answer${missing.length > 1 ? 's' : ''} left` : 'Ready. Nothing has left this device.'}</span>
        <span className="spacer" />
        <button type="button" className="btn primary" disabled={missing.length > 0} onClick={onSeal}>Seal and continue</button>
      </div>
    </div>
  );
}
