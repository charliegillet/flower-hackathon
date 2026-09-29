import { useMemo } from 'react';
import { SECTIONS, computeBands, bandsForDisplay, totals } from '../../core/bands.js';
import { Lock, Arrow, Check } from './Icons.jsx';

const POLICY = {
  never: { cls: 'never', label: 'Never sent', Icon: Lock },
  range: { cls: 'range', label: 'Sent as range', Icon: Arrow },
  asis: { cls: 'asis', label: 'Sent as-is', Icon: Check },
};

export default function StageAnswers({ form, setForm, onSeal, onFillSample }) {
  const bands = useMemo(() => computeBands(form), [form]);
  const rows = bandsForDisplay(bands);
  const t = totals(form);
  const missing = SECTIONS.flatMap((s) => s.fields).filter((f) => f.required && (form[f.name] === '' || form[f.name] == null));
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  return (
    <div className="stage stage-answers">
      <div className="answers-col">
        <div className="stage-head">
          <h2>Your answers</h2>
          <p className="sub">Every question, with what happens to the answer. The label is set by code and cannot be changed by anyone.</p>
          <button type="button" className="btn ghost small" onClick={onFillSample}>Fill with sample data</button>
        </div>

        {SECTIONS.map((s) => (
          <section className="qsection" key={s.key}>
            <h3>{s.title}</h3>
            {s.fields.map((f) => {
              const p = POLICY[f.policy];
              return (
                <div className={`qrow ${p.cls}`} key={f.name}>
                  <label htmlFor={`q-${f.name}`}>
                    <span className="qlabel">{f.label}{f.required && <span className="req"> *</span>}</span>
                    {f.hint && <span className="qhint">{f.hint}</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select id={`q-${f.name}`} value={form[f.name] ?? ''} onChange={set(f.name)}>
                      <option value="">—</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input id={`q-${f.name}`} type={f.type} min={f.min} max={f.max} maxLength={f.maxLength} value={form[f.name] ?? ''} onChange={set(f.name)} />
                  )}
                  <span className={`policy ${p.cls}`} title={p.label}><p.Icon width={12} height={12} />{p.label}</span>
                </div>
              );
            })}
          </section>
        ))}

        <div className="stage-foot">
          <span className="sub">{missing.length ? `${missing.length} required answer${missing.length > 1 ? 's' : ''} left` : 'All required answers are in.'}</span>
          <button type="button" className="btn primary" disabled={missing.length > 0} onClick={onSeal}>Seal and continue</button>
        </div>
      </div>

      <aside className="preview-col">
        <div className="card preview">
          <div className="card-h">
            <h2>What banks will see</h2>
            <p className="sub">Updates as you type. Always a range, never an exact value. No name, no contact details, no ID numbers.</p>
          </div>
          {rows.length === 0 ? (
            <p className="sub" style={{ padding: 16 }}>Start answering and the ranges appear here.</p>
          ) : (
            <div className="band-list">
              {rows.map((r) => (
                <div className="band-row" key={r.key}>
                  <span className="k">{r.label}</span>
                  <span className="v">{r.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="preview-foot">
            <div className="stat"><Lock width={14} height={14} /><span>Stays with you: <b>${t.income.toLocaleString()}</b> income · <b>${t.monthlyDebt.toLocaleString()}</b>/mo debt · <b>${t.assets.toLocaleString()}</b> assets</span></div>
          </div>
        </div>
        <div className="card note-card">
          <Lock width={18} height={18} />
          <p>Nothing leaves your device on this page. Sealing happens next, and nothing is sent to a bank until you approve it after that.</p>
        </div>
      </aside>
    </div>
  );
}
