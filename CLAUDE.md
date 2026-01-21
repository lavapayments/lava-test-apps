# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains example applications demonstrating Lava Monetize integration for usage-based billing of AI APIs. Each app shows a different integration pattern.

## Apps

### travel-advisor
Full-stack app (React + Express) demonstrating the complete Lava checkout flow:
- **Frontend**: React 19 + TypeScript + Vite at `travel-advisor/frontend/`
- **Backend**: Express server at `travel-advisor/backend/`
- Uses `@lavapayments/checkout` for embedded payment modal
- Uses `@lavapayments/nodejs` SDK for server-side operations

### math-class
Simple vanilla JS app demonstrating the Lava Forward API:
- Static HTML/JS frontend with Node.js backend
- Uses pre-generated forward tokens (no checkout flow)
- Backend at `math-class/server.cjs`

## Development Commands

### travel-advisor

```bash
# Backend (runs on port 3001)
cd travel-advisor/backend
npm install
cp .env.example .env  # Add LAVA_SECRET_KEY and PRODUCT_SECRET
npm run dev           # Uses nodemon for hot reload

# Frontend (runs on port 5173)
cd travel-advisor/frontend
npm install
npm run dev
```

### math-class

```bash
cd math-class
npm install
cp .env.example .env  # Add LAVA_FORWARD_TOKEN
npm start             # Runs on port 3001
# Open index.html separately (e.g., python -m http.server 8000)
```

## Architecture

### Lava Integration Flow

1. **Checkout Session**: Backend creates session via `lava.checkoutSessions.create()`
2. **Frontend Checkout**: Uses `useLavaCheckout` hook to open payment modal
3. **Connection Retrieval**: After checkout, backend retrieves connection via `lava.connections.retrieve()`
4. **Forward Token Generation**: Backend generates token via `lava.generateForwardToken()`
5. **AI Request Forwarding**: Requests go through Lava's forward API (`api.lavapayments.com/v1/forward/`) for automatic billing

### Key API Endpoints (travel-advisor backend)

- `POST /api/checkout/create-session` - Create Lava checkout session
- `GET /api/checkout/connection/:connectionId` - Get connection details and forward token
- `POST /api/chat` - Proxy AI requests through Lava Forward API
- `POST /api/webhooks/lava` - Handle Lava webhook events

### Forward API Pattern

Both apps proxy AI requests through Lava for billing:
```
Frontend -> Backend -> Lava Forward API -> OpenAI
```

The forward URL format: `https://api.lavapayments.com/v1/forward/openai?u=https://api.openai.com/v1/chat/completions`

## Environment Variables

### travel-advisor/backend/.env
- `LAVA_SECRET_KEY` - Lava API secret key
- `PRODUCT_SECRET` - Product secret for forward token generation
- `LAVA_WEBHOOK_SECRET` (optional) - For webhook signature verification

### math-class/.env
- `LAVA_FORWARD_TOKEN` - Pre-generated forward token

## Test Cards

- `4242 4242 4242 4242` - Successful payment
- `4000 0000 0000 0002` - Declined
