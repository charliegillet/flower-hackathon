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
