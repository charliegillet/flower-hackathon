import { useState } from 'react';
import { api, setToken } from '../api.js';

const COPY = {
  login: {
    title: 'Welcome back',
    sub: "Log in to see your agent's latest offers.",
    submit: 'Log in',
    swapLead: 'New here?',
    swapLabel: 'Create an account',
    next: 'register',
  },
  register: {
    title: 'Create your account',
    sub: 'Set up your agent in about two minutes.',
    submit: 'Create account',
    swapLead: 'Already have an account?',
    swapLabel: 'Log in',
    next: 'login',
  },
};

export default function AuthForm({ onAuth, mode, onMode }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer', bankName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[mode] || COPY.login;

  const choose = (next) => {
    setError('');
    onMode(next);
  };

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const email = form.email.trim().toLowerCase();
    try {
      const { token, user } =
        mode === 'register'
          ? await api.register({ ...form, email })
          : await api.login({ email, password: form.password });
      setToken(token);
      onAuth(user);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing-card">
      <div className="landing-modes" role="group" aria-label="Choose an option">
        <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => choose('login')}>Log in</button>
        <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => choose('register')}>Register</button>
      </div>

      <h2>{copy.title}</h2>
      <p className="landing-sub">{copy.sub}</p>

      <form onSubmit={submit}>
        {mode === 'register' && (
          <>
            <div className="landing-field">
              <label htmlFor="name">Full name</label>
              <input id="name" required value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div className="landing-field">
              <label htmlFor="role">I am a…</label>
              <select id="role" value={form.role} onChange={set('role')}>
                <option value="customer">Loan applicant</option>
                <option value="bank">Bank reviewer</option>
              </select>
            </div>
            {form.role === 'bank' && (
              <div className="landing-field">
                <label htmlFor="bankName">Bank name</label>
                <input id="bankName" required value={form.bankName} onChange={set('bankName')} />
              </div>
            )}
          </>
        )}

        <div className="landing-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div className="landing-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? 8 : 6}
            value={form.password}
            onChange={set('password')}
          />
          {mode === 'register' && <p className="landing-hint">At least 8 characters.</p>}
        </div>

        {error && <p className="landing-note">{error}</p>}
        <button className="landing-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : copy.submit}
        </button>
      </form>

      <p className="landing-switch">
        {copy.swapLead}{' '}
        <button type="button" disabled={busy} onClick={() => choose(copy.next)}>{copy.swapLabel}</button>
      </p>
    </div>
  );
}
