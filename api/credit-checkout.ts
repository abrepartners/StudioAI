import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const CREDIT_PACKS: Record<string, { name: string; credits: number; price: number }> = {
  starter: { name: 'StudioAI Starter Pack', credits: 10, price: 1900 },
  pro_pack: { name: 'StudioAI Pro Pack', credits: 25, price: 3900 },
  agency: { name: 'StudioAI Agency Pack', credits: 50, price: 6900 },
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
    const { email, userId, pack, action } = body;

    // Webhook-style callback: add credits after successful payment
    if (action === 'fulfill') {
      const { sessionId } = body;
      if (!sessionId || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        json(res, 400, { ok: false, error: 'Missing params' });
        return;
      }

      // Verify the session is paid
      const session = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
        { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
      ).then(r => r.json());

      if (session.payment_status !== 'paid') {
        json(res, 400, { ok: false, error: 'Payment not completed' });
        return;
      }

      const creditAmount = parseInt(session.metadata?.credits || '0', 10);
      const customerEmail = (session.metadata?.email || session.customer_email || '').toLowerCase();

      if (!creditAmount || !customerEmail) {
        json(res, 400, { ok: false, error: 'Missing credit/email metadata' });
        return;
      }

      // Add credits via Supabase RPC
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_credits`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_email: customerEmail, amount: creditAmount }),
      });

      json(res, 200, { ok: true, credits: creditAmount });
      return;
    }

    // Create checkout session
    if (!email || !userId || !pack) {
      json(res, 400, { ok: false, error: 'email, userId, and pack are required' });
      return;
    }

    const packConfig = CREDIT_PACKS[pack];
    if (!packConfig) {
      json(res, 400, { ok: false, error: `Invalid pack: ${pack}` });
      return;
    }

    const origin = body.returnUrl || 'https://studioai.averyandbryant.com';

    // Find or create customer
    const customers = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json()).catch(() => ({ data: [] }));

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

    // Create one-time checkout session
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
      json(res, 400, { ok: false, error: session.error.message });
      return;
    }

    json(res, 200, { ok: true, url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Credit checkout error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
