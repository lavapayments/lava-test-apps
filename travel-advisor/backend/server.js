require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Lava } = require('@lavapayments/nodejs');

const app = express();
const PORT = process.env.PORT || 3001;

// ===========================================
// CONFIGURATION VALIDATION
// ===========================================
if (!process.env.LAVA_SECRET_KEY) {
  console.error('❌ LAVA_SECRET_KEY is not set in .env file');
  console.error('   Get your secret key from: https://dashboard.lavapayments.com/settings/api-keys');
  process.exit(1);
}

if (!process.env.PRODUCT_SECRET) {
  console.error('❌ PRODUCT_SECRET is not set in .env file');
  console.error('   Get your product secret from your product settings in the Lava dashboard');
  process.exit(1);
}

// ===========================================
// INITIALIZE LAVA SDK
// TODO: update baseUrl depending on dev or prod environment
// ===========================================
const lava = new Lava(process.env.LAVA_SECRET_KEY, {
  apiVersion: '2025-04-28.v1',
  baseUrl: 'http://localhost:3000/v1/'
});

// ===========================================
// MIDDLEWARE
// ===========================================
app.use(cors());
app.use(express.json());

// ===========================================
// API ROUTES
// ===========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create checkout session
app.post('/api/checkout/create-session', async (req, res) => {
  try {
    const { productSecret, plan, originUrl } = req.body;

    if (!productSecret) {
      return res.status(400).json({
        error: 'Product secret is required',
      });
    }

    // Create checkout session
    const sessionParams = {
      checkout_mode: 'onboarding',
      origin_url: originUrl || 'http://localhost:5173',
      reference_id: `travel-advisor-${plan}-${Date.now()}`,
    };

    // TODO: This isn't actually implemented yet and does not work
    if (plan === 'pro') {
      sessionParams.subscription_config_id = productSecret;
    }

    console.log('Creating checkout session with params:', sessionParams);
    const session = await lava.checkoutSessions.create(sessionParams);

    console.log(`✅ Checkout session created for ${plan} plan`);

    res.json({
      sessionSecret: session.checkout_session_token,
      sessionId: session.checkout_session_id,
    });
  } catch (error) {
    console.error('❌ Checkout session creation failed:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: error.message,
    });
  }
});

// Get connection details after checkout
app.get('/api/checkout/connection/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Retrieve connection details from Lava API
    const connection = await lava.connections.retrieve(connectionId);

    // Generate forward token using SDK
    const forwardToken = lava.generateForwardToken({
      connection_secret: connection.connection_secret,
      product_secret: process.env.PRODUCT_SECRET,
    });

    console.log('✅ Connection retrieved and forward token generated');

    res.json({
      walletId: connectionId,
      connectionSecret: connection.connection_secret,
      forwardToken,
    });
  } catch (error) {
    console.error('❌ Failed to retrieve connection:', error);
    res.status(500).json({
      error: 'Failed to retrieve connection',
      message: error.message,
    });
  }
});

// Chat proxy endpoint (avoids CORS issues with Lava API)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, forwardToken } = req.body;

    if (!forwardToken) {
      return res.status(400).json({
        error: 'Forward token is required',
      });
    }

    // Forward request to Lava Build API
    const response = await fetch(
      // TODO: update url depending on dev or prod environment
      // Use api.lavapayments.com/v1 for prod and http://localhost:[port]/v1 for dev
      'http://localhost:3000/v1/forward/openai?u=https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forwardToken}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 500,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ AI API error:', error);
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    console.log('✅ AI response received');
    res.json(data);
  } catch (error) {
    console.error('❌ Chat proxy failed:', error);
    res.status(500).json({
      error: 'Failed to process chat request',
      message: error.message,
    });
  }
});

// Webhook handler (optional)
app.post('/api/webhooks/lava', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature (if webhook secret is configured)
    if (process.env.LAVA_WEBHOOK_SECRET) {
      const isValid = lava.webhooks.verify(payload, signature, {
        secret: process.env.LAVA_WEBHOOK_SECRET,
      });

      if (!isValid) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;
    console.log('📨 Webhook received:', event.type);

    // Handle different event types
    switch (event.type) {
      case 'checkout.completed':
        console.log('✅ Checkout completed:', event.data);
        break;
      case 'connection.wallet.balance.updated':
        console.log('💰 Balance updated:', event.data.balance);
        break;
      case 'connection.deleted':
        console.log('🗑️  Connection deleted:', event.data.connectionId);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// START SERVER
// ===========================================
app.listen(PORT, () => {
  console.log('\n🚀 TravelAI Backend Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server running at: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 Lava Secret Key: ${process.env.LAVA_SECRET_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`📦 Product Secret: ${process.env.PRODUCT_SECRET ? '✓ Configured' : '✗ Missing'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
