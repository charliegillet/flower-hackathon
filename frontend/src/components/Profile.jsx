import { useState } from 'react';
import { api } from '../api.js';

const EMPLOYMENT = ['employed', 'self-employed', 'unemployed', 'retired', 'student'];

// Each profile section is an independently-saved card.
function Section({ title, description, fields, values, onSave }) {
  const [form, setForm] = useState(values);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const setField = (name) => (e) => {
    const keys = name.split('.');
    const next = { ...form };
    let target = next;
    for (const k of keys.slice(0, -1)) target = target[k] = { ...target[k] };
    target[keys.at(-1)] = e.target.value;
    setForm(next);
  };

  const get = (name) => name.split('.').reduce((o, k) => o?.[k], form) ?? '';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      // Numbers stay numbers; empty strings become undefined-ish 0 for numeric fields.
      const cleaned = {};
      const assign = (obj, keys, val) => {
        let t = obj;
        for (const k of keys.slice(0, -1)) t = t[k] = t[k] || {};
        t[keys.at(-1)] = val;
      };
      for (const f of fields) {
        const raw = get(f.name);
        const val = f.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
        assign(cleaned, f.name.split('.'), val);
      }
      await onSave(cleaned);
      setMsg('Saved.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card section" onSubmit={submit}>
      <div className="section-head">
        <h3>{title}</h3>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select value={get(f.name)} onChange={setField(f.name)}>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type || 'text'}
                min={f.min}
                max={f.max}
                value={get(f.name)}
                onChange={setField(f.name)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="section-foot">
        {msg && <span className="muted">{msg}</span>}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const CUSTOMER_SECTIONS = [
  {
    key: 'personal',
    title: 'Personal details',
    description: 'How the bank reaches you.',
    fields: [
      { name: 'phone', label: 'Phone' },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      { name: 'address.street', label: 'Street' },
      { name: 'address.city', label: 'City' },
      { name: 'address.state', label: 'State' },
      { name: 'address.zip', label: 'ZIP' },
    ],
  },
  {
    key: 'income',
    title: 'Income & employment',
    description: 'Primary income used for underwriting.',
    fields: [
      { name: 'annualIncome', label: 'Annual income ($)', type: 'number', min: 0 },
      { name: 'employmentStatus', label: 'Employment status', options: EMPLOYMENT },
      { name: 'employer', label: 'Employer' },
      { name: 'yearsEmployed', label: 'Years employed', type: 'number', min: 0 },
    ],
  },
  {
    key: 'assets',
    title: 'Assets',
    description: 'Reserves the bank can count against the loan.',
    fields: [
      { name: 'checking', label: 'Checking ($)', type: 'number', min: 0 },
      { name: 'savings', label: 'Savings ($)', type: 'number', min: 0 },
      { name: 'investments', label: 'Investments ($)', type: 'number', min: 0 },
      { name: 'realEstate', label: 'Real estate ($)', type: 'number', min: 0 },
      { name: 'other', label: 'Other ($)', type: 'number', min: 0 },
    ],
  },
  {
    key: 'debts',
    title: 'Monthly debts',
    description: 'Recurring monthly obligations.',
    fields: [
      { name: 'monthlyHousing', label: 'Rent / mortgage ($)', type: 'number', min: 0 },
      { name: 'autoLoans', label: 'Auto loans ($)', type: 'number', min: 0 },
      { name: 'studentLoans', label: 'Student loans ($)', type: 'number', min: 0 },
      { name: 'creditCards', label: 'Credit cards ($)', type: 'number', min: 0 },
      { name: 'other', label: 'Other ($)', type: 'number', min: 0 },
    ],
  },
  {
    key: 'credit',
    title: 'Credit',
    fields: [{ name: 'score', label: 'Credit score', type: 'number', min: 300, max: 850 }],
  },
];

export default function Profile({ user, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [bankName, setBankName] = useState(user.bankName || '');
  const [msg, setMsg] = useState('');

  const saveBasics = async (e) => {
    e.preventDefault();
    try {
      onSaved(await api.updateMe({ name, bankName }));
      setMsg('Saved.');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const saveSection = (key) => async (values) => {
    onSaved(await api.updateMe({ profile: { [key]: values } }));
  };

  if (user.role === 'bank') {
    return (
      <form className="card section" onSubmit={saveBasics}>
        <div className="section-head">
          <h3>My info</h3>
          <p className="muted">{user.email} · bank reviewer</p>
        </div>
        <div className="grid">
          <label>
            Full name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Bank name
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </label>
        </div>
        <div className="section-foot">
          {msg && <span className="muted">{msg}</span>}
          <button type="submit">Save</button>
        </div>
      </form>
    );
  }

  const profile = user.profile || {};
  return (
    <div className="profile">
      <form className="card section" onSubmit={saveBasics}>
        <div className="section-head">
          <h3>Account</h3>
          <p className="muted">{user.email} · loan applicant</p>
        </div>
        <div className="grid">
          <label>
            Full name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="section-foot">
          {msg && <span className="muted">{msg}</span>}
          <button type="submit">Save</button>
        </div>
      </form>

      {CUSTOMER_SECTIONS.map((s) => (
        <Section
          key={s.key}
          title={s.title}
          description={s.description}
          fields={s.fields}
          values={profile[s.key] || {}}
          onSave={saveSection(s.key)}
        />
      ))}
    </div>
  );
}
