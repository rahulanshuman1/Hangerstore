const d = 'Heavyweight cotton. Oversized cut. Made to last.';
const p = (name, price, color, category, slug) => ({
  name, price, color, category, image: `/products/${slug}.svg`, description: d, stock: 50,
});

export const seedData = [
  p('Midnight Hoodie', 2499, '#1f2a44', 'Hoodie', 'midnight-hoodie'),
  p('Fog Hoodie', 2299, '#b4bcc6', 'Hoodie', 'fog-hoodie'),
  p('Forest Hoodie', 2599, '#1f5a3a', 'Hoodie', 'forest-hoodie'),
  p('Charcoal Zip Hoodie', 2799, '#2b2b2e', 'Zip Hoodie', 'charcoal-zip-hoodie'),
  p('Oat Zip Hoodie', 2899, '#e3d6bb', 'Zip Hoodie', 'oat-zip-hoodie'),
  p('Oversized Tee, White', 1299, '#f1efe9', 'T-Shirt', 'white-tee'),
  p('Oversized Tee, Black', 1299, '#1d1d20', 'T-Shirt', 'black-tee'),
  p('Sage Tee', 1399, '#9bb59a', 'T-Shirt', 'sage-tee'),
  p('Slate Sweatshirt', 1999, '#6c7a89', 'Sweatshirt', 'slate-sweatshirt'),
  p('Rust Sweatshirt', 2099, '#a4502f', 'Sweatshirt', 'rust-sweatshirt'),
];
