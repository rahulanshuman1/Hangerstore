import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from './models.js';
import { seedData } from './seedData.js';

await mongoose.connect(process.env.MONGO_URI);
await Product.deleteMany({});
await Product.insertMany(seedData);
console.log('Seeded', seedData.length, 'products');
await mongoose.disconnect();
