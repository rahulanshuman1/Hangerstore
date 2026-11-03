import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Razorpay from 'razorpay';
import { Product, Order } from './models.js';

const {
  MONGO_URI, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
  CLIENT_ORIGIN = '', PORT = 5000,
} = process.env;

for (const [k, v] of Object.entries({ MONGO_URI, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET })) {
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
    { status: 'paid', razorpayPaymentId: paymentId },
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

app.post('/api/orders', rateLimit({ windowMs: 60 * 1000, limit: 10 }), async (req, res, next) => {
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
    const order = await Order.create({ items: lines, customer: c, amount, razorpayOrderId: rzpOrder.id });
    res.status(201).json({
      orderId: order._id, razorpayOrderId: rzpOrder.id, amount, currency: 'INR', key: RAZORPAY_KEY_ID,
    });
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
    res.json({ ok: true, orderId: order._id });
  } catch (e) { next(e); }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await mongoose.connect(MONGO_URI);
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
