import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs' };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const FREE_LIFETIME_CAP = 5;

function getCurrentDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Increment lifetime free-gens counter in Supabase for a given email.
 * Returns the new lifetime count. Idempotent via RPC if present, else upserts.
 */
async function bumpLifetimeFreeGens(email: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return 0;
  try {
    // Prefer RPC if schema includes it (created in migration).
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_lifetime_free_gens`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_email: email.toLowerCase() }),
    });
    if (rpc.ok) {
      const out = await rpc.json();
      if (typeof out === 'number') return out;
      if (out && typeof out.lifetime_free_gens_used === 'number') return out.lifetime_free_gens_used;
    }
    // Fallback: read-then-write (non-atomic, acceptable for free-tier bookkeeping).
    const readRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=lifetime_free_gens_used`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    ).then(r => r.json());
    const current = (readRes && readRes[0]?.lifetime_free_gens_used) || 0;
    const next = current + 1;
    await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase())}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ lifetime_free_gens_used: next }),
      }
    );
    return next;
  } catch {
    return 0;
  }
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

    // Log to generation_logs for the usage dashboard. Non-fatal — Supabase is
    // best-effort; Stripe counting below is the source of truth for billing.
    try {
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        const tool = (body.tool || 'stage').toLowerCase();
        const model = (body.model || 'gemini-3.1-flash-image-preview').toLowerCase();
        // Cost estimates in cents. Public Gemini rates (approx 2026-04):
        //   gemini-3-flash-preview (text/vision): 0.2¢
        //   gemini-3.1-flash-image-preview: 4¢
        //   gemini-3-pro-image-preview: 10¢
        let cost = 4;
        if (model.includes('flash-preview') && !model.includes('image')) cost = 0; // text, effectively free
        else if (model.includes('pro-image')) cost = 10;
        const source = (body.source || 'app').toLowerCase();
        await fetch(`${SUPABASE_URL}/rest/v1/generation_logs`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            user_email: email.toLowerCase(),
            tool, model, estimated_cost_cents: cost, source,
          }),
        });
      }
    } catch (logErr) {
      console.warn('[record-generation] usage log failed (non-fatal):', logErr);
    }

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    let customerId: string;
    let customer: any = null;

    if (searchRes.data && searchRes.data.length > 0) {
      customer = searchRes.data[0];
      customerId = customer.id;
    } else {
      // Create customer so we can track generations
      const created = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `email=${encodeURIComponent(email)}&metadata[generation_period]=${getCurrentDay()}&metadata[generations_used]=1`,
      }).then(r => r.json());
      customerId = created.id;

      // First-ever gen for this email — lifetime counter goes to 1.
      const lifetime = await bumpLifetimeFreeGens(email);
      json(res, 200, {
        ok: true,
        generationsUsed: 1,
        period: getCurrentDay(),
        lifetimeFreeGensUsed: lifetime,
      });
      return;
    }

    // Check for active subscription + plan
    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    const sub = subs.data && subs.data[0];
    const plan = sub?.metadata?.studioai_plan || sub?.items?.data?.[0]?.price?.metadata?.studioai_plan || (sub ? 'pro' : null);

    // Pro / Team: unlimited — just acknowledge.
    if (plan === 'pro' || plan === 'team') {
      json(res, 200, { ok: true, generationsUsed: -1, period: getCurrentDay() });
      return;
    }

    // Starter: monthly-metered cap (40/mo).
    if (plan === 'starter') {
      const storedPeriod = customer.metadata?.generation_period || '';
      const currentMonth = getCurrentMonth();
      let currentCount = parseInt(customer.metadata?.generations_used || '0', 10);
      if (storedPeriod !== currentMonth) currentCount = 0;
      const newCount = currentCount + 1;
      await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `metadata[generations_used]=${newCount}&metadata[generation_period]=${currentMonth}`,
      });
      json(res, 200, { ok: true, generationsUsed: newCount, period: currentMonth, plan });
      return;
    }

    // Free tier — Fork #3: 5 lifetime, then 1/day.
    // Bump lifetime counter first.
    const lifetime = await bumpLifetimeFreeGens(email);

    // If still within the lifetime allowance, we don't also count it against
    // the daily window (lifetime phase takes precedence).
    if (lifetime <= FREE_LIFETIME_CAP) {
      json(res, 200, {
        ok: true,
        generationsUsed: lifetime,
        period: getCurrentDay(),
        lifetimeFreeGensUsed: lifetime,
      });
      return;
    }

    // Post-lifetime: track 1/day in Stripe customer metadata.
    const storedPeriod = customer.metadata?.generation_period || '';
    const currentDay = getCurrentDay();
    let currentCount = parseInt(customer.metadata?.generations_used || '0', 10);
    if (storedPeriod !== currentDay) currentCount = 0;
    const newCount = currentCount + 1;

    await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `metadata[generations_used]=${newCount}&metadata[generation_period]=${currentDay}`,
    });

    json(res, 200, {
      ok: true,
      generationsUsed: newCount,
      period: currentDay,
      lifetimeFreeGensUsed: lifetime,
    });
  } catch (err: any) {
    console.error('Record generation error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
