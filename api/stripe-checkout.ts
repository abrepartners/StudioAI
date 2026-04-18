import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs' };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const CREDIT_PACKS: Record<string, { name: string; credits: number; price: number }> = {
  starter:  { name: 'StudioAI Starter Pack', credits: 10, price: 1900 },
  pro_pack: { name: 'StudioAI Pro Pack',     credits: 25, price: 3900 },
  agency:   { name: 'StudioAI Agency Pack',  credits: 50, price: 6900 },
};

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

// ─── Subscription flow (default action) ─────────────────────────────────────
async function handleSubscribe(body: any, res: any) {
  const { email, userId, returnUrl } = body;
  if (!email || !userId) {
    return json(res, 400, { ok: false, error: 'email and userId are required' });
  }

  const origin = returnUrl || 'https://studioai.averyandbryant.com';
  const customerId = await findOrCreateCustomer(email, {
    'metadata[studioai_user_id]': userId,
  });

  // Find or create Pro product/price
  const products = await stripeFetch(`/products/search?query=name:'StudioAI Pro'`)
    .catch(() => ({ data: [] }));

  let priceId: string;
  if (products.data && products.data.length > 0) {
    const prices = await stripeFetch(
      `/prices?product=${products.data[0].id}&active=true&type=recurring`
    );
    if (prices.data && prices.data.length > 0) {
      priceId = prices.data[0].id;
    } else {
      const price = await stripeRequest('/prices', {
        product: products.data[0].id,
        unit_amount: '2900',
        currency: 'usd',
        'recurring[interval]': 'month',
      });
      priceId = price.id;
    }
  } else {
    const product = await stripeRequest('/products', {
      name: 'StudioAI Pro',
      description: 'Unlimited AI staging, cleanup, and marketing tools for real estate agents',
    });
    const price = await stripeRequest('/prices', {
      product: product.id,
      unit_amount: '2900',
      currency: 'usd',
      'recurring[interval]': 'month',
    });
    priceId = price.id;
  }

  // Check existing active subscription
  const subs = await stripeFetch(`/subscriptions?customer=${customerId}&status=active`);
  if (subs.data && subs.data.length > 0) {
    return json(res, 200, { ok: true, already_subscribed: true });
  }

  const session = await stripeRequest('/checkout/sessions', {
    customer: customerId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: `${origin}?checkout=success`,
    cancel_url: `${origin}?checkout=cancel`,
    'subscription_data[metadata][studioai_user_id]': userId,
    'metadata[studioai_user_id]': userId,
  });

  return json(res, 200, { ok: true, url: session.url, sessionId: session.id });
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

    if (action === 'subscribe') return await handleSubscribe(body, res);
    if (action === 'credits')   return await handleCreditCheckout(body, res);
    if (action === 'fulfill')   return await handleFulfillCredits(body, res);

    json(res, 400, { ok: false, error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
