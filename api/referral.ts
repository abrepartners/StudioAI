import { json, setCors, handleOptions, parseBody } from './utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

const supaFetch = async (path: string, opts: RequestInit = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.method === 'POST' ? 'return=representation' : opts.method === 'PATCH' ? 'return=representation' : 'return=minimal',
      ...opts.headers,
    },
  });
  if (!res.ok && opts.method === 'POST') {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const stripeRequest = async (endpoint: string, body: Record<string, string>) => {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
};

/** Generate a short readable referral code */
const generateCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SAI-';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (handleOptions(req, res)) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: 'Not configured' });
    return;
  }

  const body = parseBody(req.body);

  try {
    if (req.method === 'GET') {
      const action = req.query?.action || '';

      // Get referral info for a user
      if (action === 'my_code') {
        const email = (req.query?.email || '').toLowerCase().trim();
        if (!email) { json(res, 400, { ok: false, error: 'email required' }); return; }

        const codes = await supaFetch(
          `referral_codes?owner_email=eq.${encodeURIComponent(email.toLowerCase())}&select=*`
        );

        const referrals = codes && codes.length > 0
          ? await supaFetch(`referrals?referral_code_id=eq.${codes[0].id}&select=*`)
          : [];

        json(res, 200, {
          ok: true,
          code: codes && codes.length > 0 ? codes[0] : null,
          referrals: referrals || [],
        });
        return;
      }

      // Check early bird availability
      if (action === 'early_bird_status') {
        const slots = await supaFetch('early_bird_slots?id=eq.1&select=*');
        const s = slots && slots[0];
        json(res, 200, {
          ok: true,
          totalSlots: s?.total_slots || 20,
          slotsTaken: s?.slots_taken || 0,
          slotsRemaining: s ? s.total_slots - s.slots_taken : 20,
        });
        return;
      }

      // Validate a referral code
      if (action === 'validate') {
        const code = (req.query?.code || '').toUpperCase().trim();
        if (!code) { json(res, 400, { ok: false, error: 'code required' }); return; }

        const codes = await supaFetch(
          `referral_codes?code=eq.${encodeURIComponent(code)}&select=*`
        );

        if (!codes || codes.length === 0) {
          json(res, 200, { ok: true, valid: false, reason: 'Code not found' });
          return;
        }

        const refCode = codes[0];
        if (refCode.times_used >= refCode.max_uses) {
          json(res, 200, { ok: true, valid: false, reason: 'Code has been fully used' });
          return;
        }

        json(res, 200, {
          ok: true,
          valid: true,
          discountPrice: refCode.discount_price,
          ownerEmail: refCode.owner_email,
        });
        return;
      }

      json(res, 400, { ok: false, error: 'Unknown action' });
      return;
    }

    if (req.method === 'POST') {
      const action = body.action;

      // Claim early bird spot + generate referral code
      if (action === 'claim_early_bird') {
        const email = (body.email || '').toLowerCase().trim();
        if (!email) { json(res, 400, { ok: false, error: 'email required' }); return; }

        // Check slots
        const slots = await supaFetch('early_bird_slots?id=eq.1&select=*');
        const s = slots && slots[0];
        if (!s || s.slots_taken >= s.total_slots) {
          json(res, 200, { ok: false, error: 'All early bird spots are taken' });
          return;
        }

        // Check if already has a code
        const existing = await supaFetch(
          `referral_codes?owner_email=eq.${encodeURIComponent(email)}&select=id`
        );
        if (existing && existing.length > 0) {
          json(res, 200, { ok: false, error: 'You already have a referral code' });
          return;
        }

        // Create referral code
        const code = generateCode();
        const refCode = await supaFetch('referral_codes', {
          method: 'POST',
          body: JSON.stringify({
            owner_email: email,
            code,
            discount_price: 1400,
            max_uses: 5,
            is_early_bird: true,
          }),
        });

        // Increment slots taken
        await supaFetch('early_bird_slots?id=eq.1', {
          method: 'PATCH',
          body: JSON.stringify({ slots_taken: s.slots_taken + 1 }),
        });

        json(res, 200, { ok: true, code: refCode[0] });
        return;
      }

      // Use a referral code (called when someone signs up with a code)
      if (action === 'use_code') {
        const code = (body.code || '').toUpperCase().trim();
        const referredEmail = (body.email || '').toLowerCase().trim();
        if (!code || !referredEmail) {
          json(res, 400, { ok: false, error: 'code and email required' });
          return;
        }

        // Validate code
        const codes = await supaFetch(
          `referral_codes?code=eq.${encodeURIComponent(code)}&select=*`
        );
        if (!codes || codes.length === 0) {
          json(res, 200, { ok: false, error: 'Invalid code' });
          return;
        }

        const refCode = codes[0];
        if (refCode.times_used >= refCode.max_uses) {
          json(res, 200, { ok: false, error: 'Code is fully used' });
          return;
        }

        if (refCode.owner_email === referredEmail) {
          json(res, 200, { ok: false, error: 'Cannot use your own code' });
          return;
        }

        // Check if already referred
        const existingRef = await supaFetch(
          `referrals?referred_email=eq.${encodeURIComponent(referredEmail)}&select=id`
        );
        if (existingRef && existingRef.length > 0) {
          json(res, 200, { ok: false, error: 'This email was already referred' });
          return;
        }

        // Create referral record
        await supaFetch('referrals', {
          method: 'POST',
          body: JSON.stringify({
            referral_code_id: refCode.id,
            referrer_email: refCode.owner_email,
            referred_email: referredEmail,
          }),
        });

        // Increment usage
        await supaFetch(`referral_codes?id=eq.${refCode.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ times_used: refCode.times_used + 1 }),
        });

        json(res, 200, {
          ok: true,
          discountPrice: refCode.discount_price,
          referrerEmail: refCode.owner_email,
        });
        return;
      }

      // Checkout with referral/early bird pricing
      if (action === 'checkout') {
        if (!STRIPE_SECRET_KEY) {
          json(res, 500, { ok: false, error: 'Stripe not configured' });
          return;
        }

        const email = (body.email || '').toLowerCase().trim();
        const userId = body.userId || '';
        const priceInCents = body.price || 2900;
        const origin = body.returnUrl || 'https://studioai.averyandbryant.com';

        if (!email || !userId) {
          json(res, 400, { ok: false, error: 'email and userId required' });
          return;
        }

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

        // Check existing subscription
        const subs = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active`,
          { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
        ).then(r => r.json());

        if (subs.data && subs.data.length > 0) {
          json(res, 200, { ok: true, already_subscribed: true });
          return;
        }

        // Find or create product + price at the right amount
        const productName = priceInCents === 2900 ? 'StudioAI Pro' : `StudioAI Pro (Early Bird)`;
        const products = await fetch(
          `https://api.stripe.com/v1/products/search?query=name:'${encodeURIComponent(productName)}'`,
          { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
        ).then(r => r.json()).catch(() => ({ data: [] }));

        let priceId: string;
        if (products.data && products.data.length > 0) {
          const prices = await fetch(
            `https://api.stripe.com/v1/prices?product=${products.data[0].id}&active=true&type=recurring`,
            { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
          ).then(r => r.json());

          const matchingPrice = prices.data?.find((p: any) => p.unit_amount === priceInCents);
          if (matchingPrice) {
            priceId = matchingPrice.id;
          } else {
            const price = await stripeRequest('/prices', {
              product: products.data[0].id,
              unit_amount: String(priceInCents),
              currency: 'usd',
              'recurring[interval]': 'month',
            });
            priceId = price.id;
          }
        } else {
          const product = await stripeRequest('/products', {
            name: productName,
            description: priceInCents === 2900
              ? 'Unlimited AI staging for real estate agents'
              : 'Early bird unlimited AI staging — locked-in rate',
          });
          const price = await stripeRequest('/prices', {
            product: product.id,
            unit_amount: String(priceInCents),
            currency: 'usd',
            'recurring[interval]': 'month',
          });
          priceId = price.id;
        }

        const session = await stripeRequest('/checkout/sessions', {
          customer: customerId,
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          mode: 'subscription',
          success_url: `${origin}?checkout=success`,
          cancel_url: `${origin}?checkout=cancel`,
          'subscription_data[metadata][studioai_user_id]': userId,
          'subscription_data[metadata][price_locked]': String(priceInCents),
        });

        json(res, 200, { ok: true, url: session.url, sessionId: session.id });
        return;
      }

      json(res, 400, { ok: false, error: 'Unknown action' });
      return;
    }

    json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Referral API error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
