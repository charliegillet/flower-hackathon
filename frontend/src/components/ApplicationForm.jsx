import { useState } from 'react';
import { api } from '../api.js';

const PURPOSES = ['home', 'auto', 'personal', 'business', 'education', 'debt-consolidation', 'other'];
const EMPLOYMENT = ['employed', 'self-employed', 'unemployed', 'retired', 'student'];

const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);

// Prefill from the sectioned profile, falling back to the old flat fields
// for accounts created before sections existed.
function defaults(user) {
  const p = user.profile || {};
  const debts = sum(p.debts);
  const assets = sum(p.assets);
  return {
    annualIncome: p.income?.annualIncome ?? p.annualIncome ?? '',
    employmentStatus: p.income?.employmentStatus ?? p.employmentStatus ?? 'employed',
    monthlyDebt: debts || p.monthlyDebt || '',
    totalAssets: assets || '',
    creditScore: p.credit?.score ?? p.creditScore ?? '',
    amount: '',
    purpose: 'personal',
    termMonths: 36,
  };
}

export default function ApplicationForm({ user, onSubmitted, onError }) {
  const [form, setForm] = useState(() => defaults(user));
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      const payload = {
        applicant: {
          name: user.name,
          email: user.email,
          annualIncome: Number(form.annualIncome),
          employmentStatus: form.employmentStatus,
          monthlyDebt: Number(form.monthlyDebt || 0),
          totalAssets: Number(form.totalAssets || 0),
          creditScore: Number(form.creditScore),
        },
        loan: {
          amount: Number(form.amount),
          purpose: form.purpose,
          termMonths: Number(form.termMonths),
        },
      };
      onSubmitted(await api.submitApplication(payload));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Loan application</h2>
      <p className="muted">
        Applying as {user.name} ({user.email}). Financials are prefilled from your profile — adjust them
        for this application or update your saved info under "Profile".
      </p>

      <h3 className="form-section">Your finances</h3>
      <div className="grid">
        <label>
          Annual income ($)
          <input required type="number" min="0" value={form.annualIncome} onChange={set('annualIncome')} />
        </label>
        <label>
          Monthly debt payments ($)
          <input type="number" min="0" value={form.monthlyDebt} onChange={set('monthlyDebt')} />
        </label>
        <label>
          Total assets ($)
          <input type="number" min="0" value={form.totalAssets} onChange={set('totalAssets')} />
        </label>
        <label>
          Credit score
          <input required type="number" min="300" max="850" value={form.creditScore} onChange={set('creditScore')} />
        </label>
        <label>
          Employment status
          <select value={form.employmentStatus} onChange={set('employmentStatus')}>
            {EMPLOYMENT.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="form-section">Loan details</h3>
      <div className="grid">
        <label>
          Loan amount ($)
          <input required type="number" min="100" value={form.amount} onChange={set('amount')} />
        </label>
        <label>
          Purpose
          <select value={form.purpose} onChange={set('purpose')}>
            {PURPOSES.map((p2) => (
              <option key={p2}>{p2}</option>
            ))}
          </select>
        </label>
        <label>
          Term (months)
          <input required type="number" min="6" max="360" value={form.termMonths} onChange={set('termMonths')} />
        </label>
      </div>

      <button type="submit" disabled={busy}>
        {busy ? 'Agents negotiating…' : 'Submit application'}
      </button>
    </form>
  );
}
