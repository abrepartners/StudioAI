import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs' };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

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
    const { email, returnUrl } = body;

    if (!email) {
      json(res, 400, { ok: false, error: 'email is required' });
      return;
    }

    const origin = returnUrl || 'https://studioai.averyandbryant.com';

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    if (!searchRes.data || searchRes.data.length === 0) {
      json(res, 404, { ok: false, error: 'No customer found' });
      return;
    }

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ customer: searchRes.data[0].id, return_url: origin }).toString(),
    }).then(r => r.json());

    json(res, 200, { ok: true, url: portalRes.url });
  } catch (err: any) {
    console.error('Portal error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
