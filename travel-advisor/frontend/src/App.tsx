import { useLavaCheckout } from '@lavapayments/checkout';
import { useEffect, useRef, useState } from 'react';

// ===========================================
// CONFIGURATION - UPDATE THESE VALUES
// ===========================================
// Get your product secrets from the Lava dashboard:
// https://dashboard.lavapayments.com/products
const CONFIG = {
  products: {
    paygo: {
      // TODO: This product secret is not implemented - always uses .env product secret
      secret: 'ps_test_your_paygo_product_secret_here',
      name: 'Pay-as-you-go',
      price: 0,
      pricePerQuery: 0.5,
    },
    pro: {
      // TODO: This product secret is not implemented - always uses .env product secret
      secret: 'ps_test_your_pro_product_secret_here',
      name: 'Pro Plan',
      price: 10,
      pricePerMonth: 10,
    },
  },
  // Backend API URL - update if running on different port
  backendUrl: 'http://localhost:3001',
  // AI model to use
  aiModel: 'gpt-4o-mini',
  // System prompt for the AI
  systemPrompt: `You are an expert travel advisor AI assistant. Help users plan their dream trips by:
- Asking clarifying questions about their preferences (budget, dates, interests)
- Suggesting destinations based on their needs
- Providing practical travel advice
- Being enthusiastic and helpful

Keep responses concise and conversational. Ask one question at a time to understand their needs better.`,
};

// ===========================================
// TYPE DEFINITIONS
// ===========================================
type ViewType = 'landing' | 'pricing' | 'chat';
type PlanType = 'paygo' | 'pro';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Session {
  plan: PlanType;
  walletId: string;
  connectionId: string;
  connectionSecret: string;
  forwardToken: string;
  balance: string;
}

// ===========================================
// MAIN APP COMPONENT
// ===========================================
function App() {
  const [view, setView] = useState<ViewType>('landing');
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [sessionSecret, setSessionSecret] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Initialize useLavaCheckout hook
  const { open } = useLavaCheckout({
    onSuccess: async (data) => {
      console.log('🎉 Checkout completed!');
      console.log('Connection ID:', data.connectionId);

      // Fetch the connection details from backend
      try {
        const response = await fetch(
          `${CONFIG.backendUrl}/api/checkout/connection/${data.connectionId}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch connection details');
        }

        const connectionData = await response.json();
        console.log('✅ Connection data received');

        //TODO: Balance is not implemented - always uses $10.00
        const newSession: Session = {
          plan: selectedPlan!,
          walletId: connectionData.walletId,
          connectionId: data.connectionId,
          connectionSecret: connectionData.connectionSecret,
          forwardToken: connectionData.forwardToken,
          balance: selectedPlan === 'pro' ? 'Unlimited' : '$10.00',
        };

        setSession(newSession);
        localStorage.setItem('travelai_session', JSON.stringify(newSession));

        setView('chat');
        setMessages([
          {
            role: 'assistant',
            content:
              "✈️ Hi! I'm your AI travel advisor. Where would you like to go? Tell me about your dream destination!",
          },
        ]);
      } catch (error) {
        console.error('❌ Failed to fetch connection details:', error);
        setCheckoutError('Failed to complete setup. Please try again.');
        setView('pricing');
      }
    },
    onError: (error) => {
      console.error('❌ Checkout error:', error);
      setCheckoutError(error.error || 'Checkout failed');
      setView('pricing');
    },
    onCancel: () => {
      console.log('🚫 Checkout cancelled');
      setView('pricing');
    },
  });

  // Check for existing session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('travelai_session');
    if (savedSession) {
      const parsed = JSON.parse(savedSession);
      setSession(parsed);
      setView('chat');
      if (messages.length === 0) {
        setMessages([
          {
            role: 'assistant',
            content:
              "✈️ Hi! I'm your AI travel advisor. Where would you like to go? Tell me about your dream destination!",
          },
        ]);
      }
    }
  }, []);

  // Open checkout when sessionSecret is set
  useEffect(() => {
    if (sessionSecret && open) {
      console.log('Opening checkout...');
      open(sessionSecret);
    }
  }, [sessionSecret, open]);

  const handlePlanSelect = async (plan: PlanType) => {
    setSelectedPlan(plan);
    setCheckoutError(null);
    await createCheckoutSession(plan);
  };

  const createCheckoutSession = async (plan: PlanType) => {
    try {
      const productSecret = CONFIG.products[plan].secret;

      const response = await fetch(
        `${CONFIG.backendUrl}/api/checkout/create-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productSecret,
            plan,
            originUrl: window.location.origin,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      console.log('✅ Checkout session created');

      setSessionSecret(data.sessionSecret);
    } catch (error) {
      console.error('Checkout session creation failed:', error);
      setCheckoutError('Failed to start checkout. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('travelai_session');
    setSession(null);
    setMessages([]);
    setView('landing');
  };

  return (
    <>
      <Header
        onLogoClick={() => setView('landing')}
        onLogout={handleLogout}
        onPricingClick={() => setView('pricing')}
        session={session}
      />

      {view === 'landing' && (
        <LandingPage onGetStarted={() => setView('pricing')} />
      )}

      {view === 'pricing' && (
        <PricingPage
          checkoutError={checkoutError}
          onSelectPlan={handlePlanSelect}
        />
      )}

      {view === 'chat' && session && (
        <ChatInterface
          inputValue={inputValue}
          isLoading={isLoading}
          messages={messages}
          session={session}
          setInputValue={setInputValue}
          setIsLoading={setIsLoading}
          setMessages={setMessages}
        />
      )}

      <Footer />
    </>
  );
}

// ===========================================
// HEADER COMPONENT
// ===========================================
interface HeaderProps {
  session: Session | null;
  onPricingClick: () => void;
  onLogoClick: () => void;
  onLogout: () => void;
}

function Header({
  session,
  onPricingClick,
  onLogoClick,
  onLogout,
}: HeaderProps) {
  return (
    <header>
      <div className="container">
        <div className="header-content">
          <div
            className="logo"
            onClick={onLogoClick}
            style={{ cursor: 'pointer' }}
          >
            ✈️ TravelAI
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {session ? (
              <button className="btn btn-secondary" onClick={onLogout}>
                Logout
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onPricingClick}>
                Get Started
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ===========================================
// LANDING PAGE COMPONENT
// ===========================================
interface LandingPageProps {
  onGetStarted: () => void;
}

function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="hero">
      <div className="container">
        <div className="hero-emoji">🌍</div>
        <h1>Your AI Travel Advisor</h1>
        <p>
          Get personalized travel recommendations powered by AI. Plan your
          perfect trip in minutes.
        </p>
        <button className="btn btn-primary" onClick={onGetStarted}>
          Start Planning Your Trip →
        </button>
      </div>
    </div>
  );
}

// ===========================================
// PRICING PAGE COMPONENT
// ===========================================
interface PricingPageProps {
  onSelectPlan: (plan: PlanType) => void;
  checkoutError: string | null;
}

function PricingPage({ onSelectPlan, checkoutError }: PricingPageProps) {
  return (
    <div className="pricing-section">
      <div className="container">
        <div className="pricing-header">
          <h2>Choose Your Plan</h2>
          <p>Select the plan that works best for your travel planning needs</p>
          {checkoutError && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                background: '#fee',
                border: '1px solid #fcc',
                borderRadius: '8px',
                color: '#c00',
                fontSize: '14px',
              }}
            >
              {checkoutError}
            </div>
          )}
        </div>

        <div className="pricing-grid">
          {/* Pay-as-you-go Plan */}
          <div className="pricing-card">
            <div className="plan-name">Pay as you go</div>
            <div className="plan-price">
              $0.50
              <span className="plan-price-unit">/query</span>
            </div>
            <p className="plan-description">
              Perfect for occasional travelers. Only pay for what you use.
            </p>
            <ul className="plan-features">
              <li>Unlimited queries</li>
              <li>Pay per conversation</li>
              <li>No monthly commitment</li>
              <li>AI-powered recommendations</li>
            </ul>
            <button
              className="btn btn-secondary"
              onClick={() => onSelectPlan('paygo')}
              style={{ width: '100%' }}
            >
              Choose Pay-as-you-go
            </button>
          </div>

          {/* Pro Plan */}
          <div className="pricing-card featured">
            <div className="plan-name">Pro Plan</div>
            <div className="plan-price">
              $10
              <span className="plan-price-unit">/month</span>
            </div>
            <p className="plan-description">
              Best for frequent travelers. Unlimited planning at a flat rate.
            </p>
            <ul className="plan-features">
              <li>Unlimited queries</li>
              <li>Unlimited conversations</li>
              <li>Priority support</li>
              <li>Advanced AI features</li>
            </ul>
            <button
              className="btn btn-primary"
              onClick={() => onSelectPlan('pro')}
              style={{ width: '100%' }}
            >
              Choose Pro Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// CHAT INTERFACE COMPONENT
// ===========================================
interface ChatInterfaceProps {
  session: Session;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

function ChatInterface({
  session,
  messages,
  setMessages,
  inputValue,
  setInputValue,
  isLoading,
  setIsLoading,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await callLavaBuildAPI(newMessages, session);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: response,
        },
      ]);
    } catch (error) {
      console.error('Error calling AI:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: '❌ Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="container">
      {session.plan === 'paygo' && (
        <div className="wallet-info">
          <div className="wallet-balance">
            Your Balance
            <strong>{session.balance}</strong>
          </div>
          <div
            style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}
          >
            $0.50 per query
          </div>
        </div>
      )}

      <div className="chat-container">
        <div className="chat-header">
          <h2>✈️ Your AI Travel Advisor</h2>
          <p>Ask me anything about your travel plans!</p>
        </div>

        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div className={`message ${msg.role}`} key={idx}>
              <div className="message-avatar">
                {msg.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant loading">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <input
              className="chat-input"
              disabled={isLoading}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about destinations, travel tips, planning..."
              type="text"
              value={inputValue}
            />
            <button
              className="send-button"
              disabled={isLoading || !inputValue.trim()}
              onClick={sendMessage}
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// FOOTER COMPONENT
// ===========================================
function Footer() {
  return (
    <footer>
      <div className="container">
        <p>© 2024 TravelAI. All rights reserved.</p>
        <div className="powered-by">
          Powered by{' '}
          <a href="https://lavapayments.com" rel="noopener" target="_blank">
            Lava Monetize
          </a>
        </div>
      </div>
    </footer>
  );
}

// ===========================================
// API INTEGRATION
// ===========================================
async function callLavaBuildAPI(
  messages: Message[],
  session: Session
): Promise<string> {
  // Call backend proxy to avoid CORS issues
  const response = await fetch(`${CONFIG.backendUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      forwardToken: session.forwardToken,
      messages: [{ role: 'system', content: CONFIG.systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get AI response');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export default App;
