import { useEffect, useState } from 'react';
import { api } from './api.js';
import Tracker from './Tracker.jsx';

const inr = (n) => '₹' + n.toLocaleString('en-IN');
const STATUS = { paid: 'Order placed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
const BLANK = { label: 'Home', name: '', phone: '', address: '', city: '', pincode: '', isDefault: false };

function Orders() {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/me/orders').then(setOrders).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!orders) return <p className="muted">Loading your orders…</p>;
  if (!orders.length) return <p className="muted">No orders yet. Your paid orders will show up here.</p>;
  return (
    <ul className="orders">
      {orders.map((o) => (
        <li key={o._id}>
          <div className="row"><strong>Order {o.orderNumber || String(o._id).slice(-8)}</strong><span className={`badge ${o.status}`}>{STATUS[o.status] || o.status}</span></div>
          <p className="muted">{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · Deliver to {o.customer?.city}</p>
          {o.items.map((i, k) => <p key={k}>{i.qty} × {i.name} <span className="muted">(size {i.size})</span></p>)}
          <details className="trk"><summary>Track order</summary><Tracker order={o} /></details>
          <p className="row"><span className="muted">Total paid</span><strong>{inr(o.amount / 100)}</strong></p>
        </li>
      ))}
    </ul>
  );
}

function Addresses({ user, setUser }) {
  const [form, setForm] = useState(null); // null = closed, {} = editing/new
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault(); setErr('');
    try {
      const body = { ...form };
      const u = form._id
        ? await api(`/api/me/addresses/${form._id}`, { method: 'PUT', body })
        : await api('/api/me/addresses', { method: 'POST', body });
      setUser(u); setForm(null);
    } catch (x) { setErr(x.message); }
  }
  async function remove(id) {
    try { setUser(await api(`/api/me/addresses/${id}`, { method: 'DELETE' })); } catch (x) { setErr(x.message); }
  }

  return (
    <div>
      {!user.addresses.length && !form && <p className="muted">No saved addresses. Add one to speed up checkout.</p>}
      <ul className="orders">
        {user.addresses.map((a) => (
          <li key={a._id}>
            <div className="row"><strong>{a.label}</strong>{a.isDefault && <span className="badge paid">Default</span>}</div>
            <p>{a.name}, {a.phone}</p><p className="muted">{a.address}, {a.city} {a.pincode}</p>
            <div className="acts">
              <button className="link" onClick={() => setForm(a)}>Edit</button>
              <button className="link" onClick={() => remove(a._id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {form ? (
        <form onSubmit={save} className="addr">
          <input required placeholder="Label (Home, Work)" value={form.label} onChange={set('label')} />
          <input required placeholder="Full name" value={form.name} onChange={set('name')} />
          <input required placeholder="Phone (10 digits)" pattern="\d{10}" value={form.phone} onChange={set('phone')} />
          <input required placeholder="Address" value={form.address} onChange={set('address')} />
          <div className="two">
            <input required placeholder="City" value={form.city} onChange={set('city')} />
            <input required placeholder="Pincode" pattern="\d{6}" value={form.pincode} onChange={set('pincode')} />
          </div>
          <label className="check"><input type="checkbox" checked={!!form.isDefault} onChange={set('isDefault')} /> Make this my default address</label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn">Save address</button>
          <button type="button" className="link" onClick={() => setForm(null)}>Cancel</button>
        </form>
      ) : (
        <button className="btn narrow" onClick={() => { setErr(''); setForm({ ...BLANK, name: user.name, phone: user.phone }); }}>Add address</button>
      )}
    </div>
  );
}

function Profile({ user, setUser }) {
  const [p, setP] = useState({ name: user.name, phone: user.phone });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState({ profile: '', pw: '' });
  async function saveProfile(e) {
    e.preventDefault();
    try { setUser(await api('/api/me', { method: 'PUT', body: p })); setMsg({ ...msg, profile: 'Saved.' }); }
    catch (x) { setMsg({ ...msg, profile: x.message }); }
  }
  async function savePw(e) {
    e.preventDefault();
    try { await api('/api/me/password', { method: 'PUT', body: pw }); setPw({ current: '', next: '' }); setMsg({ ...msg, pw: 'Password changed.' }); }
    catch (x) { setMsg({ ...msg, pw: x.message }); }
  }
  return (
    <div className="stack">
      <form onSubmit={saveProfile}>
        <h3>Your details</h3>
        <input value={user.email} disabled aria-label="Email" />
        <input required placeholder="Full name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <input placeholder="Phone (10 digits)" pattern="\d{10}|" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />
        <button className="btn">Save details</button>{msg.profile && <p className="muted" role="status">{msg.profile}</p>}
      </form>
      <form onSubmit={savePw}>
        <h3>Change password</h3>
        <input required type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        <input required type="password" minLength={8} placeholder="New password (8+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
        <button className="btn">Change password</button>{msg.pw && <p className="muted" role="status">{msg.pw}</p>}
      </form>
    </div>
  );
}

export default function Account({ user, setUser, products, onOpen, onLike, onLogout }) {
  const [tab, setTab] = useState('orders');
  const saved = products.filter((p) => user.wishlist.includes(p._id));
  const tabs = [['orders', 'Orders'], ['addresses', 'Addresses'], ['saved', `Saved (${saved.length})`], ['profile', 'Profile']];
  return (
    <section className="account">
      <div className="row"><h1>Hi, {user.name.split(' ')[0]}</h1><button className="link" onClick={onLogout}>Sign out</button></div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'orders' && <Orders />}
      {tab === 'addresses' && <Addresses user={user} setUser={setUser} />}
      {tab === 'profile' && <Profile user={user} setUser={setUser} />}
      {tab === 'saved' && (saved.length ? (
        <div className="grid">
          {saved.map((p) => (
            <div key={p._id} className="cardwrap">
              <button className="card" onClick={() => onOpen(p)}>
                <div className="card-art">{p.image ? <img className="garment" src={p.image} alt="" /> : null}</div>
                <span>{p.name}</span><span className="muted">{inr(p.price)}</span>
              </button>
              <button className="heart on" onClick={() => onLike(p)} aria-label="Remove from saved">♥</button>
            </div>
          ))}
        </div>
      ) : <p className="muted">Nothing saved yet. Tap the heart on any piece.</p>)}
    </section>
  );
}
