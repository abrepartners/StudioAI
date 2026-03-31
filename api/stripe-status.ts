import { json, setCors, handleOptions, rejectMethod } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'GET')) return;

  if (!STRIPE_SECRET_KEY) {
    json(res, 500, { ok: false, error: 'Stripe not configured' });
    return;
  }

  try {
    const email = req.query?.email || '';
    if (!email) {
      json(res, 400, { ok: false, error: 'email is required' });
      return;
    }

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    if (!searchRes.data || searchRes.data.length === 0) {
      json(res, 200, { ok: true, subscribed: false, plan: 'free', generationsUsed: 0, generationsLimit: 5 });
      return;
    }

    const customerId = searchRes.data[0].id;

    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    const isSubscribed = subs.data && subs.data.length > 0;
    const subscription = isSubscribed ? subs.data[0] : null;

    json(res, 200, {
      ok: true,
      subscribed: isSubscribed,
      plan: isSubscribed ? 'pro' : 'free',
      customerId,
      subscriptionId: subscription?.id || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      generationsLimit: isSubscribed ? -1 : 5,
    });
  } catch (err: any) {
    console.error('Subscription status error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
