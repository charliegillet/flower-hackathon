import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthForm from './components/AuthForm.jsx';
import Profile from './components/Profile.jsx';
import ApplicationForm from './components/ApplicationForm.jsx';
import ApplicationList from './components/ApplicationList.jsx';
import ApplicationDetail from './components/ApplicationDetail.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [view, setView] = useState('apply');
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
    setView('detail');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setApplications([]);
    setSelected(null);
    setView('apply');
  };

  if (loading) return <div className="app">Loading…</div>;

  if (!user) {
    return (
      <div className="app">
        <header>
          <h1>flower-finance</h1>
        </header>
        <AuthForm
          onAuth={(u) => {
            setUser(u);
            setView(u.role === 'bank' ? 'list' : 'apply');
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>flower-finance</h1>
        <nav>
          {!isBank && (
            <button className={view === 'apply' ? 'active' : ''} onClick={() => setView('apply')}>
              Apply for a loan
            </button>
          )}
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => {
              setView('list');
              refresh();
            }}
          >
            {isBank ? 'All applications' : 'My applications'} ({applications.length})
          </button>
          <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>
            My info
          </button>
          <button onClick={logout}>Log out</button>
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      <main>
        {view === 'apply' && !isBank && (
          <ApplicationForm
            user={user}
            onSubmitted={(app) => {
              setSelected(app);
              setView('detail');
              refresh();
            }}
            onError={setError}
          />
        )}
        {view === 'list' && <ApplicationList applications={applications} onSelect={openDetail} />}
        {view === 'detail' && selected && (
          <ApplicationDetail
            application={selected}
            user={user}
            onBack={() => {
              setView('list');
              refresh();
            }}
            onUpdated={(app) => {
              setSelected(app);
              refresh();
            }}
          />
        )}
        {view === 'profile' && <Profile user={user} onSaved={setUser} />}
      </main>
    </div>
  );
}
