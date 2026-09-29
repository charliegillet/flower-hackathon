import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthForm from './components/AuthForm.jsx';
import Profile from './components/Profile.jsx';
import Settings from './components/Settings.jsx';
import ApplicationForm from './components/ApplicationForm.jsx';
import ApplicationList from './components/ApplicationList.jsx';
import ApplicationDetail from './components/ApplicationDetail.jsx';

const NAV = {
  customer: [
    { key: 'apply', label: 'New application', icon: '📝' },
    { key: 'applications', label: 'My applications', icon: '📂' },
    { key: 'profile', label: 'Profile', icon: '👤' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ],
  bank: [
    { key: 'applications', label: 'All applications', icon: '📂' },
    { key: 'profile', label: 'Profile', icon: '👤' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ],
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [view, setView] = useState('applications');
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  // Restore session from a stored token.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const isBank = user?.role === 'bank';

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setApplications(await api.listApplications());
    } catch (err) {
      setError(err.message);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openDetail = async (id) => {
    setSelected(await api.getApplication(id));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setApplications([]);
    setSelected(null);
  };

  if (loading) return <div className="app-loading">Loading…</div>;

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <h1>flower-finance</h1>
          <p>Agent-negotiated loans</p>
        </div>
        <AuthForm
          onAuth={(u) => {
            setUser(u);
            setView(u.role === 'bank' ? 'applications' : 'apply');
          }}
        />
      </div>
    );
  }

  const nav = NAV[user.role] || NAV.customer;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🌸</span>
          <span className="brand-name">flower-finance</span>
        </div>

        <nav className="menu">
          {nav.map((item) => (
            <button
              key={item.key}
              className={`menu-item ${view === item.key ? 'active' : ''}`}
              onClick={() => setView(item.key)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
              {item.key === 'applications' && applications.length > 0 && (
                <span className="menu-count">{applications.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{user.name?.[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <strong>{user.name}</strong>
            <span>{isBank ? user.bankName || 'Bank reviewer' : 'Loan applicant'}</span>
          </div>
          <button className="logout" title="Log out" onClick={logout}>
            ⏻
          </button>
        </div>
      </aside>

      <section className="content">
        {error && <p className="error">{error}</p>}

        {view === 'apply' && !isBank && (
          <ApplicationForm
            user={user}
            onSubmitted={(app) => {
              setSelected(app);
              setView('applications');
              refresh();
            }}
            onError={setError}
          />
        )}

        {view === 'applications' && (
          <div className="mail-pane">
            <ApplicationList
              applications={applications}
              selectedId={selected?._id}
              onSelect={openDetail}
            />
            <div className="reading-pane">
              {selected ? (
                <ApplicationDetail
                  application={selected}
                  user={user}
                  onUpdated={(app) => {
                    setSelected(app);
                    refresh();
                  }}
                />
              ) : (
                <div className="empty-pane">
                  <p>Select an application to view the negotiation</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'profile' && <Profile user={user} onSaved={setUser} />}
        {view === 'settings' && <Settings user={user} onSaved={setUser} />}
      </section>
    </div>
  );
}
