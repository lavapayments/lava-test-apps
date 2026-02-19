import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createTravelAdvisorServer } from './server-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3002; // DEV port (different from prod 3001)

const LAVA_SECRET_KEY =
  process.env.TRAVEL_ADVISOR_LAVA_SECRET_KEY ?? process.env.LAVA_SECRET_KEY;
const LAVA_PRODUCT_SECRET =
  process.env.TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_DEV ??
  process.env.LAVA_PRODUCT_SECRET_DEV ??
  process.env.LAVA_PRODUCT_SECRET ??
  '';
const LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID =
  process.env.TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV ??
  process.env.LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV ??
  '';
const LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID =
  process.env.TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV ??
  process.env.LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV ??
  '';
const ORIGIN_URL =
  process.env.TRAVEL_ADVISOR_ORIGIN_URL_DEV ?? 'http://localhost:5050';
const LAVA_API_BASE_URL =
  process.env.TRAVEL_ADVISOR_LAVA_API_BASE_URL_DEV ??
  'https://api.lavapayments.com/v1';

if (!LAVA_SECRET_KEY) {
  console.error(
    '[DEV] ERROR: TRAVEL_ADVISOR_LAVA_SECRET_KEY not found in environment'
  );
  console.error('[DEV] Run with: doppler run --config dev -- npm run dev');
  process.exit(1);
}

if (!LAVA_PRODUCT_SECRET) {
  console.error(
    '[DEV] ERROR: TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_DEV not found in environment'
  );
  console.error('[DEV] Set a TEST product secret before starting the backend.');
  process.exit(1);
}

if (!LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID) {
  console.error(
    '[DEV] ERROR: TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV not found in environment'
  );
  console.error('[DEV] Set the TEST $10 plan subscription config ID in Doppler.');
  process.exit(1);
}

if (!LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID) {
  console.error(
    '[DEV] ERROR: TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV not found in environment'
  );
  console.error('[DEV] Set the TEST $20 plan subscription config ID in Doppler.');
  process.exit(1);
}

if (!process.env.TRAVEL_ADVISOR_LAVA_SECRET_KEY && process.env.LAVA_SECRET_KEY) {
  console.warn(
    '[DEV] WARNING: Falling back to LAVA_SECRET_KEY. Set TRAVEL_ADVISOR_LAVA_SECRET_KEY to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_DEV &&
  process.env.LAVA_PRODUCT_SECRET_DEV
) {
  console.warn(
    '[DEV] WARNING: Falling back to LAVA_PRODUCT_SECRET_DEV. Set TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_DEV to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV &&
  process.env.LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV
) {
  console.warn(
    '[DEV] WARNING: Falling back to LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV. Set TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_DEV to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV &&
  process.env.LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV
) {
  console.warn(
    '[DEV] WARNING: Falling back to LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV. Set TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_DEV to isolate Travel Advisor credentials.'
  );
}

await createTravelAdvisorServer({
  port: PORT,
  logPrefix: '[DEV]',
  checkoutScriptPath: join(__dirname, 'checkout.js'),
  lavaSecretKey: LAVA_SECRET_KEY,
  lavaProductSecret: LAVA_PRODUCT_SECRET,
  lavaApiBaseUrl: LAVA_API_BASE_URL,
  originUrl: ORIGIN_URL,
  authTablePath: join(__dirname, 'auth-users-dev.json'),
  plans: {
    starter10: {
      amountUsd: 10,
      subscriptionConfigId: LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID,
    },
    pro20: {
      amountUsd: 20,
      subscriptionConfigId: LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID,
    },
  },
});
