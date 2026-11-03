import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from './models.js';

const base = [
  ['Midnight Hoodie', 2499, '#1f2a44'], ['Fog Hoodie', 2299, '#b4bcc6'],
  ['Charcoal Zip', 2799, '#2b2b2e'], ['Oat Pullover', 2399, '#e3d6bb'],
  ['Forest Hoodie', 2599, '#1f5a3a'], ['Graphite Tee Hoodie', 2199, '#4a4a4d'],
  ['Slate Pullover', 2499, '#6c7a89'], ['Sand Hoodie', 2299, '#d9c7a0'],
];
await mongoose.connect(process.env.MONGO_URI);
await Product.deleteMany({});
await Product.insertMany(base.map(([name, price, color]) => ({
  name, price, color,
  description: 'Heavyweight cotton fleece. Oversized cut. Made to last.',
})));
console.log('Seeded', base.length, 'products');
await mongoose.disconnect();
