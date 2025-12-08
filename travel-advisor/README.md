# TravelAI - Lava Monetize Example App

A demo AI travel advisor app showcasing how to integrate **Lava Monetize** for usage-based billing.

## What This Demo Shows

- **Lava Checkout** - Embeddable payment flow for user onboarding
- **Lava Forward API** - Proxy AI requests through Lava for automatic billing
- **Two Pricing Models** - Pay-as-you-go and subscription plans

## Prerequisites

1. A **Lava Merchant Account** - [Sign up here](https://dashboard.lavapayments.com)
2. **Node.js** 18+ installed
3. **Two products** created in your Lava dashboard:
   - A pay-as-you-go product
   - A subscription product

## Quick Start

### 1. Get Your Credentials

From [dashboard.lavapayments.com](https://dashboard.lavapayments.com):

| Credential | Where to Find | Example |
|------------|---------------|---------|
| **Secret Key** | Settings → API Keys | `sk_test_abc123...` |
| **Product Secret (Pay-go)** | Products → Your Product → Settings | `ps_test_xyz789...` |
| **Product Secret (Pro)** | Products → Your Product → Settings | `ps_test_def456...` |

### 2. Set Up Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and add your credentials:

```bash
LAVA_SECRET_KEY=sk_test_your_secret_key_here
PRODUCT_SECRET=ps_test_your_product_secret_here
```

Start the backend:

```bash
npm run dev
```

### 3. Set Up Frontend

```bash
cd frontend
npm install
```

Edit `src/App.tsx` and update the `CONFIG` object with your product secrets:

```typescript
const CONFIG = {
  products: {
    paygo: {
      secret: 'ps_test_your_paygo_product_secret_here',  // ← Update this
      // ...
    },
    pro: {
      secret: 'ps_test_your_pro_product_secret_here',    // ← Update this
      // ...
    },
  },
  // ...
};
```

Start the frontend:

```bash
npm run dev
```

### 4. Test the App

1. Open http://localhost:5173
2. Click "Get Started"
3. Choose a plan
4. Complete checkout with test card: `4242 4242 4242 4242`
5. Chat with the AI travel advisor!

## Project Structure

```
travel-advisor/
├── backend/
│   ├── .env.example      # Environment template
│   ├── package.json
│   └── server.js         # Express API server
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main React app (update CONFIG here)
│   │   ├── index.css     # Styles
│   │   └── main.tsx      # Entry point
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │    Backend      │     │   Lava API      │
│   (React/Vite)  │     │   (Express)     │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. Select plan       │                       │
         │──────────────────────>│                       │
         │                       │  2. Create session    │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │<──────────────────────│
         │  3. Session token     │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  4. Open checkout modal (Lava Checkout)       │
         │───────────────────────────────────────────────>
         │                       │                       │
         │  5. User completes payment                    │
         │<───────────────────────────────────────────────
         │                       │                       │
         │  6. Get connection    │                       │
         │──────────────────────>│  7. Retrieve          │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │  8. Forward token     │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  9. Chat message      │                       │
         │──────────────────────>│ 10. Forward to AI     │
         │                       │──────────────────────>│
         │                       │     (Lava bills user) │
         │                       │<──────────────────────│
         │  11. AI response      │                       │
         │<──────────────────────│                       │
```

## Key Integration Points

### Backend: Creating Checkout Sessions

```javascript
// server.js
const session = await lava.checkoutSessions.create({
  checkout_mode: 'onboarding',
  origin_url: 'http://localhost:5173',
  reference_id: `order-${Date.now()}`,
});
```

### Frontend: Using Lava Checkout

```typescript
// App.tsx
import { useLavaCheckout } from '@lavapayments/checkout';

const { open } = useLavaCheckout({
  onSuccess: (data) => {
    // data.connectionId - use to get forward token
  },
  onError: (error) => { /* handle error */ },
  onCancel: () => { /* handle cancel */ },
});

// Trigger checkout
open(sessionSecret);
```

### Backend: Forwarding AI Requests

```javascript
// server.js
const forwardToken = lava.generateForwardToken({
  connection_secret: connection.connection_secret,
  product_secret: process.env.PRODUCT_SECRET,
});

// Forward to OpenAI via Lava
const response = await fetch(
  'https://api.lavapayments.com/v1/forward/openai?u=https://api.openai.com/v1/chat/completions',
  {
    headers: {
      Authorization: `Bearer ${forwardToken}`,
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages }),
  }
);
```

## Test Cards

| Card Number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Declined |

Use any future expiry date and any 3-digit CVC.

## Troubleshooting

### "LAVA_SECRET_KEY is not set"

Make sure you created `.env` from `.env.example` and added your secret key.

### "Failed to create checkout session"

- Check that your secret key is valid
- Verify you're using the correct environment (test vs live)

### Checkout modal doesn't open

- Make sure the backend is running on port 3001
- Check browser console for errors
- Verify the session token is being returned

## Learn More

- [Lava Documentation](https://docs.lavapayments.com)
- [Lava Dashboard](https://dashboard.lavapayments.com)
- [@lavapayments/checkout](https://www.npmjs.com/package/@lavapayments/checkout)
- [@lavapayments/nodejs](https://www.npmjs.com/package/@lavapayments/nodejs)
