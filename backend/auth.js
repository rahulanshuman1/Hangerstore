import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { User, Order, Product } from './models.js';

const str = (v, m = 200) => (typeof v === 'string' ? v.trim().slice(0, m) : '');
const sign = (u) => jwt.sign({ sub: String(u._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
const view = (u) => ({
  id: u._id, name: u.name, email: u.email, phone: u.phone || '',
  addresses: u.addresses, wishlist: u.wishlist.map(String),
});
const idFrom = (req) => {
  const t = (req.get('authorization') || '').replace(/^Bearer /, '');
  try { return t ? jwt.verify(t, process.env.JWT_SECRET).sub : null; } catch { return null; }
};
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

export const optionalAuth = (req, _res, next) => { req.userId = idFrom(req); next(); };
const requireAuth = (req, res, next) => {
  req.userId = idFrom(req);
  return req.userId ? next() : res.status(401).json({ error: 'Please sign in.' });
};

export const authRouter = express.Router();
authRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

authRouter.post('/signup', wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter your name and a valid email.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Use a password of 8 to 72 characters.' });
  if (await User.exists({ email })) return res.status(409).json({ error: 'That email already has an account. Sign in instead.' });
  const u = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(u), user: view(u) });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const email = str(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const u = await User.findOne({ email }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(password, u.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(u), user: view(u) });
}));

export const meRouter = express.Router();
meRouter.use(requireAuth);

const load = async (req, res) => {
  const u = await User.findById(req.userId);
  if (!u) res.status(401).json({ error: 'Please sign in.' });
  return u;
};
const cleanAddr = (b = {}) => {
  const a = {
    label: str(b.label, 30) || 'Home', name: str(b.name, 80), phone: str(b.phone, 15),
    address: str(b.address, 300), city: str(b.city, 80), pincode: str(b.pincode, 10),
  };
  return a.name && /^\d{10}$/.test(a.phone) && a.address && a.city && /^\d{6}$/.test(a.pincode) ? a : null;
};
const BAD_ADDR = { error: 'Check the address: name, 10-digit phone, address, city and 6-digit pincode.' };
const setDefault = (u, id) => u.addresses.forEach((x) => { x.isDefault = String(x._id) === String(id); });

meRouter.get('/', wrap(async (req, res) => { const u = await load(req, res); if (u) res.json(view(u)); }));

meRouter.put('/', wrap(async (req, res) => {
  const u = await load(req, res); if (!u) return;
  const name = str(req.body?.name, 80), phone = str(req.body?.phone, 15);
  if (!name || (phone && !/^\d{10}$/.test(phone))) return res.status(400).json({ error: 'Enter a name and a 10-digit phone number.' });
  u.name = name; u.phone = phone; await u.save();
  res.json(view(u));
}));

meRouter.put('/password', wrap(async (req, res) => {
  const u = await User.findById(req.userId).select('+passwordHash');
  if (!u) return res.status(401).json({ error: 'Please sign in.' });
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 8 || next.length > 72) return res.status(400).json({ error: 'Use a new password of 8 to 72 characters.' });
  if (typeof current !== 'string' || !(await bcrypt.compare(current, u.passwordHash))) return res.status(400).json({ error: 'Your current password is wrong.' });
  u.passwordHash = await bcrypt.hash(next, 10); await u.save();
  res.json({ ok: true });
}));

meRouter.post('/addresses', wrap(async (req, res) => {
  const u = await load(req, res); if (!u) return;
  const a = cleanAddr(req.body); if (!a) return res.status(400).json(BAD_ADDR);
  if (u.addresses.length >= 10) return res.status(400).json({ error: 'You can save up to 10 addresses.' });
  u.addresses.push(a);
  if (req.body.isDefault || u.addresses.length === 1) setDefault(u, u.addresses[u.addresses.length - 1]._id);
  await u.save(); res.status(201).json(view(u));
}));

meRouter.put('/addresses/:aid', wrap(async (req, res) => {
  const u = await load(req, res); if (!u) return;
  const x = u.addresses.id(req.params.aid); if (!x) return res.status(404).json({ error: 'Address not found.' });
  const a = cleanAddr(req.body); if (!a) return res.status(400).json(BAD_ADDR);
  Object.assign(x, a);
  if (req.body.isDefault) setDefault(u, x._id);
  await u.save(); res.json(view(u));
}));

meRouter.delete('/addresses/:aid', wrap(async (req, res) => {
  const u = await load(req, res); if (!u) return;
  const x = u.addresses.id(req.params.aid); if (!x) return res.status(404).json({ error: 'Address not found.' });
  const wasDefault = x.isDefault;
  u.addresses.pull({ _id: x._id });
  if (wasDefault && u.addresses.length) u.addresses[0].isDefault = true;
  await u.save(); res.json(view(u));
}));

meRouter.get('/orders', wrap(async (req, res) => {
  res.json(await Order.find({ user: req.userId, status: { $ne: 'created' } }).sort({ createdAt: -1 }).limit(50).lean());
}));

meRouter.post('/wishlist/:pid', wrap(async (req, res) => {
  const { pid } = req.params;
  if (!mongoose.isValidObjectId(pid) || !(await Product.exists({ _id: pid }))) return res.status(404).json({ error: 'Product not found.' });
  const u = await load(req, res); if (!u) return;
  const i = u.wishlist.findIndex((x) => String(x) === pid);
  i >= 0 ? u.wishlist.splice(i, 1) : u.wishlist.push(pid);
  await u.save(); res.json({ wishlist: u.wishlist.map(String) });
}));
