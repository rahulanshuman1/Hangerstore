import { useEffect, useMemo, useState } from 'react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const inr = (n) => '₹' + n.toLocaleString('en-IN');

const FALLBACK = ['#1f2a44', '#b4bcc6', '#2b2b2e', '#e3d6bb', '#1f5a3a', '#4a4a4d']
  .map((color, i) => ({ _id: 'f' + i, name: 'Hoodie', price: 2499, color, sizes: ['S', 'M', 'L', 'XL'], stock: 0 }));

function Garment({ color, image }) {
  if (image) return <img className="garment" src={image} alt="" loading="lazy" />;
  return (
    <svg className="garment" viewBox="0 0 120 190" aria-hidden="true">
      <path d="M60 3c7 0 9 8 2 11l-2 4M10 42 60 18l50 24" fill="none" stroke="#8d8d94" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 44 40 33q20 17 40 0l12 11 14 106-13 4-7-58-2 85H34l-2-85-7 58-13-4Z" fill={color} />
      <path d="M38 32q22-20 44 0l3 22q-25 12-50 0Z" fill={color} />
      <path d="M38 32q22-20 44 0l3 22q-25 12-50 0Z" fill="#000" opacity=".16" />
      <path d="M52 54v26M68 54v26" stroke="#fff" opacity=".7" strokeWidth="2" strokeLinecap="round" />
      <path d="M44 128h32l4 24H40Z" fill="#000" opacity=".1" />
    </svg>
  );
}

function Rail({ products, onOpen }) {
  const row = [...products, ...products]; // duplicated for a seamless loop
  return (
    <div className="rail" aria-label="New collection">
      <div className="rail-bar" />
      <div className="rail-track" style={{ '--n': products.length }}>
        {row.map((p, i) => (
          <button key={p._id + i} className="hang" style={{ '--d': `${(i % 7) * -0.55}s` }}
            onClick={() => p.stock !== 0 && onOpen(p)} aria-label={`${p.name}, ${inr(p.price)}`}>
            <span className="swing">
              <span className="tag">{inr(p.price)}</span>
              <Garment color={p.color} image={p.image} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductModal({ p, onClose, onAdd }) {
  const [size, setSize] = useState('');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-art"><Garment color={p.color} image={p.image} /></div>
        <div className="modal-info">
          <h2>{p.name}</h2>
          <p className="price">{inr(p.price)}</p>
          <p className="muted">{p.description}</p>
          <p className="label">Size</p>
          <div className="sizes">
            {p.sizes.map((s) => (
              <button key={s} className={s === size ? 'on' : ''} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
          <button className="btn" disabled={!size} onClick={() => { onAdd(p, size); onClose(); }}>
            {size ? 'Add to bag' : 'Pick a size'}
          </button>
        </div>
      </div>
    </div>
  );
}

const loadRazorpay = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = resolve;
  s.onerror = () => reject(new Error('Could not load Razorpay. Check your connection.'));
  document.body.appendChild(s);
});

const EMPTY = { name: '', email: '', phone: '', address: '', city: '', pincode: '' };

function Bag({ cart, setCart, onClose, onPaid }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState('bag');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const change = (key, d) => setCart(cart.map((i) => i.key === key ? { ...i, qty: Math.max(0, Math.min(10, i.qty + d)) } : i).filter((i) => i.qty));

  async function pay(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await fetch(`${API}/api/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map((i) => ({ productId: i.id, size: i.size, qty: i.qty })), customer: form }),
      });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error || 'Could not start payment.');
      await loadRazorpay();
      const rz = new window.Razorpay({
        key: o.key, amount: o.amount, currency: o.currency, order_id: o.razorpayOrderId,
        name: 'Hangar', description: 'Order payment',
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: '#1b1b1f' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (res) => {
          try {
            const v = await fetch(`${API}/api/orders/verify`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(res),
            });
            const d = await v.json();
            if (!v.ok) throw new Error(d.error);
            onPaid(d.orderId);
          } catch (ex) { setErr(ex.message || 'Payment went through but we could not confirm it. Contact support with your payment ID: ' + res.razorpay_payment_id); }
          setBusy(false);
        },
      });
      rz.on('payment.failed', (f) => { setErr(f.error?.description || 'Payment failed. Try again.'); setBusy(false); });
      rz.open();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <div className="overlay right" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header><h2>{step === 'bag' ? 'Your bag' : 'Delivery details'}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></header>
        {!cart.length ? <p className="muted">Your bag is empty. Pick something off the rail.</p> : step === 'bag' ? (
          <>
            <ul className="lines">
              {cart.map((i) => (
                <li key={i.key}>
                  <div className="dot" style={{ background: i.color }} />
                  <div><strong>{i.name}</strong><span className="muted">Size {i.size}</span></div>
                  <div className="qty"><button onClick={() => change(i.key, -1)}>−</button>{i.qty}<button onClick={() => change(i.key, 1)}>+</button></div>
                  <span>{inr(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="total"><span>Total</span><strong>{inr(total)}</strong></div>
            <button className="btn" onClick={() => setStep('details')}>Continue to delivery</button>
          </>
        ) : (
          <form onSubmit={pay}>
            <input required placeholder="Full name" value={form.name} onChange={set('name')} autoComplete="name" />
            <input required type="email" placeholder="Email" value={form.email} onChange={set('email')} autoComplete="email" />
            <input required placeholder="Phone (10 digits)" pattern="\d{10}" value={form.phone} onChange={set('phone')} autoComplete="tel-national" />
            <input required placeholder="Address" value={form.address} onChange={set('address')} autoComplete="street-address" />
            <div className="two">
              <input required placeholder="City" value={form.city} onChange={set('city')} autoComplete="address-level2" />
              <input required placeholder="Pincode" pattern="\d{6}" value={form.pincode} onChange={set('pincode')} autoComplete="postal-code" />
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Opening payment…' : `Pay ${inr(total)}`}</button>
            <button type="button" className="link" onClick={() => setStep('bag')}>Back to bag</button>
          </form>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [done, setDone] = useState('');
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hangar-cart')) || []; } catch { return []; }
  });

  useEffect(() => {
    fetch(`${API}/api/products`).then((r) => r.json()).then((d) => Array.isArray(d) && setProducts(d))
      .catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { try { localStorage.setItem('hangar-cart', JSON.stringify(cart)); } catch {} }, [cart]);

  const railItems = useMemo(() => (products.length ? products : FALLBACK), [products]);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const add = (p, size) => {
    const key = p._id + size;
    setCart((c) => c.find((i) => i.key === key)
      ? c.map((i) => i.key === key ? { ...i, qty: Math.min(10, i.qty + 1) } : i)
      : [...c, { key, id: p._id, name: p.name, price: p.price, color: p.color, size, qty: 1 }]);
    setBagOpen(true);
  };
  const paid = (id) => { setCart([]); setBagOpen(false); setDone(id); };

  return (
    <>
      <header className="nav">
        <a className="brand" href="#top">Hangar</a>
        <nav><a href="#shop">Shop</a><button onClick={() => setBagOpen(true)}>Bag ({count})</button></nav>
      </header>

      <main id="top">
        <section className="hero">
          <h1>New collection, premium streetwear</h1>
          <Rail products={railItems} onOpen={setOpen} />
          <p className="hero-note">Crafted in heavyweight cotton.<br />Cut oversized. Made to last.</p>
        </section>

        <section id="shop" className="shop">
          <h2>All pieces</h2>
          {!loaded ? <p className="muted">Loading…</p> : !products.length ? <p className="muted">No products yet. Run the seed script on the backend.</p> : (
            <div className="grid">
              {products.map((p) => (
                <button key={p._id} className="card" disabled={p.stock === 0} onClick={() => setOpen(p)}>
                  <div className="card-art"><Garment color={p.color} image={p.image} /></div>
                  <span>{p.name}</span><span className="muted">{p.stock === 0 ? 'Sold out' : inr(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="foot">© {new Date().getFullYear()} Hangar · Free returns within 7 days</footer>

      {open && <ProductModal p={open} onClose={() => setOpen(null)} onAdd={add} />}
      {bagOpen && <Bag cart={cart} setCart={setCart} onClose={() => setBagOpen(false)} onPaid={paid} />}
      {done && (
        <div className="overlay" onClick={() => setDone('')}>
          <div className="modal done" onClick={(e) => e.stopPropagation()}>
            <h2>Order confirmed</h2>
            <p className="muted">Reference {String(done).slice(-8)}. Payment received and your order is being packed.</p>
            <button className="btn" onClick={() => setDone('')}>Keep shopping</button>
          </div>
        </div>
      )}
    </>
  );
}
