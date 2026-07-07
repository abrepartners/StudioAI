import {
  json,
  setCors,
  handleOptions,
  rejectMethod,
  parseBody,
} from "./utils.js";
import { pushSignupToGhl } from "./_lib/ghl.js";

export const config = { runtime: "nodejs" };

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

export default async function handler(req: any, res: any) {
  setCors(res, "POST,OPTIONS");
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, "POST")) return;

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

    // Detect a first-time signup BEFORE the upsert: no existing row means this
    // is the first login. That is the once-per-user signal for the GHL push, so
    // the studioai-signup tag (and its welcome workflow) fires exactly once. On
    // any uncertainty (lookup error) we default to "not new" so we never re-tag
    // an existing user.
    let isNewUser = false;
    try {
      const lookup = await fetch(
        `${SUPABASE_URL}/rest/v1/users?google_id=eq.${encodeURIComponent(
          googleId,
        )}&select=google_id&limit=1`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (lookup.ok) {
        const rows = await lookup.json();
        isNewUser = Array.isArray(rows) && rows.length === 0;
      }
    } catch {
      isNewUser = false;
    }

    // Upsert — insert if new, update last_login + increment count if existing
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
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
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_login`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_google_id: googleId }),
      });
    }

    // First login only: push the new signup into GHL once so its welcome +
    // nurture workflow (trigger: contact tagged studioai-signup) takes over.
    // Fail-open (unset token / API error never throws). We await here rather
    // than truly fire-and-forget because a serverless function can freeze after
    // the response, dropping un-awaited work; the client treats this endpoint
    // as fire-and-forget (it ignores the response), so awaiting never blocks
    // login UX.
    if (isNewUser && upsertRes.ok) {
      await pushSignupToGhl({ email, name });
    }

    json(res, 200, { ok: true });
  } catch {
    json(res, 200, { ok: true }); // Never block login on tracking failure
  }
}
