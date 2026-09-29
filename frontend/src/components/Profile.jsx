import { useState } from 'react';
import { api } from '../api.js';

const EMPLOYMENT = ['employed', 'self-employed', 'unemployed', 'retired', 'student'];

export default function Profile({ user, onSaved }) {
  const p = user.profile || {};
  const [form, setForm] = useState({
    name: user.name || '',
    bankName: user.bankName || '',
    annualIncome: p.annualIncome ?? '',
    employmentStatus: p.employmentStatus || 'employed',
    monthlyDebt: p.monthlyDebt ?? '',
    creditScore: p.creditScore ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const payload = { name: form.name };
      if (user.role === 'bank') {
        payload.bankName = form.bankName;
      } else {
        payload.profile = {
          annualIncome: Number(form.annualIncome || 0),
          employmentStatus: form.employmentStatus,
          monthlyDebt: Number(form.monthlyDebt || 0),
          creditScore: Number(form.creditScore || 0),
        };
      }
      onSaved(await api.updateMe(payload));
      setMsg('Saved.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>My info</h2>
      <p className="muted">
        {user.email} · {user.role === 'bank' ? 'bank reviewer' : 'loan applicant'}
      </p>
      <div className="grid">
        <label>
          Full name
          <input required value={form.name} onChange={set('name')} />
        </label>
        {user.role === 'bank' ? (
          <label>
            Bank name
            <input value={form.bankName} onChange={set('bankName')} />
          </label>
        ) : (
          <>
            <label>
              Annual income ($)
              <input type="number" min="0" value={form.annualIncome} onChange={set('annualIncome')} />
            </label>
            <label>
              Monthly debt payments ($)
              <input type="number" min="0" value={form.monthlyDebt} onChange={set('monthlyDebt')} />
            </label>
            <label>
              Credit score
              <input type="number" min="300" max="850" value={form.creditScore} onChange={set('creditScore')} />
            </label>
            <label>
              Employment status
              <select value={form.employmentStatus} onChange={set('employmentStatus')}>
                {EMPLOYMENT.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {msg && <p className="muted">{msg}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
