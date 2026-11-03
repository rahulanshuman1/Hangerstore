export const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const getToken = () => { try { return localStorage.getItem('hangar-token'); } catch { return null; } };
export const setToken = (t) => {
  try { t ? localStorage.setItem('hangar-token', t) : localStorage.removeItem('hangar-token'); } catch {}
};

export async function api(path, { method = 'GET', body } = {}) {
  const t = getToken();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Something went wrong. Try again.'); e.status = r.status; throw e; }
  return d;
}
