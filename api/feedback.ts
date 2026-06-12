import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

/**
 * Accepts feedback / feature suggestions from the What's New panel and the
 * legacy BetaFeedbackForm (which already POSTs here as its fallback). Lenient
 * payload — whichever of message/details/title is present becomes the body.
 *
 * Backing table (run once in Supabase if it doesn't exist):
 *   create table if not exists feedback (
 *     id uuid primary key default gen_random_uuid(),
 *     created_at timestamptz not null default now(),
 *     email text, name text, message text not null,
 *     category text, source text, context jsonb
 *   );
 *   alter table feedback enable row level security;  -- service key only
 */
export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'POST')) return;

  try {
    const body = parseBody(req.body);
    const message = String(body.message || body.details || body.title || '').trim();
    if (!message) {
      json(res, 400, { ok: false, error: 'Empty message' });
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      // Same posture as track-login: never surface infra gaps to the client.
      console.error('feedback: SUPABASE_URL / SUPABASE_SERVICE_KEY not set — suggestion dropped');
      json(res, 200, { ok: true });
      return;
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: (body.email || body.contact) ? String(body.email || body.contact).toLowerCase().slice(0, 200) : null,
        name: body.name ? String(body.name).slice(0, 200) : null,
        message: message.slice(0, 4000),
        category: body.category ? String(body.category).slice(0, 100) : null,
        source: body.source ? String(body.source).slice(0, 100) : 'app',
        context: body.context ?? null,
      }),
    });

    if (!insertRes.ok) {
      console.error('feedback: insert failed', insertRes.status, await insertRes.text());
    }
    json(res, 200, { ok: true });
  } catch (err) {
    console.error('feedback: error', err);
    json(res, 200, { ok: true });
  }
}
