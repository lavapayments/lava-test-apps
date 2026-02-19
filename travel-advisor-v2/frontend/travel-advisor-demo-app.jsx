const { useCallback, useEffect, useMemo, useRef, useState } = React;

const config = window.TRAVEL_APP_CONFIG || {};
const apiBase = String(config.apiBase || '').replace(/\/+$/, '');
const storage = config.storage || {};
const authStorageKey = storage.authKey || 'travelai_auth';
const billingStorageKey = storage.billingKey || 'travelai_billing';

function formatCredit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  if (Math.abs(numeric - Math.round(numeric)) < 1e-9) {
    return String(Math.round(numeric));
  }
  return numeric.toFixed(2);
}

function parseErrorMessage(defaultMessage, payload) {
  if (!payload) {
    return defaultMessage;
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload.error && payload.details) {
    return `${payload.error}: ${payload.details}`;
  }
  if (payload.error) {
    return String(payload.error);
  }
  return defaultMessage;
}

async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const token = options.token || null;
  const body = options.body;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const fallback = `Request failed (${response.status})`;
    throw new Error(parseErrorMessage(fallback, payload));
  }

  return payload;
}

function TravelAdvisorApp() {
  const [authToken, setAuthToken] = useState(() => {
    try {
      return localStorage.getItem(authStorageKey) || '';
    } catch {
      return '';
    }
  });

  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    email: config.demoAccount?.email || '',
    password: config.demoAccount?.password || '',
    name: '',
  });
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('starter10');
  const [billingSession, setBillingSession] = useState(() => {
    try {
      const raw = localStorage.getItem(billingStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const [cycleCredits, setCycleCredits] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [billingBusy, setBillingBusy] = useState(false);

  const [showRechargeOptions, setShowRechargeOptions] = useState(false);
  const [creditBundles, setCreditBundles] = useState([]);
  const [rechargeBusy, setRechargeBusy] = useState(false);

  const [messages, setMessages] = useState(() => [
    {
      id: `m_${Date.now()}`,
      role: 'assistant',
      content: config.welcomeMessage || "Hi! I'm your AI travel advisor.",
    },
  ]);
  const [draft, setDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const checkoutFlowRef = useRef(null);
  const [checkoutSessionToken, setCheckoutSessionToken] = useState('');

  const plans = useMemo(() => {
    const raw = config.plans || {};
    return [
      { id: 'starter10', ...(raw.starter10 || {}) },
      { id: 'pro20', ...(raw.pro20 || {}) },
    ];
  }, []);

  const activePlan = useMemo(() => {
    if (!billingSession?.plan) return null;
    return plans.find((plan) => plan.id === billingSession.plan) || null;
  }, [billingSession, plans]);

  const saveAuthToken = useCallback((token) => {
    setAuthToken(token || '');
    try {
      if (token) {
        localStorage.setItem(authStorageKey, token);
      } else {
        localStorage.removeItem(authStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const saveBillingSession = useCallback((session) => {
    setBillingSession(session || null);
    try {
      if (session) {
        localStorage.setItem(billingStorageKey, JSON.stringify(session));
      } else {
        localStorage.removeItem(billingStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearBillingState = useCallback(() => {
    saveBillingSession(null);
    setCycleCredits(null);
    setBillingError('');
    setPlanSelectorOpen(true);
    setShowRechargeOptions(false);
    setCreditBundles([]);
  }, [saveBillingSession]);

  const fetchAuthMe = useCallback(async (token) => {
    const payload = await apiRequest('/api/auth/me', { token });
    setAuthUser(payload.user || null);
  }, []);

  const fetchCycleCredits = useCallback(
    async (token, connectionId) => {
      if (!connectionId) {
        setCycleCredits(null);
        return null;
      }
      const payload = await apiRequest(
        `/api/billing/cycle-credits?connectionId=${encodeURIComponent(connectionId)}`,
        { token }
      );
      setCycleCredits(payload.cycleCredits || null);
      return payload;
    },
    []
  );

  const fetchBillingSession = useCallback(
    async (token) => {
      try {
        const payload = await apiRequest('/api/billing/session', { token });
        const session = {
          plan: payload.plan,
          connectionId: payload.connectionId,
          connectionSecret: payload.connectionSecret,
          walletId: payload.walletId || null,
        };
        saveBillingSession(session);
        setSelectedPlan(session.plan || 'starter10');
        setPlanSelectorOpen(false);
        setBillingError('');
        await fetchCycleCredits(token, session.connectionId);
        return session;
      } catch (error) {
        const message = String(error?.message || '');
        if (message.includes('No existing billing session')) {
          clearBillingState();
          return null;
        }
        throw error;
      }
    },
    [clearBillingState, fetchCycleCredits, saveBillingSession]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!authToken) {
        setAuthUser(null);
        setBootLoading(false);
        clearBillingState();
        return;
      }

      try {
        await fetchAuthMe(authToken);
        if (cancelled) return;
        await fetchBillingSession(authToken);
      } catch (error) {
        if (cancelled) return;
        console.error(config.errorPrefix || '[ERROR]', 'Boot failed:', error);
        saveAuthToken('');
        setAuthUser(null);
        clearBillingState();
        setAuthError('Your session expired. Please log in again.');
      } finally {
        if (!cancelled) {
          setBootLoading(false);
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [authToken, clearBillingState, fetchAuthMe, fetchBillingSession, saveAuthToken]);

  const handleCheckoutSuccess = useCallback(
    async (connectionId) => {
      const flow = checkoutFlowRef.current;
      checkoutFlowRef.current = null;
      if (!flow) {
        return;
      }
      if (!authToken) {
        setBillingBusy(false);
        setRechargeBusy(false);
        setAuthMode('login');
        setAuthError('');
        setAuthNotice(
          'Checkout completed. If this was a new-customer flow, finish phone verification in checkout and then log in here.'
        );
        return;
      }

      try {
        setBillingError('');
        if (flow.type === 'subscription') {
          const resolved = await apiRequest('/api/checkout/resolve-connection', {
            method: 'POST',
            token: authToken,
            body: { connectionId },
          });

          const nextSession = {
            plan: flow.plan,
            connectionId: resolved.connectionId || connectionId,
            connectionSecret: resolved.connectionSecret,
            walletId: null,
          };

          await apiRequest('/api/billing/session', {
            method: 'POST',
            token: authToken,
            body: {
              plan: nextSession.plan,
              connectionId: nextSession.connectionId,
              walletId: null,
            },
          });

          saveBillingSession(nextSession);
          setSelectedPlan(nextSession.plan);
          setPlanSelectorOpen(false);
          await fetchCycleCredits(authToken, nextSession.connectionId);
          setShowRechargeOptions(false);
        } else if (flow.type === 'credit_bundle') {
          const current = billingSession;
          const activeConnectionId =
            connectionId || current?.connectionId || flow.connectionId;
          if (current && activeConnectionId) {
            saveBillingSession({
              ...current,
              connectionId: activeConnectionId,
            });
          }
          await fetchCycleCredits(authToken, activeConnectionId);
          setShowRechargeOptions(false);
        }
      } catch (error) {
        console.error(
          config.errorPrefix || '[ERROR]',
          'Checkout success handling failed:',
          error
        );
        setBillingError(
          `Checkout completed, but refresh failed: ${error.message || 'Unknown error'}`
        );
      } finally {
        setBillingBusy(false);
        setRechargeBusy(false);
      }
    },
    [authToken, billingSession, fetchCycleCredits, saveBillingSession]
  );

  const handleCheckoutCancel = useCallback(() => {
    checkoutFlowRef.current = null;
    setBillingBusy(false);
    setRechargeBusy(false);
  }, []);

  const handleCheckoutError = useCallback((error) => {
    checkoutFlowRef.current = null;
    setBillingBusy(false);
    setRechargeBusy(false);
    setBillingError(error || 'Something went wrong. Please try again.');
  }, []);

  useEffect(() => {
    if (!checkoutSessionToken) {
      return undefined;
    }

    let checkoutSession;
    try {
      checkoutSession = JSON.parse(atob(checkoutSessionToken));
      if (!(checkoutSession?.secret && checkoutSession?.base)) {
        throw new Error('Invalid checkout session token');
      }
    } catch (error) {
      handleCheckoutError(error?.message || 'Invalid checkout session token');
      setCheckoutSessionToken('');
      return undefined;
    }

    const iframe = document.createElement('iframe');
    iframe.src = `${checkoutSession.base}embed/checkout/${checkoutSession.secret}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.margin = 'auto';
    iframe.style.border = 'none';
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.backgroundColor = 'transparent';
    iframe.style.zIndex = '2147483647';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin');
    document.body.appendChild(iframe);

    function handleMessage(event) {
      if (!event?.data || typeof event.data !== 'object') {
        return;
      }
      if (event.data.type === 'lava_checkout_success') {
        setCheckoutSessionToken('');
        handleCheckoutSuccess(event.data.connectionId || '');
      } else if (event.data.type === 'lava_checkout_cancel') {
        setCheckoutSessionToken('');
        handleCheckoutCancel();
      }
    }

    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }

    window.addEventListener('message', handleMessage, false);
    window.addEventListener('beforeunload', onBeforeUnload, false);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (iframe.parentElement) {
        iframe.parentElement.removeChild(iframe);
      }
    };
  }, [
    checkoutSessionToken,
    handleCheckoutCancel,
    handleCheckoutError,
    handleCheckoutSuccess,
  ]);

  const openCheckout = useCallback((sessionToken) => {
    if (!sessionToken) {
      handleCheckoutError('Missing checkout session token');
      return;
    }
    setCheckoutSessionToken(sessionToken);
  }, [handleCheckoutError]);

  const handleAuthSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (authBusy) return;
      setAuthBusy(true);
      setAuthError('');
      setAuthNotice('');

      try {
        const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
        const body =
          authMode === 'signup'
            ? {
                email: authForm.email,
                password: authForm.password,
                name: authForm.name,
              }
            : {
                email: authForm.email,
                password: authForm.password,
              };

        const payload = await apiRequest(endpoint, {
          method: 'POST',
          body,
        });

        saveAuthToken(payload.token || '');
        setAuthUser(payload.user || null);
        setAuthNotice('');
        setBootLoading(true);
      } catch (error) {
        setAuthError(error.message || 'Authentication failed');
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, authForm.email, authForm.name, authForm.password, authMode, saveAuthToken]
  );

  const handleLogout = useCallback(async () => {
    if (!authToken) return;
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        token: authToken,
      });
    } catch {
      // ignore logout failures
    }
    saveAuthToken('');
    setAuthUser(null);
    setAuthNotice('');
    setMessages([
      {
        id: `m_${Date.now()}`,
        role: 'assistant',
        content: config.welcomeMessage || "Hi! I'm your AI travel advisor.",
      },
    ]);
    clearBillingState();
  }, [authToken, clearBillingState, saveAuthToken]);

  const handlePlanCheckout = useCallback(
    async (planId) => {
      if (!openCheckout) {
        setBillingError('Checkout component is not ready yet. Refresh and try again.');
        return;
      }

      setBillingBusy(true);
      setBillingError('');
      setAuthError('');
      setAuthNotice('');
      try {
        const payload = await apiRequest('/api/checkout/create-session', {
          method: 'POST',
          token: authToken || undefined,
          body: {
            plan: planId,
            connectionId:
              authToken && billingSession?.connectionId
                ? billingSession.connectionId
                : undefined,
          },
        });

        checkoutFlowRef.current = {
          type: 'subscription',
          plan: planId,
        };
        openCheckout(payload.sessionToken);
      } catch (error) {
        setBillingError(error.message || 'Failed to create checkout session');
        setBillingBusy(false);
      }
    },
    [authToken, billingSession?.connectionId, openCheckout]
  );

  const handleOpenRecharge = useCallback(async () => {
    if (!authToken) return;
    if (!billingSession?.connectionId) {
      setBillingError('Connect a plan first before buying credit bundles.');
      return;
    }

    setRechargeBusy(true);
    setBillingError('');
    try {
      const payload = await apiRequest(
        `/api/checkout/credit-bundles?connectionId=${encodeURIComponent(
          billingSession.connectionId
        )}`,
        { token: authToken }
      );
      setCreditBundles(Array.isArray(payload.creditBundles) ? payload.creditBundles : []);
      setShowRechargeOptions(true);
    } catch (error) {
      setBillingError(error.message || 'Failed to load credit bundles');
    } finally {
      setRechargeBusy(false);
    }
  }, [authToken, billingSession?.connectionId]);

  const handleRechargeBundle = useCallback(
    async (creditBundleId) => {
      if (!authToken || !openCheckout) {
        setBillingError('Checkout component is not ready yet. Refresh and try again.');
        return;
      }
      if (!billingSession?.connectionId) {
        setBillingError('Missing connection session for recharge');
        return;
      }

      setRechargeBusy(true);
      setBillingError('');
      try {
        const payload = await apiRequest('/api/checkout/create-credit-bundle-session', {
          method: 'POST',
          token: authToken,
          body: {
            connectionId: billingSession.connectionId,
            creditBundleId,
          },
        });

        checkoutFlowRef.current = {
          type: 'credit_bundle',
          connectionId: billingSession.connectionId,
          creditBundleId,
        };
        openCheckout(payload.sessionToken);
      } catch (error) {
        setBillingError(error.message || 'Failed to start recharge checkout');
        setRechargeBusy(false);
      }
    },
    [authToken, billingSession?.connectionId, openCheckout]
  );

  const handleRefreshCredits = useCallback(async () => {
    if (!authToken || !billingSession?.connectionId) {
      return;
    }
    setBillingBusy(true);
    setBillingError('');
    try {
      await fetchCycleCredits(authToken, billingSession.connectionId);
    } catch (error) {
      setBillingError(error.message || 'Failed to refresh credits');
    } finally {
      setBillingBusy(false);
    }
  }, [authToken, billingSession?.connectionId, fetchCycleCredits]);

  const handleSendMessage = useCallback(
    async (event) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || chatBusy) return;

      if (!authToken || !billingSession?.connectionSecret) {
        setBillingError('Log in and connect a plan before using chat.');
        return;
      }

      const userMessage = {
        id: `m_${Date.now()}_u`,
        role: 'user',
        content: text,
      };

      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setDraft('');
      setChatBusy(true);

      try {
        const response = await apiRequest(
          `/api/forward?u=${encodeURIComponent('https://api.openai.com/v1/chat/completions')}`,
          {
            method: 'POST',
            token: authToken,
            headers: {
              'X-Connection-Secret': billingSession.connectionSecret,
            },
            body: {
              model: config.aiModel || 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: config.systemPrompt || 'You are a helpful travel assistant.',
                },
                ...nextMessages.map((message) => ({
                  role: message.role,
                  content: message.content,
                })),
              ],
              temperature: 0.6,
            },
          }
        );

        const content =
          response?.choices?.[0]?.message?.content ||
          'I could not generate a response. Please try again.';

        setMessages((current) => [
          ...current,
          {
            id: `m_${Date.now()}_a`,
            role: 'assistant',
            content,
          },
        ]);

        await fetchCycleCredits(authToken, billingSession.connectionId);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `m_${Date.now()}_e`,
            role: 'assistant',
            content: `I hit an error while replying: ${error.message || 'Unknown error'}`,
          },
        ]);
      } finally {
        setChatBusy(false);
      }
    },
    [
      authToken,
      billingSession?.connectionId,
      billingSession?.connectionSecret,
      chatBusy,
      draft,
      fetchCycleCredits,
      messages,
    ]
  );

  if (bootLoading) {
    return (
      <div className="container" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="chat-container" style={{ padding: 24, textAlign: 'center' }}>
          Loading account...
        </div>
      </div>
    );
  }

  if (!authToken || !authUser) {
    return (
      <div className="container" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="chat-container" style={{ maxWidth: 520, margin: '0 auto' }}>
          <div className="chat-header">
            <h2>{authMode === 'signup' ? 'Create account' : 'Log in'}</h2>
            <p>
              {authMode === 'signup'
                ? 'Create your account to start a subscription.'
                : 'Log in to manage your travel plan.'}
            </p>
          </div>
          <form className="chat-input-container" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' ? (
              <div style={{ marginBottom: 12 }}>
                <input
                  className="chat-input"
                  placeholder="Full name"
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </div>
            ) : null}
            <div style={{ marginBottom: 12 }}>
              <input
                className="chat-input"
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="chat-input"
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </div>

            {authError ? (
              <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 14 }}>{authError}</div>
            ) : null}
            {authNotice ? (
              <div style={{ color: '#059669', marginBottom: 12, fontSize: 14 }}>{authNotice}</div>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={authBusy}>
              {authBusy
                ? 'Please wait...'
                : authMode === 'signup'
                  ? 'Create account'
                  : 'Log in'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAuthError('');
                setAuthNotice('');
                setAuthMode((current) => (current === 'login' ? 'signup' : 'login'));
              }}
              style={{ marginLeft: 10 }}
            >
              {authMode === 'signup' ? 'Use existing account' : 'Create new account'}
            </button>
          </form>
        </div>

        <section className="pricing-section" style={{ paddingTop: 40, paddingBottom: 0 }}>
          <div className="pricing-header" style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 32 }}>Plans</h2>
            <p>Preview pricing while logged out. Log in to subscribe.</p>
          </div>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <div
                key={`logged_out_${plan.id}`}
                className={`pricing-card ${selectedPlan === plan.id ? 'featured' : ''}`}
              >
                <div className="plan-name">{plan.name || plan.id}</div>
                <div className="plan-price">
                  {plan.priceLabel || '$--'}
                  <span className="plan-price-unit"> / month</span>
                </div>
                <div className="plan-description">{plan.description || ''}</div>
                <ul className="plan-features">
                  {(plan.features || []).map((feature, index) => (
                    <li key={`logged_out_${plan.id}_${index}`}>{feature}</li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  disabled={billingBusy}
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    handlePlanCheckout(plan.id);
                  }}
                >
                  {billingBusy && selectedPlan === plan.id
                    ? 'Opening checkout...'
                    : plan.buttonLabel || 'Select plan'}
                </button>
              </div>
            ))}
          </div>
          {billingError ? (
            <p style={{ textAlign: 'center', color: '#dc2626', marginTop: 16 }}>{billingError}</p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="container header-content">
          <div className="logo">
            TravelAI
            {config.envName ? <span className="logo-dev-badge">{config.envName}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {planSelectorOpen ? (
        <section className="pricing-section">
          <div className="container">
            <div className="pricing-header">
              <h2>Choose your plan</h2>
              <p>Logged in as {authUser.email}. Select a plan to continue.</p>
            </div>
            <div className="pricing-grid">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`pricing-card ${selectedPlan === plan.id ? 'featured' : ''}`}
                >
                  <div className="plan-name">{plan.name || plan.id}</div>
                  <div className="plan-price">
                    {plan.priceLabel || '$--'}
                    <span className="plan-price-unit"> / month</span>
                  </div>
                  <div className="plan-description">{plan.description || ''}</div>
                  <ul className="plan-features">
                    {(plan.features || []).map((feature, index) => (
                      <li key={`${plan.id}_${index}`}>{feature}</li>
                    ))}
                  </ul>
                  <button
                    className="btn btn-primary"
                    disabled={billingBusy}
                    onClick={() => {
                      setSelectedPlan(plan.id);
                      handlePlanCheckout(plan.id);
                    }}
                  >
                    {billingBusy && selectedPlan === plan.id
                      ? 'Opening checkout...'
                      : plan.buttonLabel || 'Select plan'}
                  </button>
                </div>
              ))}
            </div>
            {billingSession ? (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setPlanSelectorOpen(false)}
                >
                  Back to chat
                </button>
              </div>
            ) : null}
            {billingError ? (
              <p style={{ textAlign: 'center', color: '#dc2626', marginTop: 20 }}>{billingError}</p>
            ) : null}
          </div>
        </section>
      ) : (
        <section style={{ padding: '32px 0' }}>
          <div className="container" style={{ maxWidth: 860 }}>
            <div className="wallet-info">
              <div className="wallet-balance">
                <div>Active plan: <strong style={{ fontSize: 18 }}>{activePlan?.name || billingSession?.plan || 'Unknown'}</strong></div>
                <div style={{ marginTop: 6, color: '#6b7280' }}>
                  Credits available:
                  {' '}
                  <strong style={{ display: 'inline', marginTop: 0 }}>
                    {formatCredit(cycleCredits?.remaining)}
                  </strong>
                </div>
                <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
                  Cycle: {formatCredit(cycleCredits?.cycleRemaining)} / {formatCredit(cycleCredits?.included)} included
                  {' • '}
                  Bundles: {formatCredit(cycleCredits?.bundleRemaining)}
                </div>
                {Number(cycleCredits?.remaining) > Number(cycleCredits?.included) ? (
                  <div style={{ marginTop: 6, color: '#059669', fontSize: 13 }}>
                    Includes extra credits from purchased bundles.
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={handleRefreshCredits} disabled={billingBusy}>
                  {billingBusy ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleOpenRecharge}
                  disabled={rechargeBusy}
                >
                  {rechargeBusy ? 'Loading...' : 'Recharge'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setPlanSelectorOpen(true);
                    setBillingError('');
                  }}
                >
                  Change plan
                </button>
              </div>
            </div>

            {showRechargeOptions ? (
              <div
                className="chat-container"
                style={{ marginTop: 0, marginBottom: 16, borderColor: 'hsl(var(--primary) / 0.35)' }}
              >
                <div className="chat-input-container">
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Credit bundle recharge</div>
                  {creditBundles.length === 0 ? (
                    <div style={{ color: '#6b7280' }}>No credit bundles are configured for this plan.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {creditBundles.map((bundle) => (
                        <div
                          key={bundle.creditBundleId}
                          style={{
                            border: '1px solid hsl(var(--border) / 0.6)',
                            borderRadius: 10,
                            padding: 12,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{bundle.name || 'Credit bundle'}</div>
                            <div style={{ color: '#6b7280', fontSize: 14 }}>
                              +{formatCredit(bundle.creditAmount)} credits for ${formatCredit(bundle.cost)}
                            </div>
                          </div>
                          <button
                            className="btn btn-primary"
                            style={{ height: 40, padding: '0 16px' }}
                            disabled={rechargeBusy}
                            onClick={() => handleRechargeBundle(bundle.creditBundleId)}
                          >
                            {rechargeBusy ? 'Opening...' : 'Buy'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowRechargeOptions(false)}
                      style={{ height: 40 }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {billingError ? (
              <div style={{ color: '#dc2626', marginBottom: 10 }}>{billingError}</div>
            ) : null}

            <div className="chat-container">
              <div className="chat-header">
                <h2>Travel Advisor</h2>
                <p>Ask for destination ideas, itineraries, and planning help.</p>
              </div>

              <div className="chat-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <div className="message-avatar">
                      {message.role === 'user' ? '👤' : '✈️'}
                    </div>
                    <div className="message-content">{message.content}</div>
                  </div>
                ))}
                {chatBusy ? (
                  <div className="message assistant loading">
                    <div className="message-avatar">✈️</div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <form className="chat-input-container" onSubmit={handleSendMessage}>
                <div className="chat-input-wrapper">
                  <input
                    className="chat-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask about your next trip..."
                    disabled={chatBusy}
                  />
                  <button className="send-button" type="submit" disabled={chatBusy || !draft.trim()}>
                    →
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      <footer>
        <div className="container">
          <div>TravelAI demo environment</div>
          <div className="powered-by">
            Powered by <a href="https://lava.so" target="_blank" rel="noreferrer">Lava</a>
          </div>
        </div>
      </footer>
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element');
}

const root = ReactDOM.createRoot(rootElement);
root.render(<TravelAdvisorApp />);
