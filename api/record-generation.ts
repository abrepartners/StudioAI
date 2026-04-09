import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
    const email = body.email;
    if (!email) {
      json(res, 400, { ok: false, error: 'email is required' });
      return;
    }

    // Find or create the Stripe customer
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    let customerId: string;

    if (searchRes.data && searchRes.data.length > 0) {
      customerId = searchRes.data[0].id;
    } else {
      // Create customer so we can track generations
      const createRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `email=${encodeURIComponent(email)}&metadata[generation_period]=${getCurrentPeriod()}&metadata[generations_used]=1`,
      }).then(r => r.json());

      json(res, 200, { ok: true, generationsUsed: 1, period: getCurrentPeriod() });
      return;
    }

    // Check if subscribed (unlimited generations)
    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    if (subs.data && subs.data.length > 0) {
      // Pro user — no limit, just ack
      json(res, 200, { ok: true, generationsUsed: -1, period: getCurrentPeriod() });
      return;
    }

    // Free user — increment server-side counter in customer metadata
    const customer = searchRes.data[0];
    const storedPeriod = customer.metadata?.generation_period || '';
    const currentPeriod = getCurrentPeriod();
    let currentCount = parseInt(customer.metadata?.generations_used || '0', 10);

    // Reset counter if we're in a new billing period
    if (storedPeriod !== currentPeriod) {
      currentCount = 0;
    }

    const newCount = currentCount + 1;

    // Update customer metadata
    await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `metadata[generations_used]=${newCount}&metadata[generation_period]=${currentPeriod}`,
    });

    json(res, 200, { ok: true, generationsUsed: newCount, period: currentPeriod });
  } catch (err: any) {
    console.error('Record generation error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
