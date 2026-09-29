import { useState } from 'react';
import { api } from '../api.js';

export default function Settings({ user, onSaved }) {
  const s = user.settings || {};
  const [prefs, setPrefs] = useState({
    emailNotifications: s.emailNotifications ?? true,
    currency: s.currency || 'USD',
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [prefsMsg, setPrefsMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const savePrefs = async (e) => {
    e.preventDefault();
    try {
      onSaved(await api.updateMe({ settings: prefs }));
      setPrefsMsg('Saved.');
    } catch (err) {
      setPrefsMsg(err.message);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    if (pw.newPassword !== pw.confirm) {
      setPwMsg('New passwords do not match.');
      return;
    }
    try {
      await api.changePassword(pw.currentPassword, pw.newPassword);
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg('Password updated.');
    } catch (err) {
      setPwMsg(err.message);
    }
  };

  return (
    <div className="profile">
      <form className="card section" onSubmit={savePrefs}>
        <div className="section-head">
          <h3>Preferences</h3>
        </div>
        <div className="grid">
          <label>
            Currency
            <select
              value={prefs.currency}
              onChange={(e) => setPrefs({ ...prefs, currency: e.target.value })}
            >
              {['USD', 'EUR', 'GBP'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.emailNotifications}
              onChange={(e) => setPrefs({ ...prefs, emailNotifications: e.target.checked })}
            />
            Email me when an application status changes
          </label>
        </div>
        <div className="section-foot">
          {prefsMsg && <span className="muted">{prefsMsg}</span>}
          <button type="submit">Save</button>
        </div>
      </form>

      <form className="card section" onSubmit={savePassword}>
        <div className="section-head">
          <h3>Change password</h3>
        </div>
        <div className="grid">
          <label>
            Current password
            <input
              required
              type="password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </label>
          <label>
            New password
            <input
              required
              type="password"
              minLength="6"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </label>
          <label>
            Confirm new password
            <input
              required
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </label>
        </div>
        <div className="section-foot">
          {pwMsg && <span className="muted">{pwMsg}</span>}
          <button type="submit">Update password</button>
        </div>
      </form>
    </div>
  );
}
