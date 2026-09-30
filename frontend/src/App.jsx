import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Landing from './components/Landing.jsx';
import Profile from './components/Profile.jsx';
import Settings from './components/Settings.jsx';
import ApplicationList from './components/ApplicationList.jsx';
import ApplicationDetail from './components/ApplicationDetail.jsx';
import TrustFlow from './components/trust/TrustFlow.jsx';
import { Doc, Folder, User as UserIcon, Gear, Power, ShieldCheck } from './components/trust/Icons.jsx';

// ?demo=1 skips login so the trust flow can be shown without an account.
const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
const DEMO_USER = { name: 'Demo Applicant', email: 'demo@example.com', role: 'customer', profile: {}, demo: true };

const NAV = {
  customer: [
    { key: 'apply', label: 'New application', icon: <Doc /> },
    { key: 'applications', label: 'My applications', icon: <Folder /> },
    { key: 'profile', label: 'Profile', icon: <UserIcon /> },
    { key: 'settings', label: 'Settings', icon: <Gear /> },
  ],
  bank: [
    { key: 'applications', label: 'All applications', icon: <Folder /> },
    { key: 'profile', label: 'Profile', icon: <UserIcon /> },
    { key: 'settings', label: 'Settings', icon: <Gear /> },
  ],
};

export default function App() {
  const [user, setUser] = useState(DEMO ? DEMO_USER : null);
  const [loading, setLoading] = useState(!DEMO && Boolean(getToken()));
  const [view, setView] = useState(DEMO ? 'apply' : 'applications');
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
    if (!user || user.demo) return;
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
      <Landing
        onAuth={(u) => {
          setUser(u);
          setView(u.role === 'bank' ? 'applications' : 'apply');
        }}
      />
    );
  }

  const nav = NAV[user.role] || NAV.customer;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck width={22} height={22} /></span>
          <span className="brand-name">Flower Finance</span>
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
          <button className="logout" title="Log out" aria-label="Log out" onClick={logout}>
            <Power />
          </button>
        </div>
      </aside>

      <section className="content">
        {error && <p className="error">{error}</p>}

        {view === 'apply' && !isBank && (
          <TrustFlow
            user={user}
            onError={setError}
            onAccepted={async ({ form, bank, offer }) => {
              // The wireframe submits the accepted deal through today's API so it
              // shows up under My applications. The real version will already
              // have an application record from the seal step.
              if (user.demo) {
                setError(`Demo: accepted ${bank.name} at ${offer.rate.toFixed(3)}%. Log in to save applications.`);
                return;
              }
              try {
                const app = await api.submitApplication({
                  applicant: {
                    name: user.name,
                    email: user.email,
                    annualIncome: Number(form.annualIncome) || 0,
                    employmentStatus: form.employmentStatus,
                    // The trust flow now asks for single totals (see SECTIONS in core/bands.js).
                    monthlyDebt: Number(form.monthlyDebt) || 0,
                    totalAssets: Number(form.totalAssets) || 0,
                    creditScore: Number(form.creditScore),
                  },
                  loan: { amount: Number(form.amount), purpose: form.purpose, termMonths: Number(form.termMonths) },
                });
                setSelected(app);
                setView('applications');
                refresh();
              } catch (err) {
                setError(err.message);
              }
            }}
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
