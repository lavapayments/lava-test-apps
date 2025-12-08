# Math Practice App

An AI-powered math practice application for elementary students. Generates random addition problems and uses an LLM via Lava to provide helpful explanations when students get answers wrong.

## What This Demo Shows

- **Lava Forward API** - Proxy AI requests through Lava for usage-based billing
- **Simple vanilla JS frontend** - No framework needed
- **Educational AI use case** - LLM provides tutoring feedback

## Prerequisites

1. A **Lava Merchant Account** - [Sign up here](https://dashboard.lavapayments.com)
2. **Node.js** 18+ installed
3. A **Forward Token** from Lava (generated via SDK or after checkout)

## Quick Start

### 1. Get Your Forward Token

You need a Lava forward token to authorize API requests. You can get one by:

**Option A: From an existing connection**
```javascript
const forwardToken = lava.generateForwardToken({
  connection_secret: 'cons_...',
  product_secret: 'ps_...',
});
```

**Option B: After a user completes checkout** (see travel-advisor example)

### 2. Set Up the Backend

```bash
cd math-class
npm install
cp .env.example .env
```

Edit `.env` and add your forward token:

```bash
LAVA_FORWARD_TOKEN=your_forward_token_here
```

Start the server:

```bash
npm start
```

### 3. Open the Frontend

Simply open `index.html` in your browser, or serve it with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

Then open http://localhost:8000

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │    Backend      │     │   Lava API      │
│   (index.html)  │     │  (server.cjs)   │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. Student submits   │                       │
         │     wrong answer      │                       │
         │──────────────────────>│                       │
         │                       │  2. Forward to Lava   │
         │                       │──────────────────────>│
         │                       │     (with token)      │
         │                       │                       │
         │                       │  3. Lava proxies to   │
         │                       │     OpenAI, bills     │
         │                       │     the wallet        │
         │                       │<──────────────────────│
         │  4. LLM explanation   │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  5. Show feedback     │                       │
         │     to student        │                       │
```

1. App generates random addition problem (0-100)
2. Student enters their answer
3. If correct: Shows success message (no API call)
4. If incorrect: Calls LLM via Lava for explanation
5. LLM explains the mistake in an encouraging way
6. Student clicks "Next Problem" to continue

## Project Structure

```
math-class/
├── .env.example     # Environment template
├── .gitignore
├── package.json
├── server.cjs       # Node.js backend (proxies to Lava)
├── index.html       # Main HTML
├── app.js           # Frontend JavaScript
├── style.css        # Styles
└── README.md
```

## Customization

### Change the AI Model

Edit `app.js`:

```javascript
const MODEL = 'gpt-4o-mini';  // or 'gpt-4o', 'claude-3-5-sonnet-20241022', etc.
```

### Change the Difficulty

Edit `app.js` to adjust the number range:

```javascript
currentProblem.num1 = Math.floor(Math.random() * 101); // 0-100
currentProblem.num2 = Math.floor(Math.random() * 101); // 0-100
```

For easier problems (0-10):
```javascript
currentProblem.num1 = Math.floor(Math.random() * 11); // 0-10
```

## Test Cards

If testing with Lava Checkout first (see travel-advisor example):

| Card Number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Successful payment |

## Learn More

- [Lava Documentation](https://docs.lavapayments.com)
- [Lava Dashboard](https://dashboard.lavapayments.com)
