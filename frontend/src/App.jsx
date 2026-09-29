import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import ApplicationForm from './components/ApplicationForm.jsx';
import ApplicationList from './components/ApplicationList.jsx';
import ApplicationDetail from './components/ApplicationDetail.jsx';

export default function App() {
  const [view, setView] = useState('apply');
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setApplications(await api.listApplications());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openDetail = async (id) => {
    setSelected(await api.getApplication(id));
  };

  return (
    <div className="app">
      <header>
        <h1>flower-finance</h1>
        <nav>
          <button className={view === 'apply' ? 'active' : ''} onClick={() => setView('apply')}>
            Apply for a loan
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => {
              setView('list');
              refresh();
            }}
          >
            Applications ({applications.length})
          </button>
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      <main>
        {view === 'apply' && (
          <ApplicationForm
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
      </main>
    </div>
  );
}
