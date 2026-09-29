async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  listApplications: () => request('/applications'),
  getApplication: (id) => request(`/applications/${id}`),
  submitApplication: (payload) =>
    request('/applications', { method: 'POST', body: JSON.stringify(payload) }),
  renegotiate: (id) => request(`/applications/${id}/renegotiate`, { method: 'POST' }),
};
