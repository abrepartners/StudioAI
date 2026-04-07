import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const TIERS: Record<string, { name: string; price: number; maxSeats: number }> = {
  team:       { name: 'StudioAI Team',       price: 11900, maxSeats: 5 },
  brokerage:  { name: 'StudioAI Brokerage',  price: 29900, maxSeats: 15 },
  enterprise: { name: 'StudioAI Enterprise', price: 69900, maxSeats: 40 },
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

async function supaFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.method === 'PATCH' ? 'return=representation' : (opts.method === 'POST' ? 'return=representation' : 'return=minimal'),
      ...opts.headers,
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

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
    const { adminEmail, tier, brokerageId, couponCode } = body;

    if (!adminEmail || !tier) {
      json(res, 400, { ok: false, error: 'adminEmail and tier are required' });
      return;
    }

    const tierConfig = TIERS[tier];
    if (!tierConfig) {
      json(res, 400, { ok: false, error: `Invalid tier: ${tier}. Use team, brokerage, or enterprise.` });
      return;
    }

    const origin = body.returnUrl || 'https://studioai.averyandbryant.com';

    // Find or create Stripe customer
    const customers = await stripeFetch(
      `/customers/search?query=email:'${encodeURIComponent(adminEmail)}'`
    );

    let customerId: string;
    if (customers.data && customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripeRequest('/customers', {
        email: adminEmail,
        'metadata[studioai_role]': 'brokerage_admin',
        'metadata[brokerage_tier]': tier,
      });
      customerId = customer.id;
    }

    // Check for existing active subscription
    const subs = await stripeFetch(`/subscriptions?customer=${customerId}&status=active`);
    if (subs.data && subs.data.length > 0) {
      json(res, 200, { ok: true, already_subscribed: true });
      return;
    }

    // Find or create the product + price for this tier
    const products = await stripeFetch(
      `/products/search?query=name:'${encodeURIComponent(tierConfig.name)}'`
    );

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
          unit_amount: String(tierConfig.price),
          currency: 'usd',
          'recurring[interval]': 'month',
        });
        priceId = price.id;
      }
    } else {
      const product = await stripeRequest('/products', {
        name: tierConfig.name,
        description: `StudioAI Pro for up to ${tierConfig.maxSeats} agents`,
        'metadata[tier]': tier,
        'metadata[max_seats]': String(tierConfig.maxSeats),
      });
      const price = await stripeRequest('/prices', {
        product: product.id,
        unit_amount: String(tierConfig.price),
        currency: 'usd',
        'recurring[interval]': 'month',
      });
      priceId = price.id;
    }

    // Build checkout session params
    const sessionParams: Record<string, string> = {
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${origin}?checkout=success&tier=${tier}`,
      cancel_url: `${origin}?checkout=cancel`,
      'subscription_data[metadata][studioai_role]': 'brokerage_admin',
      'subscription_data[metadata][brokerage_tier]': tier,
      'subscription_data[metadata][brokerage_id]': brokerageId || '',
      'metadata[brokerage_tier]': tier,
      'allow_promotion_codes': 'true',
    };

    // Apply coupon if provided
    if (couponCode) {
      sessionParams['discounts[0][coupon]'] = couponCode;
      // Remove allow_promotion_codes when using a specific coupon
      delete sessionParams['allow_promotion_codes'];
    }

    const session = await stripeRequest('/checkout/sessions', sessionParams);

    if (session.error) {
      json(res, 400, { ok: false, error: session.error.message });
      return;
    }

    // Update brokerage with tier info and stripe customer ID
    if (brokerageId && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      await supaFetch(`brokerages?id=eq.${brokerageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stripe_customer_id: customerId,
          max_seats: tierConfig.maxSeats,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    json(res, 200, { ok: true, url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Brokerage checkout error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
