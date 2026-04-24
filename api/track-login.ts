import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'POST')) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 200, { ok: true }); // Fail silently — don't block login
    return;
  }

  try {
    const body = parseBody(req.body);
    const { googleId, email, name, picture } = body;

    if (!googleId || !email) {
      json(res, 200, { ok: true });
      return;
    }

    // Upsert — insert if new, update last_login + increment count if existing
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        google_id: googleId,
        email: email.toLowerCase(),
        name,
        picture,
        last_login: new Date().toISOString(),
      }),
    });

    // If user already exists, increment login_count
    if (upsertRes.ok) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/increment_login`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_google_id: googleId }),
        }
      );
    }

    json(res, 200, { ok: true });
  } catch {
    json(res, 200, { ok: true }); // Never block login on tracking failure
  }
}
