import { json, setCors, handleOptions, rejectMethod } from './utils.js';

export const config = { runtime: 'nodejs' };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const FREE_LIFETIME_CAP = 5;
const FREE_DAILY_LIMIT_AFTER_LIFETIME = 1;
const STARTER_MONTHLY_LIMIT = 40;

/** Check if email belongs to a brokerage agent with an active subscription */
const checkBrokerageAccess = async (email: string): Promise<boolean> => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/brokerage_agents?email=eq.${encodeURIComponent(email.toLowerCase())}&select=brokerage_id,brokerages(admin_email,stripe_subscription_id)`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) return false;
    const agents = await res.json();
    return agents && agents.length > 0;
  } catch {
    return false;
  }
};

/** Fetch the per-user lifetime free-gens counter from Supabase `users` row. */
async function getLifetimeFreeGensUsed(email: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return 0;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=lifetime_free_gens_used`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    ).then(r => r.json());
    if (r && r[0] && typeof r[0].lifetime_free_gens_used === 'number') {
      return r[0].lifetime_free_gens_used;
    }
    return 0;
  } catch { return 0; }
}

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

    // Brokerage agents get Pro unlimited regardless of their own sub.
    const isBrokerageAgent = await checkBrokerageAccess(email);
    if (isBrokerageAgent) {
      json(res, 200, {
        ok: true,
        subscribed: true,
        plan: 'pro',
        brokerageAgent: true,
        generationsLimit: -1,
        generationsUsed: 0,
        lifetimeFreeGensUsed: 0,
        lifetimeFreeGensCap: FREE_LIFETIME_CAP,
      });
      return;
    }

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    // Credits + lifetime free-gens from Supabase
    let credits = 0;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const creditRes = await fetch(
          `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=credits`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        ).then(r => r.json());
        if (creditRes && creditRes[0]) credits = creditRes[0].credits || 0;
      } catch {}
    }
    const lifetimeFreeGensUsed = await getLifetimeFreeGensUsed(email);

    // Free-tier response (no Stripe customer exists yet)
    if (!searchRes.data || searchRes.data.length === 0) {
      const lifetimeRemaining = Math.max(0, FREE_LIFETIME_CAP - lifetimeFreeGensUsed);
      const limit = lifetimeRemaining > 0
        ? FREE_LIFETIME_CAP
        : FREE_DAILY_LIMIT_AFTER_LIFETIME;
      json(res, 200, {
        ok: true,
        subscribed: false,
        plan: credits > 0 ? 'credits' : 'free',
        generationsUsed: lifetimeRemaining > 0 ? lifetimeFreeGensUsed : 0,
        generationsLimit: credits > 0 ? credits : limit,
        credits,
        lifetimeFreeGensUsed,
        lifetimeFreeGensCap: FREE_LIFETIME_CAP,
      });
      return;
    }

    const customer = searchRes.data[0];
    const customerId = customer.id;

    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active,past_due,paused&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    const isSubscribed = subs.data && subs.data.length > 0;
    const subscription = isSubscribed ? subs.data[0] : null;
    const subPlan = (subscription?.metadata?.studioai_plan || subscription?.items?.data?.[0]?.price?.metadata?.studioai_plan || 'pro') as 'starter' | 'pro' | 'team';
    const interval = (subscription?.items?.data?.[0]?.price?.recurring?.interval || 'month') as 'month' | 'year';
    const seats = parseInt(subscription?.items?.data?.[0]?.price?.product?.metadata?.studioai_seats || '1', 10);
    const pausedUntil = subscription?.pause_collection?.resumes_at || null;

    // Decide generations window per plan.
    let generationsUsed = 0;
    let generationsLimit = -1;

    const now = new Date();
    const currentDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storedPeriod = customer.metadata?.generation_period || '';
    const rawUsed = parseInt(customer.metadata?.generations_used || '0', 10);

    if (isSubscribed && subPlan === 'starter') {
      // Metered monthly cap. Reset when month changes.
      generationsLimit = STARTER_MONTHLY_LIMIT;
      generationsUsed = storedPeriod === currentMonth ? rawUsed : 0;
    } else if (isSubscribed && (subPlan === 'pro' || subPlan === 'team')) {
      generationsLimit = -1;
      generationsUsed = 0;
    } else {
      // No sub — free tier, two-phase per Fork #3.
      const lifetimeRemaining = Math.max(0, FREE_LIFETIME_CAP - lifetimeFreeGensUsed);
      if (lifetimeRemaining > 0) {
        generationsLimit = FREE_LIFETIME_CAP;
        generationsUsed = lifetimeFreeGensUsed;
      } else {
        generationsLimit = FREE_DAILY_LIMIT_AFTER_LIFETIME;
        generationsUsed = storedPeriod === currentDay ? rawUsed : 0;
      }
    }

    const plan: 'free' | 'starter' | 'pro' | 'team' | 'credits' =
      isSubscribed ? subPlan : (credits > 0 ? 'credits' : 'free');

    json(res, 200, {
      ok: true,
      subscribed: isSubscribed,
      plan,
      customerId,
      credits,
      subscriptionId: subscription?.id || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      generationsLimit,
      generationsUsed,
      lifetimeFreeGensUsed,
      lifetimeFreeGensCap: FREE_LIFETIME_CAP,
      interval,
      seats,
      pausedUntil,
    });
  } catch (err: any) {
    console.error('Subscription status error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
