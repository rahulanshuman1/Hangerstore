import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Razorpay from 'razorpay';
import { Product, Order } from './models.js';
import { seedData } from './seedData.js';
import { authRouter, meRouter, optionalAuth } from './auth.js';

const {
  MONGO_URI, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
  CLIENT_ORIGIN = '', PORT = 5000, ADMIN_TOKEN, AUTO_SEED,
} = process.env;

for (const [k, v] of Object.entries({ MONGO_URI, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, JWT_SECRET: process.env.JWT_SECRET })) {
  if (!v) { console.error(`Missing env var ${k}`); process.exit(1); }
}

const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) }));

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Idempotent: only the first caller flips created -> paid and decrements stock.
async function markPaid(razorpayOrderId, paymentId) {
  const order = await Order.findOneAndUpdate(
    { razorpayOrderId, status: 'created' },
    { status: 'paid', razorpayPaymentId: paymentId, $push: { history: { status: 'paid', note: 'Payment received' } } },
    { new: true },
  );
  if (order) {
    await Promise.all(order.items.map((i) =>
      Product.updateOne({ _id: i.product }, { $inc: { stock: -i.qty } })));
  }
  return order || (await Order.findOne({ razorpayOrderId }));
}

// Webhook needs the raw body, so it is mounted before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!RAZORPAY_WEBHOOK_SECRET) return res.sendStatus(501);
    const sig = req.get('x-razorpay-signature') || '';
    if (!safeEqual(sig, hmac(RAZORPAY_WEBHOOK_SECRET, req.body))) return res.sendStatus(400);
    const evt = JSON.parse(req.body.toString());
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
      const p = evt.payload.payment.entity;
      await markPaid(p.order_id, p.id);
    }
    res.sendStatus(200);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/products', async (_req, res, next) => {
  try { res.json(await Product.find().sort({ createdAt: 1 }).lean()); } catch (e) { next(e); }
});

app.get('/api/products/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const p = await Product.findById(req.params.id).lean();
    p ? res.json(p) : res.status(404).json({ error: 'Not found' });
  } catch (e) { next(e); }
});

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

app.post('/api/orders', rateLimit({ windowMs: 60 * 1000, limit: 10 }), optionalAuth, async (req, res, next) => {
  try {
    const { items, customer = {} } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 20)
      return res.status(400).json({ error: 'Your cart is empty.' });

    const c = {
      name: str(customer.name, 80), email: str(customer.email, 120), phone: str(customer.phone, 15),
      address: str(customer.address, 300), city: str(customer.city, 80), pincode: str(customer.pincode, 10),
    };
    if (!c.name || !/^\S+@\S+\.\S+$/.test(c.email) || !/^\d{10}$/.test(c.phone)
      || !c.address || !c.city || !/^\d{6}$/.test(c.pincode))
      return res.status(400).json({ error: 'Check your details: name, email, 10-digit phone, address, city and 6-digit pincode.' });

    const lines = [];
    let total = 0;
    for (const it of items) {
      const qty = Number(it.qty);
      if (!mongoose.isValidObjectId(it.productId) || !Number.isInteger(qty) || qty < 1 || qty > 10)
        return res.status(400).json({ error: 'Invalid cart item.' });
      const p = await Product.findById(it.productId); // price always comes from the DB
      if (!p || !p.sizes.includes(it.size)) return res.status(400).json({ error: 'An item is no longer available.' });
      if (p.stock < qty) return res.status(409).json({ error: `${p.name} has only ${p.stock} left.` });
      lines.push({ product: p._id, name: p.name, price: p.price, size: it.size, qty });
      total += p.price * qty;
    }

    const amount = total * 100; // paise
    const rzpOrder = await rzp.orders.create({ amount, currency: 'INR', receipt: `rcpt_${Date.now()}` });
    const order = await Order.create({ orderNumber: 'HG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), user: req.userId || undefined, items: lines, customer: c, amount, razorpayOrderId: rzpOrder.id });
    res.status(201).json({
      orderId: order._id, razorpayOrderId: rzpOrder.id, amount, currency: 'INR', key: RAZORPAY_KEY_ID,
    });
  } catch (e) { next(e); }
});

// Public order lookup for guests: needs the order number AND the email used at checkout
app.post('/api/orders/track', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), async (req, res, next) => {
  try {
    const num = str(req.body?.orderNumber, 30).toUpperCase(), email = str(req.body?.email, 120).toLowerCase();
    const o = num && email ? await Order.findOne({ orderNumber: num, status: { $ne: 'created' } }).lean() : null;
    if (!o || (o.customer?.email || '').toLowerCase() !== email)
      return res.status(404).json({ error: "We couldn't find that order. Check the order number and email." });
    const { orderNumber, status, items, amount, createdAt, tracking, history } = o;
    res.json({ orderNumber, status, items, amount, createdAt, tracking, history, customer: { city: o.customer.city } });
  } catch (e) { next(e); }
});

app.post('/api/orders/verify', async (req, res, next) => {
  try {
    const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body || {};
    if (!oid || !pid || !sig) return res.status(400).json({ error: 'Missing payment details.' });
    if (!safeEqual(sig, hmac(RAZORPAY_KEY_SECRET, `${oid}|${pid}`)))
      return res.status(400).json({ error: 'Payment could not be verified.' });
    const order = await markPaid(oid, pid);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ ok: true, orderId: order._id, orderNumber: order.orderNumber || String(order._id).slice(-8) });
  } catch (e) { next(e); }
});

// ---- Admin API (send header: Authorization: Bearer <ADMIN_TOKEN>) ----
const admin = (req, res, next) => {
  if (!ADMIN_TOKEN) return res.status(501).json({ error: 'Admin API is off. Set ADMIN_TOKEN.' });
  const t = (req.get('authorization') || '').replace(/^Bearer /, '');
  return safeEqual(t, ADMIN_TOKEN) ? next() : res.status(401).json({ error: 'Unauthorized' });
};
const FIELDS = ['name', 'price', 'color', 'image', 'category', 'description', 'sizes', 'stock'];
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const bad = (e, res, next) => (e.name === 'ValidationError' || e.name === 'CastError'
  ? res.status(400).json({ error: e.message }) : next(e));

app.post('/api/admin/products', admin, async (req, res, next) => {
  try { res.status(201).json(await Product.create(pick(req.body || {}))); } catch (e) { bad(e, res, next); }
});
app.put('/api/admin/products/:id', admin, async (req, res, next) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, { $set: pick(req.body || {}) }, { new: true, runValidators: true });
    p ? res.json(p) : res.status(404).json({ error: 'Not found' });
  } catch (e) { bad(e, res, next); }
});
app.delete('/api/admin/products/:id', admin, async (req, res, next) => {
  try { (await Product.findByIdAndDelete(req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); }
  catch (e) { bad(e, res, next); }
});
app.get('/api/admin/orders', admin, async (_req, res, next) => {
  try { res.json(await Order.find().sort({ createdAt: -1 }).limit(100).lean()); } catch (e) { next(e); }
});

app.put('/api/admin/orders/:id/status', admin, async (req, res, next) => {
  try {
    const { status, tracking = {}, note } = req.body || {};
    const $set = {}, upd = { $set };
    if (status !== undefined) {
      if (!['paid', 'shipped', 'delivered', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
      $set.status = status;
      upd.$push = { history: { status, note: str(note, 200) } };
    }
    for (const k of ['courier', 'trackingId', 'url']) if (typeof tracking[k] === 'string') $set[`tracking.${k}`] = str(tracking[k], 300);
    if ($set['tracking.url'] && !/^https?:\/\//i.test($set['tracking.url'])) return res.status(400).json({ error: 'Tracking url must start with http:// or https://' });
    if (tracking.eta) {
      const d = new Date(tracking.eta);
      if (isNaN(d)) return res.status(400).json({ error: 'Invalid eta date.' });
      $set['tracking.eta'] = d;
    }
    if (!Object.keys($set).length) return res.status(400).json({ error: 'Nothing to update.' });
    const o = await Order.findOneAndUpdate({ _id: req.params.id, status: { $ne: 'created' } }, upd, { new: true });
    o ? res.json(o) : res.status(404).json({ error: 'Not found' });
  } catch (e) { bad(e, res, next); }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await mongoose.connect(MONGO_URI);
if (AUTO_SEED !== 'false' && (await Product.countDocuments()) === 0) {
  await Product.insertMany(seedData); // first boot: load the demo catalogue
  console.log('Seeded demo products');
}
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
