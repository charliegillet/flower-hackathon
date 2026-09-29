import { useState } from 'react';
import { api } from '../api.js';

const PURPOSES = ['home', 'auto', 'personal', 'business', 'education', 'debt-consolidation', 'other'];
const EMPLOYMENT = ['employed', 'self-employed', 'unemployed', 'retired', 'student'];

export default function ApplicationForm({ onSubmitted, onError }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    annualIncome: '',
    employmentStatus: 'employed',
    monthlyDebt: '',
    creditScore: '',
    amount: '',
    purpose: 'personal',
    termMonths: 36,
  });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      const payload = {
        applicant: {
          name: form.name,
          email: form.email,
          annualIncome: Number(form.annualIncome),
          employmentStatus: form.employmentStatus,
          monthlyDebt: Number(form.monthlyDebt || 0),
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
      <div className="grid">
        <label>
          Full name
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label>
          Email
          <input required type="email" value={form.email} onChange={set('email')} />
        </label>
        <label>
          Annual income ($)
          <input required type="number" min="0" value={form.annualIncome} onChange={set('annualIncome')} />
        </label>
        <label>
          Monthly debt payments ($)
          <input type="number" min="0" value={form.monthlyDebt} onChange={set('monthlyDebt')} />
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
        <label>
          Loan amount ($)
          <input required type="number" min="100" value={form.amount} onChange={set('amount')} />
        </label>
        <label>
          Purpose
          <select value={form.purpose} onChange={set('purpose')}>
            {PURPOSES.map((p) => (
              <option key={p}>{p}</option>
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
