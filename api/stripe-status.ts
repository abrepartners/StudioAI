import { json, setCors, handleOptions, rejectMethod } from './utils.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

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
    // Agent is covered if they belong to any brokerage (admin manages billing)
    return agents && agents.length > 0;
  } catch {
    return false;
  }
};

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

    // Check if email is a brokerage agent — grant Pro if so
    const isBrokerageAgent = await checkBrokerageAccess(email);
    if (isBrokerageAgent) {
      json(res, 200, {
        ok: true,
        subscribed: true,
        plan: 'pro',
        brokerageAgent: true,
        generationsLimit: -1,
        generationsUsed: 0,
      });
      return;
    }

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    // Check credit balance from Supabase
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

    if (!searchRes.data || searchRes.data.length === 0) {
      json(res, 200, { ok: true, subscribed: false, plan: credits > 0 ? 'credits' : 'free', generationsUsed: 0, generationsLimit: credits > 0 ? credits : 5, credits });
      return;
    }

    const customer = searchRes.data[0];
    const customerId = customer.id;

    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ':')}` } }
    ).then(r => r.json());

    const isSubscribed = subs.data && subs.data.length > 0;
    const subscription = isSubscribed ? subs.data[0] : null;

    // Read server-side generation count from Stripe customer metadata
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const storedPeriod = customer.metadata?.generation_period || '';
    const generationsUsed = storedPeriod === currentPeriod
      ? parseInt(customer.metadata?.generations_used || '0', 10)
      : 0;

    json(res, 200, {
      ok: true,
      subscribed: isSubscribed,
      plan: isSubscribed ? 'pro' : (credits > 0 ? 'credits' : 'free'),
      customerId,
      credits,
      subscriptionId: subscription?.id || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      generationsLimit: isSubscribed ? -1 : 5,
      generationsUsed,
    });
  } catch (err: any) {
    console.error('Subscription status error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
