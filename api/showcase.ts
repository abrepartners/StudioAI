import { json, setCors, handleOptions, parseBody } from './utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const ADMIN_DOMAINS = ['averyandbryant.com'];

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
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (handleOptions(req, res)) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: 'Not configured' });
    return;
  }

  try {
    if (req.method === 'GET') {
      // Public: get approved showcases for the landing page
      const limit = parseInt(req.query?.limit || '10', 10);
      const results = await supaFetch(
        `showcase?status=eq.approved&select=id,tool_used,before_image,after_image,room_type,user_name,created_at&order=created_at.desc&limit=${limit}`
      );
      json(res, 200, { ok: true, showcases: results || [] });
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const action = body.action;

      // User submits a showcase
      if (action === 'submit') {
        const { email, name, toolUsed, beforeImage, afterImage, roomType } = body;
        if (!email || !beforeImage || !afterImage || !toolUsed) {
          json(res, 400, { ok: false, error: 'Missing required fields' });
          return;
        }

        // Check image sizes — reject if too large (>10MB base64)
        if (beforeImage.length > 10_000_000 || afterImage.length > 10_000_000) {
          json(res, 400, { ok: false, error: 'Images too large. Try with a smaller photo.' });
          return;
        }

        const result = await supaFetch('showcase', {
          method: 'POST',
          body: JSON.stringify({
            user_email: email.toLowerCase(),
            user_name: name || null,
            tool_used: toolUsed,
            before_image: beforeImage,
            after_image: afterImage,
            room_type: roomType || null,
            status: 'pending',
          }),
        });

        json(res, 200, { ok: true, id: result?.[0]?.id });
        return;
      }

      // Admin: approve/reject
      if (action === 'review') {
        const { adminEmail, showcaseId, status } = body;
        if (!adminEmail || !showcaseId || !status) {
          json(res, 400, { ok: false, error: 'Missing fields' });
          return;
        }

        if (!ADMIN_DOMAINS.some(d => adminEmail.toLowerCase().endsWith(`@${d}`))) {
          json(res, 403, { ok: false, error: 'Not authorized' });
          return;
        }

        if (!['approved', 'rejected'].includes(status)) {
          json(res, 400, { ok: false, error: 'Status must be approved or rejected' });
          return;
        }

        await supaFetch(`showcase?id=eq.${showcaseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });

        json(res, 200, { ok: true });
        return;
      }

      // Admin: list pending
      if (action === 'pending') {
        const { adminEmail } = body;
        if (!adminEmail || !ADMIN_DOMAINS.some(d => adminEmail.toLowerCase().endsWith(`@${d}`))) {
          json(res, 403, { ok: false, error: 'Not authorized' });
          return;
        }

        const results = await supaFetch(
          'showcase?status=eq.pending&select=*&order=created_at.desc&limit=50'
        );
        json(res, 200, { ok: true, showcases: results || [] });
        return;
      }

      json(res, 400, { ok: false, error: 'Unknown action' });
      return;
    }

    json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Showcase API error:', err);
    json(res, 500, { ok: false, error: err.message || 'Internal error' });
  }
}
