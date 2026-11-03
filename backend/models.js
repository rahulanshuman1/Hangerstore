import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 1 }, // INR (rupees)
  color: { type: String, default: '#1f2a44' },     // used by the SVG garment
  image: { type: String, default: '' },            // optional real photo URL
  category: { type: String, default: 'Hoodie' },
  description: { type: String, default: '' },
  sizes: { type: [String], default: ['S', 'M', 'L', 'XL'] },
  stock: { type: Number, default: 50, min: 0 },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String, price: Number, size: String, qty: Number,
  }],
  customer: { name: String, email: String, phone: String, address: String, city: String, pincode: String },
  amount: { type: Number, required: true }, // paise
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: String,
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);
export const Order = mongoose.model('Order', orderSchema);
