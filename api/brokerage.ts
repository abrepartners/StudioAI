import { json, setCors, handleOptions, parseBody } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const TIERS: Record<string, { name: string; price: number; maxSeats: number }> = {
  team:       { name: 'StudioAI Team',       price: 11900, maxSeats: 5 },
  brokerage:  { name: 'StudioAI Brokerage',  price: 29900, maxSeats: 15 },
  enterprise: { name: 'StudioAI Enterprise', price: 69900, maxSeats: 40 },
};

const supaFetch = async (path: string, opts: RequestInit = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': (opts.method === 'POST' || opts.method === 'PATCH') ? 'return=representation' : 'return=minimal',
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

// ─── Checkout (Stripe subscription for the brokerage tier) ───────────────────
async function handleCheckout(body: any, adminEmail: string, res: any) {
  if (!STRIPE_SECRET_KEY) {
    return json(res, 500, { ok: false, error: 'Stripe not configured' });
  }

  const { tier, brokerageId, couponCode } = body;
  if (!tier) {
    return json(res, 400, { ok: false, error: 'tier is required' });
  }

  const tierConfig = TIERS[tier];
  if (!tierConfig) {
    return json(res, 400, { ok: false, error: `Invalid tier: ${tier}. Use team, brokerage, or enterprise.` });
  }

  const origin = body.returnUrl || 'https://studioai.averyandbryant.com';

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

  const subs = await stripeFetch(`/subscriptions?customer=${customerId}&status=active`);
  if (subs.data && subs.data.length > 0) {
    return json(res, 200, { ok: true, already_subscribed: true });
  }

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

  if (couponCode) {
    sessionParams['discounts[0][coupon]'] = couponCode;
    delete sessionParams['allow_promotion_codes'];
  }

  const session = await stripeRequest('/checkout/sessions', sessionParams);

  if (session.error) {
    return json(res, 400, { ok: false, error: session.error.message });
  }

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

  return json(res, 200, { ok: true, url: session.url, sessionId: session.id });
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,DELETE,OPTIONS');
  if (handleOptions(req, res)) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: 'Supabase not configured' });
    return;
  }

  const body = parseBody(req.body);
  const adminEmail = (body.adminEmail || req.query?.adminEmail || '').toLowerCase().trim();

  if (!adminEmail) {
    json(res, 400, { ok: false, error: 'adminEmail is required' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const brokerages = await supaFetch(
        `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=*,brokerage_agents(*)`
      );
      if (!brokerages || brokerages.length === 0) {
        return json(res, 200, { ok: true, brokerage: null });
      }
      return json(res, 200, { ok: true, brokerage: brokerages[0] });
    }

    if (req.method === 'POST') {
      const action = body.action;

      if (action === 'checkout') {
        return await handleCheckout(body, adminEmail, res);
      }

      if (action === 'create') {
        const name = body.name || '';
        if (!name) {
          return json(res, 400, { ok: false, error: 'name is required' });
        }
        const result = await supaFetch('brokerages', {
          method: 'POST',
          body: JSON.stringify({
            name,
            admin_email: adminEmail,
            max_seats: body.maxSeats || 10,
          }),
        });
        return json(res, 200, { ok: true, brokerage: result[0] });
      }

      if (action === 'add_agent') {
        const agentEmail = (body.agentEmail || '').toLowerCase().trim();
        if (!agentEmail) {
          return json(res, 400, { ok: false, error: 'agentEmail is required' });
        }
        const brokerages = await supaFetch(
          `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=id,max_seats`
        );
        if (!brokerages || brokerages.length === 0) {
          return json(res, 404, { ok: false, error: 'No brokerage found for this admin' });
        }
        const brokerage = brokerages[0];
        const agents = await supaFetch(
          `brokerage_agents?brokerage_id=eq.${brokerage.id}&select=id`,
        );
        if (agents && agents.length >= brokerage.max_seats) {
          return json(res, 400, { ok: false, error: `Seat limit reached (${brokerage.max_seats}). Upgrade to add more agents.` });
        }
        const result = await supaFetch('brokerage_agents', {
          method: 'POST',
          body: JSON.stringify({
            brokerage_id: brokerage.id,
            email: agentEmail,
            name: body.agentName || null,
          }),
        });
        return json(res, 200, { ok: true, agent: result[0] });
      }

      if (action === 'remove_agent') {
        const agentEmail = (body.agentEmail || '').toLowerCase().trim();
        if (!agentEmail) {
          return json(res, 400, { ok: false, error: 'agentEmail is required' });
        }
        const brokerages = await supaFetch(
          `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=id`
        );
        if (!brokerages || brokerages.length === 0) {
          return json(res, 404, { ok: false, error: 'No brokerage found' });
        }
        await supaFetch(
          `brokerage_agents?brokerage_id=eq.${brokerages[0].id}&email=eq.${encodeURIComponent(agentEmail)}`,
          { method: 'DELETE' }
        );
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { ok: false, error: 'Unknown action' });
    }

    json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Brokerage API error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
