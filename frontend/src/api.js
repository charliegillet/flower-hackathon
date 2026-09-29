const TOKEN_KEY = 'ff_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  updateMe: (payload) => request('/auth/me', { method: 'PUT', body: JSON.stringify(payload) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  listApplications: () => request('/applications'),
  getApplication: (id) => request(`/applications/${id}`),
  submitApplication: (payload) =>
    request('/applications', { method: 'POST', body: JSON.stringify(payload) }),
  renegotiate: (id) => request(`/applications/${id}/renegotiate`, { method: 'POST' }),
  decide: (id, decision, note) =>
    request(`/applications/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
};

// ---- Flower (BlindQuote) runs --------------------------------------------------------
// The backend relays these to the Flower bridge. Only the sealed bands object is sent.
export const flower = {
  status: () => request('/flower/status'),
  start: ({ bands, horizonYears, consentToken }) =>
    request('/flower/runs', { method: 'POST', body: JSON.stringify({ bands, horizonYears, consentToken }) }),

  /** Stream a run's server-sent events. fetch (not EventSource) so the auth header is sent. */
  async stream(runId, onEvent, signal) {
    const token = getToken();
    const res = await fetch(`/api/flower/runs/${encodeURIComponent(runId)}/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`Run stream failed: ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (data) {
          try { onEvent(JSON.parse(data)); } catch { /* ignore malformed frame */ }
        }
      }
    }
  },
};
