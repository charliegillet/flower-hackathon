import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer', bankName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } =
        mode === 'login'
          ? await api.login({ email: form.email, password: form.password })
          : await api.register(form);
      setToken(token);
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form auth" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Log in
        </button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Register
        </button>
      </div>

      {mode === 'register' && (
        <>
          <label>
            Full name
            <input required value={form.name} onChange={set('name')} />
          </label>
          <label>
            I am a…
            <select value={form.role} onChange={set('role')}>
              <option value="customer">Loan applicant</option>
              <option value="bank">Bank reviewer</option>
            </select>
          </label>
          {form.role === 'bank' && (
            <label>
              Bank name
              <input required value={form.bankName} onChange={set('bankName')} />
            </label>
          )}
        </>
      )}

      <label>
        Email
        <input required type="email" value={form.email} onChange={set('email')} />
      </label>
      <label>
        Password
        <input required type="password" minLength="6" value={form.password} onChange={set('password')} />
      </label>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
