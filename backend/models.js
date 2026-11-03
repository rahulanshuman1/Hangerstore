import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 1 }, // INR (rupees)
  color: { type: String, default: '#1f2a44' },
  image: { type: String, default: '' },
  category: { type: String, default: 'Hoodie' },
  description: { type: String, default: '' },
  sizes: { type: [String], default: ['S', 'M', 'L', 'XL'] },
  stock: { type: Number, default: 50, min: 0 },
}, { timestamps: true });

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  name: String, phone: String, address: String, city: String, pincode: String,
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '' },
  addresses: [addressSchema],
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String, price: Number, size: String, qty: Number,
  }],
  customer: { name: String, email: String, phone: String, address: String, city: String, pincode: String },
  amount: { type: Number, required: true }, // paise
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'paid', 'shipped', 'delivered', 'cancelled', 'failed'], default: 'created', index: true },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: String,
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);
export const User = mongoose.model('User', userSchema);
export const Order = mongoose.model('Order', orderSchema);
