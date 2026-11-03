import { useState } from 'react';
import { api } from './api.js';
import Tracker from './Tracker.jsx';

export default function TrackModal({ onClose }) {
  const [f, setF] = useState({ orderNumber: '', email: '' });
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { setOrder(await api('/api/orders/track', { method: 'POST', body: f })); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal auth" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <h2>Track your order</h2>
        {order ? (
          <>
            <p className="muted">Order {order.orderNumber} · {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
            <Tracker order={order} />
            <button className="link" onClick={() => setOrder(null)}>Track another order</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <input required placeholder="Order number (e.g. HG-1A2B3C4D)" value={f.orderNumber} onChange={set('orderNumber')} autoCapitalize="characters" />
            <input required type="email" placeholder="Email used at checkout" value={f.email} onChange={set('email')} autoComplete="email" />
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Looking…' : 'Track order'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
