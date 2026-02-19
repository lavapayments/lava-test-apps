import cors from 'cors';
import { createHash, randomBytes } from 'crypto';
import express from 'express';
import { readFile, writeFile } from 'fs/promises';

const DEFAULT_AUTH_TABLE = {
  users: [],
};

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hashPassword(password) {
  return createHash('sha256').update(String(password)).digest('hex');
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

async function loadAuthTable(authTablePath, logPrefix) {
  try {
    const raw = await readFile(authTablePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users)) {
      throw new Error('Invalid auth table format');
    }
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(logPrefix, 'Failed to read auth table, resetting:', error);
    }
    await writeFile(authTablePath, JSON.stringify(DEFAULT_AUTH_TABLE, null, 2));
    return { users: [] };
  }
}

async function saveAuthTable(authTablePath, authTable) {
  await writeFile(authTablePath, `${JSON.stringify(authTable, null, 2)}\n`);
}

export async function createTravelAdvisorServer(config) {
  const {
    port,
    logPrefix,
    checkoutScriptPath,
    lavaSecretKey,
    lavaProductSecret,
    lavaApiBaseUrl = 'https://api.lavapayments.com/v1',
    plans,
    originUrl,
    authTablePath,
  } = config;
  const normalizedLavaApiBaseUrl = String(lavaApiBaseUrl).replace(/\/+$/, '');
  const lavaApiUrl = (path) => `${normalizedLavaApiBaseUrl}${path}`;

  const app = express();
  app.use(cors());
  app.use(express.json());

  let authTable = await loadAuthTable(authTablePath, logPrefix);
  const authSessions = new Map();
  const defaultPlanId = plans.starter10 ? 'starter10' : Object.keys(plans)[0] || null;
  const planBySubscriptionConfigId = new Map(
    Object.entries(plans)
      .filter(([, plan]) => Boolean(plan?.subscriptionConfigId))
      .map(([planId, plan]) => [plan.subscriptionConfigId, planId])
  );

  function isValidConnectionSecret(value) {
    const normalized = String(value || '').trim();
    return Boolean(
      normalized && normalized !== 'undefined' && normalized !== 'null'
    );
  }

  async function fetchConnectionById(connectionId) {
    const normalizedConnectionId = String(connectionId || '').trim();
    if (!normalizedConnectionId) {
      const error = new Error('Missing connectionId');
      error.status = 400;
      throw error;
    }

    const connectionUrl = lavaApiUrl(
      `/connections/${encodeURIComponent(normalizedConnectionId)}`
    );
    const response = await fetch(connectionUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${lavaSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'Failed to resolve connection');
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function fetchConnectionSubscriptionById(connectionId) {
    const normalizedConnectionId = String(connectionId || '').trim();
    if (!normalizedConnectionId) {
      const error = new Error('Missing connectionId');
      error.status = 400;
      throw error;
    }

    const subscriptionUrl = lavaApiUrl(
      `/connections/${encodeURIComponent(normalizedConnectionId)}/subscription`
    );
    const response = await fetch(subscriptionUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${lavaSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'Failed to fetch connection subscription');
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function fetchSubscriptionConfigById(subscriptionConfigId) {
    const normalizedSubscriptionConfigId = String(subscriptionConfigId || '').trim();
    if (!normalizedSubscriptionConfigId) {
      const error = new Error('Missing subscriptionConfigId');
      error.status = 400;
      throw error;
    }

    const subscriptionConfigUrl = lavaApiUrl(
      `/subscription_configs/${encodeURIComponent(normalizedSubscriptionConfigId)}`
    );
    const response = await fetch(subscriptionConfigUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${lavaSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'Failed to fetch subscription config');
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  function toConnectionCandidate(connection) {
    const connectionId = String(
      connection?.connection_id || connection?.connectionId || ''
    ).trim();
    const connectionSecret = String(
      connection?.connection_secret || connection?.connectionSecret || ''
    ).trim();
    const customerEmail = normalizeEmail(
      connection?.customer?.email || connection?.customerEmail
    );
    const subscriptionConfigId = String(
      connection?.subscription?.subscription_config_id ||
        connection?.subscription?.subscriptionConfigId ||
        ''
    ).trim();
    const planId = planBySubscriptionConfigId.get(subscriptionConfigId);
    const subscriptionStatus = String(
      connection?.subscription?.status || ''
    ).trim();
    const createdAtRaw =
      connection?.created_at || connection?.createdAt || new Date().toISOString();
    const createdAtMs = Date.parse(createdAtRaw) || 0;

    if (!connectionId) {
      return null;
    }
    if (!isValidConnectionSecret(connectionSecret)) {
      return null;
    }
    return {
      connectionId,
      connectionSecret,
      customerEmail,
      planId,
      walletId: connection?.wallet_id || connection?.walletId || null,
      createdAtMs,
      active: subscriptionStatus === 'active',
    };
  }

  async function listConnectionsPage(cursor) {
    const query = new URLSearchParams();
    query.set('limit', '100');
    if (cursor) {
      query.set('cursor', cursor);
    }

    const response = await fetch(
      lavaApiUrl(`/connections?${query.toString()}`),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${lavaSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'Failed to list connections');
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    return {
      data: Array.isArray(payload?.data) ? payload.data : [],
      hasMore: Boolean(payload?.has_more),
      nextCursor: payload?.next_cursor || null,
    };
  }

  function createForwardToken(connectionSecret) {
    const normalizedConnectionSecret = String(connectionSecret || '').trim();
    if (
      !normalizedConnectionSecret ||
      normalizedConnectionSecret === 'undefined' ||
      normalizedConnectionSecret === 'null'
    ) {
      throw new Error('Missing valid connection secret');
    }

    const tokenData = {
      secret_key: lavaSecretKey,
      connection_secret: normalizedConnectionSecret,
      meter_secret: lavaProductSecret,
    };
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }

  function getTokenFromRequest(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim();
  }

  function resolveAuthFromRequest(req) {
    const token = getTokenFromRequest(req);
    if (!token) {
      return null;
    }
    const session = authSessions.get(token);
    if (!session) {
      return null;
    }
    const user = authTable.users.find((entry) => entry.id === session.userId);
    if (!user) {
      authSessions.delete(token);
      return null;
    }
    return {
      token,
      user: toPublicUser(user),
    };
  }

  function requireAuth(req, res, next) {
    const auth = resolveAuthFromRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.auth = auth;
    return next();
  }

  function optionalAuth(req, res, next) {
    req.auth = resolveAuthFromRequest(req);
    return next();
  }

  function createAuthSession(user) {
    const token = randomBytes(24).toString('hex');
    authSessions.set(token, {
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    return token;
  }

  app.get('/checkout.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(checkoutScriptPath);
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, name } = req.body ?? {};
      const normalizedEmail = normalizeEmail(email);
      const normalizedName = String(name || '').trim();

      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return res.status(400).json({ error: 'A valid email is required' });
      }
      if (!password || String(password).length < 6) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 6 characters' });
      }
      if (!normalizedName) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const existing = authTable.users.find(
        (entry) => entry.email === normalizedEmail
      );
      if (existing) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const user = {
        id: `usr_${randomBytes(8).toString('hex')}`,
        email: normalizedEmail,
        name: normalizedName,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      authTable.users.push(user);
      await saveAuthTable(authTablePath, authTable);

      const token = createAuthSession(user);
      console.log(logPrefix, 'Auth signup:', user.email);
      return res.status(201).json({ token, user: toPublicUser(user) });
    } catch (error) {
      console.error(logPrefix, 'Signup failed:', error);
      return res.status(500).json({ error: 'Failed to create account' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = hashPassword(password || '');

    const user = authTable.users.find(
      (entry) =>
        entry.email === normalizedEmail && entry.passwordHash === passwordHash
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createAuthSession(user);
    console.log(logPrefix, 'Auth login:', user.email);
    return res.json({ token, user: toPublicUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.auth.user });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    authSessions.delete(req.auth.token);
    res.json({ ok: true });
  });

  app.post('/api/checkout/create-session', optionalAuth, async (req, res) => {
    try {
      const requestedPlan = String(req.body?.plan || '');
      const requestedConnectionId = String(req.body?.connectionId || '').trim();
      const plan = plans[requestedPlan];

      if (!plan) {
        return res.status(400).json({ error: 'Unknown plan' });
      }
      if (!plan.subscriptionConfigId) {
        return res.status(400).json({
          error: `Plan "${requestedPlan}" is not configured yet. Set its subscription config ID in env.`,
        });
      }
      if (requestedConnectionId && !req.auth) {
        return res.status(401).json({
          error: 'Authentication required for existing connection checkout',
        });
      }

      console.log(
        logPrefix,
        `Creating subscription checkout for ${
          req.auth?.user?.email || 'guest'
        } on ${requestedPlan}${
          requestedConnectionId ? ' (existing connection)' : ' (new customer flow)'
        }`
      );

      const checkoutBody = {
        checkout_mode: 'subscription',
        origin_url: originUrl,
        subscription_config_id: plan.subscriptionConfigId,
      };
      if (requestedConnectionId) {
        checkoutBody.connection_id = requestedConnectionId;
      }

      const response = await fetch(
        lavaApiUrl('/checkout_sessions'),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lavaSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(checkoutBody),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(logPrefix, 'Lava API error:', error);
        return res
          .status(response.status)
          .json({ error: 'Failed to create checkout session', details: error });
      }

      const data = await response.json();
      console.log(logPrefix, 'Checkout session created:', data.checkout_session_id);

      return res.json({
        sessionId: data.checkout_session_id,
        sessionToken: data.checkout_session_token,
        plan: requestedPlan,
      });
    } catch (error) {
      console.error(logPrefix, 'Error creating checkout session:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/checkout/credit-bundles', requireAuth, async (req, res) => {
    try {
      const requestedConnectionId = String(req.query?.connectionId || '').trim();
      const authUser = authTable.users.find((entry) => entry.id === req.auth.user.id);
      const fallbackConnectionId = String(authUser?.billing?.connectionId || '').trim();
      const connectionId = requestedConnectionId || fallbackConnectionId;

      if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
      }

      const subscriptionPayload = await fetchConnectionSubscriptionById(connectionId);
      const subscription = subscriptionPayload?.subscription || {};
      const subscriptionConfigId = String(
        subscription?.subscription_config_id || subscription?.subscriptionConfigId || ''
      ).trim();
      if (!subscriptionConfigId) {
        return res.status(404).json({
          error: 'No subscription configuration found for this connection',
        });
      }

      const subscriptionConfigPayload =
        await fetchSubscriptionConfigById(subscriptionConfigId);
      const subscriptionConfig =
        subscriptionConfigPayload?.subscription_config || subscriptionConfigPayload || {};
      const creditBundlesRaw = Array.isArray(subscriptionConfig?.credit_bundles)
        ? subscriptionConfig.credit_bundles
        : [];

      const creditBundles = creditBundlesRaw
        .map((bundle) => ({
          creditBundleId: String(
            bundle?.credit_bundle_id || bundle?.creditBundleId || ''
          ).trim(),
          name: String(bundle?.name || '').trim(),
          cost: String(bundle?.cost || '').trim(),
          creditAmount: String(
            bundle?.credit_amount || bundle?.creditAmount || ''
          ).trim(),
        }))
        .filter((bundle) => bundle.creditBundleId);

      return res.json({
        connectionId,
        subscriptionConfigId,
        creditBundles,
      });
    } catch (error) {
      if (error.status) {
        console.error(logPrefix, 'Failed to fetch credit bundles:', error.message);
        return res.status(error.status).json({
          error: 'Failed to fetch credit bundles',
          details: error.message,
        });
      }
      console.error(logPrefix, 'Error fetching credit bundles:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post(
    '/api/checkout/create-credit-bundle-session',
    requireAuth,
    async (req, res) => {
      try {
        const requestedConnectionId = String(req.body?.connectionId || '').trim();
        const creditBundleId = String(req.body?.creditBundleId || '').trim();
        const authUser = authTable.users.find((entry) => entry.id === req.auth.user.id);
        const fallbackConnectionId = String(authUser?.billing?.connectionId || '').trim();
        const connectionId = requestedConnectionId || fallbackConnectionId;

        if (!connectionId) {
          return res.status(400).json({ error: 'Missing connectionId' });
        }
        if (!creditBundleId) {
          return res.status(400).json({ error: 'Missing creditBundleId' });
        }

        const checkoutBody = {
          checkout_mode: 'credit_bundle',
          origin_url: originUrl,
          connection_id: connectionId,
          credit_bundle_id: creditBundleId,
        };

        const response = await fetch(lavaApiUrl('/checkout_sessions'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lavaSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(checkoutBody),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(logPrefix, 'Lava API credit bundle checkout error:', error);
          return res.status(response.status).json({
            error: 'Failed to create credit bundle checkout session',
            details: error,
          });
        }

        const data = await response.json();
        return res.json({
          sessionId: data.checkout_session_id,
          sessionToken: data.checkout_session_token,
          connectionId,
          creditBundleId,
        });
      } catch (error) {
        console.error(logPrefix, 'Error creating credit bundle checkout session:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  app.post('/api/checkout/resolve-connection', requireAuth, async (req, res) => {
    try {
      const connectionId = String(req.body?.connectionId || '').trim();
      if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
      }

      const data = await fetchConnectionById(connectionId);
      const resolvedConnectionSecret = String(data?.connection_secret || '').trim();
      if (!resolvedConnectionSecret) {
        return res.status(502).json({
          error: 'Connection resolved without connection_secret',
        });
      }

      return res.json({
        connectionId: data?.connection_id || connectionId,
        connectionSecret: resolvedConnectionSecret,
      });
    } catch (error) {
      if (error.status) {
        console.error(logPrefix, 'Failed to resolve connection:', error.message);
        return res.status(error.status).json({
          error: 'Failed to resolve connection',
          details: error.message,
        });
      }
      console.error(logPrefix, 'Error resolving connection secret:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/billing/session', requireAuth, async (req, res) => {
    try {
      const userEmail = normalizeEmail(req.auth.user.email);
      const authUser = authTable.users.find((entry) => entry.id === req.auth.user.id);
      const persistedBilling = authUser?.billing || null;
      if (
        persistedBilling &&
        plans[persistedBilling.plan] &&
        String(persistedBilling.connectionId || '').trim()
      ) {
        const persistedConnection = await fetchConnectionById(
          persistedBilling.connectionId
        );
        const persistedConnectionSecret = String(
          persistedConnection?.connection_secret || ''
        ).trim();
        if (isValidConnectionSecret(persistedConnectionSecret)) {
          return res.json({
            plan: persistedBilling.plan,
            connectionId:
              persistedConnection?.connection_id || persistedBilling.connectionId,
            connectionSecret: persistedConnectionSecret,
            walletId:
              persistedConnection?.wallet_id || persistedBilling.walletId || null,
          });
        }
      }

      let cursor = null;
      const matchingEmailCandidates = [];
      const fallbackCandidates = [];

      for (let page = 0; page < 5; page += 1) {
        const payload = await listConnectionsPage(cursor);
        for (const connection of payload.data) {
          const candidate = toConnectionCandidate(connection);
          if (!candidate) {
            continue;
          }
          fallbackCandidates.push(candidate);
          if (candidate.customerEmail === userEmail && candidate.planId) {
            matchingEmailCandidates.push(candidate);
          }
        }

        if (!payload.hasMore || !payload.nextCursor) {
          break;
        }
        cursor = payload.nextCursor;
      }

      const candidates =
        matchingEmailCandidates.length > 0
          ? matchingEmailCandidates
          : userEmail === 'demo@travelai.app'
            ? fallbackCandidates
                .map((candidate) => ({
                  ...candidate,
                  planId: candidate.planId || defaultPlanId,
                }))
                .filter((candidate) => Boolean(candidate.planId))
            : [];

      if (candidates.length === 0) {
        return res.status(404).json({ error: 'No existing billing session' });
      }

      candidates.sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }
        return b.createdAtMs - a.createdAtMs;
      });

      const selected = candidates[0];

      if (authUser) {
        authUser.billing = {
          plan: selected.planId,
          connectionId: selected.connectionId,
          walletId: selected.walletId,
          updatedAt: new Date().toISOString(),
        };
        await saveAuthTable(authTablePath, authTable);
      }

      return res.json({
        plan: selected.planId,
        connectionId: selected.connectionId,
        connectionSecret: selected.connectionSecret,
        walletId: selected.walletId,
      });
    } catch (error) {
      if (error.status) {
        console.error(logPrefix, 'Failed to restore billing session:', error.message);
        return res.status(error.status).json({
          error: 'Failed to restore billing session',
          details: error.message,
        });
      }
      console.error(logPrefix, 'Error restoring billing session:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/billing/session', requireAuth, async (req, res) => {
    try {
      const plan = String(req.body?.plan || '').trim();
      const connectionId = String(req.body?.connectionId || '').trim();
      const walletId = req.body?.walletId || null;

      if (!plans[plan]) {
        return res.status(400).json({ error: 'Unknown plan' });
      }
      if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
      }

      const authUser = authTable.users.find((entry) => entry.id === req.auth.user.id);
      if (!authUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      authUser.billing = {
        plan,
        connectionId,
        walletId,
        updatedAt: new Date().toISOString(),
      };
      await saveAuthTable(authTablePath, authTable);

      return res.json({ ok: true });
    } catch (error) {
      console.error(logPrefix, 'Error saving billing session:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/billing/cycle-credits', requireAuth, async (req, res) => {
    try {
      const requestedConnectionId = String(req.query?.connectionId || '').trim();
      const authUser = authTable.users.find((entry) => entry.id === req.auth.user.id);
      const fallbackConnectionId = String(
        authUser?.billing?.connectionId || ''
      ).trim();
      const connectionId = requestedConnectionId || fallbackConnectionId;

      if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
      }

      const payload = await fetchConnectionSubscriptionById(connectionId);
      const subscription = payload?.subscription;
      if (!subscription) {
        return res
          .status(404)
          .json({ error: 'No active subscription for this connection' });
      }

      const included = String(subscription?.plan?.included_credit || '').trim();
      const credits = subscription?.credits || {};
      const totalRemaining = String(
        credits?.total_remaining || credits?.totalRemaining || ''
      ).trim();
      const cycleRemaining = String(
        credits?.cycle_remaining || credits?.cycleRemaining || ''
      ).trim();
      const bundleRemaining = String(
        credits?.bundle_remaining || credits?.bundleRemaining || ''
      ).trim();
      const remaining = totalRemaining || cycleRemaining;

      if (!included || !remaining) {
        return res.status(502).json({
          error: 'Subscription is missing cycle credit data',
        });
      }

      let used = null;
      const includedNumber = Number(included);
      const cycleRemainingNumber = Number(cycleRemaining || remaining);
      if (Number.isFinite(includedNumber) && Number.isFinite(cycleRemainingNumber)) {
        used = Math.max(0, includedNumber - cycleRemainingNumber).toFixed(12);
      }

      return res.json({
        connectionId,
        status: subscription?.status || null,
        cycleEndAt: subscription?.cycle_end_at || null,
        cycleCredits: {
          included,
          totalRemaining: remaining,
          cycleRemaining: cycleRemaining || remaining,
          bundleRemaining: bundleRemaining || '0',
          remaining,
          used,
        },
      });
    } catch (error) {
      if (error.status) {
        console.error(logPrefix, 'Failed to fetch cycle credits:', error.message);
        return res.status(error.status).json({
          error: 'Failed to fetch cycle credits',
          details: error.message,
        });
      }
      console.error(logPrefix, 'Error fetching cycle credits:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/create-forward-token', requireAuth, (req, res) => {
    const connectionSecret = String(req.body?.connectionSecret || '').trim();
    if (!isValidConnectionSecret(connectionSecret)) {
      return res.status(400).json({ error: 'Missing connectionSecret' });
    }
    const forwardToken = createForwardToken(connectionSecret);
    return res.json({ forwardToken });
  });

  app.post('/api/forward', requireAuth, async (req, res) => {
    try {
      const targetUrl = req.query.u;
      if (!targetUrl || typeof targetUrl !== 'string') {
        return res
          .status(400)
          .json({ error: 'Missing target URL parameter (?u=)' });
      }

      const lavaUrl = lavaApiUrl(`/forward?u=${encodeURIComponent(targetUrl)}`);
      const rawConnectionSecretHeader = req.headers['x-connection-secret'];
      const connectionSecret = String(
        Array.isArray(rawConnectionSecretHeader)
          ? rawConnectionSecretHeader[0]
          : rawConnectionSecretHeader || ''
      ).trim();
      if (!isValidConnectionSecret(connectionSecret)) {
        return res
          .status(401)
          .json({ error: 'Missing X-Connection-Secret header' });
      }

      const forwardToken = createForwardToken(connectionSecret);
      console.log(
        logPrefix,
        `Proxying ${req.auth.user.email} request to: ${lavaUrl}`
      );

      const response = await fetch(lavaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${forwardToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        return res.end();
      }

      if (contentType?.includes('application/json')) {
        const data = await response.json();
        return res.status(response.status).json(data);
      }

      const text = await response.text();
      return res.status(response.status).send(text);
    } catch (error) {
      console.error(logPrefix, 'Proxy error:', error);
      return res.status(500).json({ error: 'Proxy error', details: error.message });
    }
  });

  app.listen(port, () => {
    console.log('');
    console.log(logPrefix, '=======================================');
    console.log(logPrefix, `Travel Advisor backend running on http://localhost:${port}`);
    console.log(logPrefix, `Auth table: ${authTablePath}`);
    console.log(logPrefix, 'Plans configured:');
    Object.entries(plans).forEach(([planId, planConfig]) => {
      console.log(
        logPrefix,
        `- ${planId}: $${planConfig.amountUsd}/month`,
        planConfig.subscriptionConfigId ? '(ready)' : '(missing subscription_config_id)'
      );
    });
    console.log(logPrefix, '=======================================');
    console.log('');
  });

  return app;
}
