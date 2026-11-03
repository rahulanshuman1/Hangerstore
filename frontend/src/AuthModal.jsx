import { useState } from 'react';
import { api } from './api.js';

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await api(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body: f });
      onAuth(d.token, d.user);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal auth" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
        <form onSubmit={submit}>
          {signup && <input required placeholder="Full name" value={f.name} onChange={set('name')} autoComplete="name" />}
          <input required type="email" placeholder="Email" value={f.email} onChange={set('email')} autoComplete="email" />
          <input required type="password" minLength={8} placeholder="Password (8+ characters)" value={f.password}
            onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="link" onClick={() => { setMode(signup ? 'login' : 'signup'); setErr(''); }}>
          {signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </div>
  );
}
