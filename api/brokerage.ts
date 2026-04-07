import { json, setCors, handleOptions, parseBody } from './utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supaFetch = async (path: string, opts: RequestInit = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.method === 'POST' ? 'return=representation' : 'return=minimal',
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
      // Get brokerage + agents for this admin
      const brokerages = await supaFetch(
        `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=*,brokerage_agents(*)`
      );

      if (!brokerages || brokerages.length === 0) {
        json(res, 200, { ok: true, brokerage: null });
        return;
      }

      json(res, 200, { ok: true, brokerage: brokerages[0] });
      return;
    }

    if (req.method === 'POST') {
      const action = body.action;

      if (action === 'create') {
        // Create a new brokerage
        const name = body.name || '';
        if (!name) {
          json(res, 400, { ok: false, error: 'name is required' });
          return;
        }

        const result = await supaFetch('brokerages', {
          method: 'POST',
          body: JSON.stringify({
            name,
            admin_email: adminEmail,
            max_seats: body.maxSeats || 10,
          }),
        });

        json(res, 200, { ok: true, brokerage: result[0] });
        return;
      }

      if (action === 'add_agent') {
        const agentEmail = (body.agentEmail || '').toLowerCase().trim();
        if (!agentEmail) {
          json(res, 400, { ok: false, error: 'agentEmail is required' });
          return;
        }

        // Get brokerage
        const brokerages = await supaFetch(
          `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=id,max_seats`
        );
        if (!brokerages || brokerages.length === 0) {
          json(res, 404, { ok: false, error: 'No brokerage found for this admin' });
          return;
        }

        const brokerage = brokerages[0];

        // Check seat limit
        const agents = await supaFetch(
          `brokerage_agents?brokerage_id=eq.${brokerage.id}&select=id`,
        );
        if (agents && agents.length >= brokerage.max_seats) {
          json(res, 400, { ok: false, error: `Seat limit reached (${brokerage.max_seats}). Upgrade to add more agents.` });
          return;
        }

        // Add agent
        const result = await supaFetch('brokerage_agents', {
          method: 'POST',
          body: JSON.stringify({
            brokerage_id: brokerage.id,
            email: agentEmail,
            name: body.agentName || null,
          }),
        });

        json(res, 200, { ok: true, agent: result[0] });
        return;
      }

      if (action === 'remove_agent') {
        const agentEmail = (body.agentEmail || '').toLowerCase().trim();
        if (!agentEmail) {
          json(res, 400, { ok: false, error: 'agentEmail is required' });
          return;
        }

        // Get brokerage
        const brokerages = await supaFetch(
          `brokerages?admin_email=eq.${encodeURIComponent(adminEmail)}&select=id`
        );
        if (!brokerages || brokerages.length === 0) {
          json(res, 404, { ok: false, error: 'No brokerage found' });
          return;
        }

        await supaFetch(
          `brokerage_agents?brokerage_id=eq.${brokerages[0].id}&email=eq.${encodeURIComponent(agentEmail)}`,
          { method: 'DELETE' }
        );

        json(res, 200, { ok: true });
        return;
      }

      json(res, 400, { ok: false, error: 'Unknown action' });
      return;
    }

    json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Brokerage API error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
