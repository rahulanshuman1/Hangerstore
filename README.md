# Hangar – clothing store (React + Express + MongoDB + Razorpay)

## 1. MongoDB Atlas
Create a free cluster, add a database user, allow 0.0.0.0/0 under Network Access (Render uses dynamic IPs), copy the connection string.

## 2. Backend on Render
1. Push this repo to GitHub.
2. Render > New > Blueprint (uses `backend/render.yaml`) or New Web Service with root dir `backend`, build `npm install`, start `npm start`.
3. Set env vars from `backend/.env.example`. Use Razorpay *test* keys first.
4. Seed products once: Render Shell > `npm run seed` (or locally with MONGO_URI set).
5. Razorpay Dashboard > Webhooks: URL `https://<your-api>.onrender.com/api/webhook`, events `payment.captured` and `order.paid`, secret = RAZORPAY_WEBHOOK_SECRET.

## 3. Frontend on Vercel
1. Vercel > New Project > import repo, Root Directory `frontend` (framework: Vite).
2. Env var `VITE_API_URL` = your Render URL.
3. Deploy, then put the Vercel URL into `CLIENT_ORIGIN` on Render and redeploy the API.

## Local
```
cd backend && cp .env.example .env && npm i && npm run seed && npm run dev
cd frontend && cp .env.example .env && npm i && npm run dev
```
Notes: Render free tier sleeps after inactivity (first request is slow); use a paid instance for production. Swap the SVG garments for real photos by setting `image` on products.
