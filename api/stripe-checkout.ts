import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

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
    const { email, userId, plan, returnUrl } = body;

    if (!email || !userId) {
      json(res, 400, { ok: false, error: 'email and userId are required' });
      return;
    }

    const origin = returnUrl || req.headers.origin || 'https://studioai.averyandbryant.com';

    const customers = await stripeRequest('/customers/search', {
      query: `email:'${email}'`,
    }).catch(() => ({ data: [] }));

    let customerId: string;
    if (customers.data && customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripeRequest('/customers', {
        email,
        'metadata[studioai_user_id]': userId,
      });
      customerId = customer.id;
    }

    const products = await fetch(
      `https://api.stripe.com/v1/products/search?query=name:'StudioAI Pro'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json()).catch(() => ({ data: [] }));

    let priceId: string;

    if (products.data && products.data.length > 0) {
      const prices = await fetch(
        `https://api.stripe.com/v1/prices?product=${products.data[0].id}&active=true&type=recurring`,
        { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
      ).then(r => r.json());

      if (prices.data && prices.data.length > 0) {
        priceId = prices.data[0].id;
      } else {
        const price = await stripeRequest('/prices', {
          product: products.data[0].id, 'unit_amount': '2900', currency: 'usd', 'recurring[interval]': 'month',
        });
        priceId = price.id;
      }
    } else {
      const product = await stripeRequest('/products', {
        name: 'StudioAI Pro', description: 'Unlimited AI staging, cleanup, and marketing tools for real estate agents',
      });
      const price = await stripeRequest('/prices', {
        product: product.id, 'unit_amount': '2900', currency: 'usd', 'recurring[interval]': 'month',
      });
      priceId = price.id;
    }

    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    if (subs.data && subs.data.length > 0) {
      json(res, 200, { ok: true, already_subscribed: true });
      return;
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

    json(res, 200, { ok: true, url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
