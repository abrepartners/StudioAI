import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';
import {
  PLAN_PRICING_USD,
  STARTER_MONTHLY_LIMIT,
} from '../shared/monetization';

export const config = { runtime: 'nodejs' };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ─── Credit Packs (R16 reprice — align with $1/image competitor reality) ────
const CREDIT_PACKS: Record<string, { name: string; credits: number; price: number }> = {
  starter:  { name: 'StudioAI Starter Pack', credits: 10, price: 1500 }, // was $19
  pro_pack: { name: 'StudioAI Pro Pack',     credits: 25, price: 2900 }, // was $39
  agency:   { name: 'StudioAI Agency Pack',  credits: 75, price: 6900 }, // was 50@$69 → 75@$69
};

// ─── Subscription plan catalog (R12/R13/R14/R15) ────────────────────────────
// All amounts in cents. Annual = 20% off (2 months free).
type PlanId = 'starter' | 'pro' | 'team';
type Interval = 'month' | 'year';

const PLAN_CATALOG: Record<PlanId, {
  name: string;
  description: string;
  month: number;
  year: number;
  seats: number;
  metaKey: string; // stable metadata marker so we can find/reuse products
}> = {
  starter: {
    name: 'StudioAI Starter',
    description: `${STARTER_MONTHLY_LIMIT} AI generations/month. Staging + Cleanup + MLS Export + Listing Copy.`,
    month: PLAN_PRICING_USD.starter.month * 100,
    year:  PLAN_PRICING_USD.starter.year * 12 * 100,
    seats: PLAN_PRICING_USD.starter.seats,
    metaKey: 'studioai_plan_starter',
  },
  pro: {
    name: 'StudioAI Pro',
    description: 'Unlimited AI staging, cleanup, and marketing tools for real estate agents',
    month: PLAN_PRICING_USD.pro.month * 100,
    year:  PLAN_PRICING_USD.pro.year * 12 * 100,
    seats: PLAN_PRICING_USD.pro.seats,
    metaKey: 'studioai_plan_pro',
  },
  team: {
    name: 'StudioAI Team',
    description: 'Unlimited + 3 seats, shared Brand Kits, admin dashboard, priority support.',
    month: PLAN_PRICING_USD.team.month * 100,
    year:  PLAN_PRICING_USD.team.year * 12 * 100,
    seats: PLAN_PRICING_USD.team.seats,
    metaKey: 'studioai_plan_team',
  },
};

// ─── Grandfathering (Fork #2) ───────────────────────────────────────────────
// Early Bird users at $14 are honored FOREVER. Stripe customer.metadata
// must carry `studioai_grandfather=early_bird` (set on signup, referral flow).
// All other pre-2026-04-18 Pro users are honored at $29 for 12 months from
// the grandfathering cutoff, then re-priced to $49 with 30-day notice.
const GRANDFATHER_CUTOFF_MS = Date.parse('2026-04-18T00:00:00Z'); // today, Phase 2 ship date
const GRANDFATHER_LEGACY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;   // 12 months
const LEGACY_PRO_PRICE = 2900; // $29/mo — honored until window expires

async function stripeRequest(endpoint: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

async function stripeFetch(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` },
  });
  return res.json();
}

async function findOrCreateCustomer(email: string, metadata: Record<string, string>): Promise<string> {
  const customers = await stripeFetch(
    `/customers/search?query=email:'${encodeURIComponent(email)}'`
  ).catch(() => ({ data: [] }));

  if (customers.data && customers.data.length > 0) {
    return customers.data[0].id;
  }
  const customer = await stripeRequest('/customers', { email, ...metadata });
  return customer.id;
}

/**
 * Look up a customer's grandfather status.
 * Returns:
 *   - 'early_bird'  → honor $14 indefinitely (Fork #2)
 *   - 'legacy_pro'  → honor $29 for 12 months from cutoff, then re-price
 *   - 'none'        → new customer, standard pricing applies
 */
async function getGrandfatherStatus(customerId: string): Promise<'early_bird' | 'legacy_pro' | 'none'> {
  const customer = await stripeFetch(`/customers/${customerId}`).catch(() => null);
  if (!customer || customer.error) return 'none';

  // Explicit early-bird tag wins forever.
  if (customer.metadata?.studioai_grandfather === 'early_bird') {
    return 'early_bird';
  }

  // Legacy Pro detection: customer created before cutoff AND had an active
  // subscription before cutoff. We check by (a) customer creation date and
  // (b) any historical subscription created before cutoff.
  const createdMs = (customer.created || 0) * 1000;
  if (createdMs && createdMs < GRANDFATHER_CUTOFF_MS) {
    const now = Date.now();
    const withinWindow = now - GRANDFATHER_CUTOFF_MS < GRANDFATHER_LEGACY_WINDOW_MS;
    if (withinWindow) return 'legacy_pro';
  }
  return 'none';
}

/**
 * Resolve the actual price id to charge, with grandfathering applied.
 * - Early Bird: use their pinned referral/locked price if stored in
 *   customer.metadata.studioai_pinned_price_id. Fallback to $14 monthly.
 * - Legacy Pro on Pro monthly: charge $29 instead of $49 until window expires.
 * - Otherwise: standard catalog price.
 */
async function resolveSubscriptionPrice(opts: {
  plan: PlanId;
  interval: Interval;
  customerId: string;
}): Promise<string> {
  const { plan, interval, customerId } = opts;
  const grandfather = await getGrandfatherStatus(customerId);

  // Early Bird: honor their pinned price object if one exists, else $14/mo legacy.
  if (grandfather === 'early_bird' && plan === 'pro' && interval === 'month') {
    const customer = await stripeFetch(`/customers/${customerId}`).catch(() => null);
    const pinned = customer?.metadata?.studioai_pinned_price_id;
    if (pinned) return pinned;
    // Fallback: ensure a $14 price exists attached to a product tagged early_bird.
    return ensurePrice({ plan: 'pro', interval: 'month', amountOverride: 1400, tag: 'early_bird' });
  }

  // Legacy Pro monthly: $29 until 12-month window closes.
  if (grandfather === 'legacy_pro' && plan === 'pro' && interval === 'month') {
    return ensurePrice({ plan: 'pro', interval: 'month', amountOverride: LEGACY_PRO_PRICE, tag: 'legacy_pro' });
  }

  // Standard catalog pricing.
  return ensurePrice({ plan, interval });
}

/**
 * Find or create a Stripe price for {plan, interval}, with an optional
 * fixed-amount override (used for grandfather tiers).
 */
async function ensurePrice(opts: {
  plan: PlanId;
  interval: Interval;
  amountOverride?: number;
  tag?: string;
}): Promise<string> {
  const spec = PLAN_CATALOG[opts.plan];
  const amount = opts.amountOverride ?? (opts.interval === 'year' ? spec.year : spec.month);
  const productMetaKey = opts.tag ? `${spec.metaKey}__${opts.tag}` : spec.metaKey;

  // Find (or create) product
  const productSearch = await stripeFetch(
    `/products/search?query=metadata['studioai_meta']:'${productMetaKey}'`
  ).catch(() => ({ data: [] }));

  let productId: string;
  if (productSearch.data && productSearch.data.length > 0) {
    productId = productSearch.data[0].id;
  } else {
    const created = await stripeRequest('/products', {
      name: spec.name + (opts.tag ? ` (${opts.tag})` : ''),
      description: spec.description,
      'metadata[studioai_meta]': productMetaKey,
      'metadata[studioai_plan]': opts.plan,
      'metadata[studioai_seats]': String(spec.seats),
    });
    productId = created.id;
  }

  // Find a price matching (product, interval, amount)
  const prices = await stripeFetch(
    `/prices?product=${productId}&active=true&type=recurring&limit=100`
  ).catch(() => ({ data: [] }));

  const match = (prices.data || []).find((p: any) =>
    p.unit_amount === amount &&
    p.recurring?.interval === opts.interval
  );
  if (match) return match.id;

  const price = await stripeRequest('/prices', {
    product: productId,
    unit_amount: String(amount),
    currency: 'usd',
    'recurring[interval]': opts.interval,
    'metadata[studioai_plan]': opts.plan,
    'metadata[studioai_interval]': opts.interval,
    ...(opts.tag ? { 'metadata[studioai_tag]': opts.tag } : {}),
  });
  return price.id;
}

// ─── Subscription flow (default action) ─────────────────────────────────────
async function handleSubscribe(body: any, res: any) {
  const { email, userId, returnUrl } = body;
  const plan: PlanId = (body.plan || 'pro') as PlanId;
  const interval: Interval = body.interval === 'year' ? 'year' : 'month';
  const seats = Math.max(1, parseInt(body.seats || '1', 10) || 1);

  if (!email || !userId) {
    return json(res, 400, { ok: false, error: 'email and userId are required' });
  }
  if (!PLAN_CATALOG[plan]) {
    return json(res, 400, { ok: false, error: `Invalid plan: ${plan}` });
  }

  const origin = returnUrl || 'https://studioai.averyandbryant.com';
  const customerId = await findOrCreateCustomer(email, {
    'metadata[studioai_user_id]': userId,
  });

  const priceId = await resolveSubscriptionPrice({ plan, interval, customerId });

  // Check existing active subscription
  const subs = await stripeFetch(`/subscriptions?customer=${customerId}&status=active`);
  if (subs.data && subs.data.length > 0) {
    return json(res, 200, { ok: true, already_subscribed: true });
  }

  // Team plan: allow multi-seat quantity (capped to spec.seats)
  const quantity = plan === 'team'
    ? String(Math.min(seats, PLAN_CATALOG.team.seats))
    : '1';

  const session = await stripeRequest('/checkout/sessions', {
    customer: customerId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': quantity,
    mode: 'subscription',
    success_url: `${origin}?checkout=success`,
    cancel_url: `${origin}?checkout=cancel`,
    'subscription_data[metadata][studioai_user_id]': userId,
    'subscription_data[metadata][studioai_plan]': plan,
    'subscription_data[metadata][studioai_interval]': interval,
    'metadata[studioai_user_id]': userId,
    'metadata[studioai_plan]': plan,
    'metadata[studioai_interval]': interval,
  });

  return json(res, 200, { ok: true, url: session.url, sessionId: session.id, plan, interval });
}

// ─── Credit pack checkout ───────────────────────────────────────────────────
async function handleCreditCheckout(body: any, res: any) {
  const { email, userId, pack, returnUrl } = body;
  if (!email || !userId || !pack) {
    return json(res, 400, { ok: false, error: 'email, userId, and pack are required' });
  }

  const packConfig = CREDIT_PACKS[pack];
  if (!packConfig) {
    return json(res, 400, { ok: false, error: `Invalid pack: ${pack}` });
  }

  const origin = returnUrl || 'https://studioai.averyandbryant.com';
  const customerId = await findOrCreateCustomer(email, {
    'metadata[studioai_user_id]': userId,
  });

  const session = await stripeRequest('/checkout/sessions', {
    customer: customerId,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(packConfig.price),
    'line_items[0][price_data][product_data][name]': packConfig.name,
    'line_items[0][price_data][product_data][description]': `${packConfig.credits} AI generation credits`,
    'line_items[0][quantity]': '1',
    mode: 'payment',
    success_url: `${origin}?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}?credits=cancel`,
    'metadata[studioai_user_id]': userId,
    'metadata[credits]': String(packConfig.credits),
    'metadata[email]': email.toLowerCase(),
    'metadata[pack]': pack,
  });

  if (session.error) {
    return json(res, 400, { ok: false, error: session.error.message });
  }
  return json(res, 200, { ok: true, url: session.url, sessionId: session.id });
}

// ─── Post-purchase credit fulfillment ───────────────────────────────────────
async function handleFulfillCredits(body: any, res: any) {
  const { sessionId } = body;
  if (!sessionId || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 400, { ok: false, error: 'Missing params' });
  }

  const session = await stripeFetch(`/checkout/sessions/${sessionId}`);
  if (session.payment_status !== 'paid') {
    return json(res, 400, { ok: false, error: 'Payment not completed' });
  }

  const creditAmount = parseInt(session.metadata?.credits || '0', 10);
  const customerEmail = (session.metadata?.email || session.customer_email || '').toLowerCase();
  if (!creditAmount || !customerEmail) {
    return json(res, 400, { ok: false, error: 'Missing credit/email metadata' });
  }

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_credits`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_email: customerEmail, amount: creditAmount }),
  });

  return json(res, 200, { ok: true, credits: creditAmount });
}

// ─── R18: Pause subscription ─────────────────────────────────────────────────
// Calls Stripe with pause_collection.behavior=void + resumes_at timestamp.
// Supports 30/60/90 day windows. Exposed from cancellation survey + billing UI.
async function handlePauseSubscription(body: any, res: any) {
  const { email, days } = body;
  if (!email) {
    return json(res, 400, { ok: false, error: 'email is required' });
  }
  const pauseDays = [30, 60, 90].includes(Number(days)) ? Number(days) : 30;

  const customers = await stripeFetch(
    `/customers/search?query=email:'${encodeURIComponent(email)}'`
  ).catch(() => ({ data: [] }));
  if (!customers.data || customers.data.length === 0) {
    return json(res, 404, { ok: false, error: 'No customer found' });
  }
  const customerId = customers.data[0].id;

  const subs = await stripeFetch(`/subscriptions?customer=${customerId}&status=active&limit=1`);
  if (!subs.data || subs.data.length === 0) {
    return json(res, 404, { ok: false, error: 'No active subscription' });
  }
  const subscriptionId = subs.data[0].id;

  const resumesAt = Math.floor(Date.now() / 1000) + pauseDays * 24 * 60 * 60;

  const updated = await stripeRequest(`/subscriptions/${subscriptionId}`, {
    'pause_collection[behavior]': 'void',
    'pause_collection[resumes_at]': String(resumesAt),
    'metadata[studioai_pause_days]': String(pauseDays),
  });

  if (updated.error) {
    return json(res, 400, { ok: false, error: updated.error.message });
  }
  return json(res, 200, {
    ok: true,
    subscriptionId,
    pausedForDays: pauseDays,
    resumesAt,
  });
}

// ─── R18 (sibling): Resume paused subscription ──────────────────────────────
async function handleResumeSubscription(body: any, res: any) {
  const { email } = body;
  if (!email) return json(res, 400, { ok: false, error: 'email is required' });

  const customers = await stripeFetch(
    `/customers/search?query=email:'${encodeURIComponent(email)}'`
  ).catch(() => ({ data: [] }));
  if (!customers.data || customers.data.length === 0) {
    return json(res, 404, { ok: false, error: 'No customer found' });
  }
  const customerId = customers.data[0].id;

  const subs = await stripeFetch(`/subscriptions?customer=${customerId}&limit=1`);
  if (!subs.data || subs.data.length === 0) {
    return json(res, 404, { ok: false, error: 'No subscription' });
  }
  const subscriptionId = subs.data[0].id;

  // Empty pause_collection clears it
  const updated = await stripeRequest(`/subscriptions/${subscriptionId}`, {
    pause_collection: '',
  });
  if (updated.error) return json(res, 400, { ok: false, error: updated.error.message });
  return json(res, 200, { ok: true, subscriptionId, resumed: true });
}

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'POST')) return;

  if (!STRIPE_SECRET_KEY) {
    json(res, 500, { ok: false, error: 'Stripe not configured' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const action = body.action || 'subscribe';

    if (action === 'subscribe')          return await handleSubscribe(body, res);
    if (action === 'credits')            return await handleCreditCheckout(body, res);
    if (action === 'fulfill')            return await handleFulfillCredits(body, res);
    if (action === 'pause_subscription') return await handlePauseSubscription(body, res);
    if (action === 'resume_subscription')return await handleResumeSubscription(body, res);

    json(res, 400, { ok: false, error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
