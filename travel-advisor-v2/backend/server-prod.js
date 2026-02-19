import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createTravelAdvisorServer } from './server-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3001;

const LAVA_SECRET_KEY =
  process.env.TRAVEL_ADVISOR_LAVA_SECRET_KEY ?? process.env.LAVA_SECRET_KEY;
const LAVA_PRODUCT_SECRET =
  process.env.TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_PROD ??
  process.env.LAVA_PRODUCT_SECRET_PROD ??
  '';
const LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID =
  process.env.TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD ??
  process.env.LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD ??
  '';
const LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID =
  process.env.TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD ??
  process.env.LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD ??
  '';
const ORIGIN_URL =
  process.env.TRAVEL_ADVISOR_ORIGIN_URL_PROD ?? 'http://localhost:5050';
const LAVA_API_BASE_URL =
  process.env.TRAVEL_ADVISOR_LAVA_API_BASE_URL_PROD ??
  'https://api.lavapayments.com/v1';

if (!LAVA_SECRET_KEY) {
  console.error('ERROR: TRAVEL_ADVISOR_LAVA_SECRET_KEY not found in environment');
  console.error('Run with: doppler run --config prd -- npm start');
  process.exit(1);
}

if (!LAVA_PRODUCT_SECRET) {
  console.error(
    'ERROR: TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_PROD not found in environment'
  );
  console.error('Set the production product secret in Doppler before starting.');
  process.exit(1);
}

if (!LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID) {
  console.error(
    'ERROR: TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD not found in environment'
  );
  console.error('Set the production $10 plan subscription config ID in Doppler.');
  process.exit(1);
}

if (!LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID) {
  console.error(
    'ERROR: TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD not found in environment'
  );
  console.error('Set the production $20 plan subscription config ID in Doppler.');
  process.exit(1);
}

if (!process.env.TRAVEL_ADVISOR_LAVA_SECRET_KEY && process.env.LAVA_SECRET_KEY) {
  console.warn(
    'WARNING: Falling back to LAVA_SECRET_KEY. Set TRAVEL_ADVISOR_LAVA_SECRET_KEY to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_PROD &&
  process.env.LAVA_PRODUCT_SECRET_PROD
) {
  console.warn(
    'WARNING: Falling back to LAVA_PRODUCT_SECRET_PROD. Set TRAVEL_ADVISOR_LAVA_PRODUCT_SECRET_PROD to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD &&
  process.env.LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD
) {
  console.warn(
    'WARNING: Falling back to LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD. Set TRAVEL_ADVISOR_LAVA_PLAN_10_SUBSCRIPTION_CONFIG_ID_PROD to isolate Travel Advisor credentials.'
  );
}
if (
  !process.env.TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD &&
  process.env.LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD
) {
  console.warn(
    'WARNING: Falling back to LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD. Set TRAVEL_ADVISOR_LAVA_PLAN_20_SUBSCRIPTION_CONFIG_ID_PROD to isolate Travel Advisor credentials.'
  );
}

await createTravelAdvisorServer({
  port: PORT,
  logPrefix: '[PROD]',
  checkoutScriptPath: join(__dirname, 'checkout.js'),
  lavaSecretKey: LAVA_SECRET_KEY,
  lavaProductSecret: LAVA_PRODUCT_SECRET,
  lavaApiBaseUrl: LAVA_API_BASE_URL,
  originUrl: ORIGIN_URL,
  authTablePath: join(__dirname, 'auth-users-prod.json'),
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
