# Travel Advisor v2 Backend

Backend API for the Travel Advisor v2 demo. It serves the Lava checkout script,
handles simple demo auth, creates checkout sessions, and proxies chat requests.

## Run

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

- `npm run dev` starts DEV backend on `http://localhost:3002`
- `npm run prod` starts PROD backend on `http://localhost:3001`

## Environment Variables

Use `.env.example` as the template. Required values:

- `TRAVEL_ADVISOR_LAVA_SECRET_KEY`
- `TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_DEV`
- `TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV`
- `TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV`

Optional:

- `TRAVEL_ADVISOR_ORIGIN_URL_DEV` (default `http://localhost:5050`)
- `TRAVEL_ADVISOR_LAVA_API_BASE_URL_DEV` (default `https://api.lavapayments.com/v1`)

## Demo Auth Users

- Stored in `auth-users-dev.json` and `auth-users-prod.json`
- Default password for demo users is `travel123`
