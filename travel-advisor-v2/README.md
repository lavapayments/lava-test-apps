# Travel Advisor v2

Second version of the Travel Advisor demo app. This is kept separate from the
existing `travel-advisor` app so both implementations can be tested side-by-side.

## Structure

- `frontend/` static React+Babel app (`index-dev.html`, `index-prod.html`)
- `backend/` Node/Express API and checkout integration

## Quick Start

1. Start backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

2. Start frontend static server:

```bash
cd ../frontend
python3 -m http.server 5050
```

3. Open `http://localhost:5050/index-dev.html`
