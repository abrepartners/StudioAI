/**
 * api/session.ts — the login exchange.
 *
 * The client posts the raw Google Identity Services `credential` (the signed
 * JWT from the sign-in callback). We verify it ONCE against Google's JWKS,
 * mint a 7-day StudioAI session, and set it as an HttpOnly cookie. From then on
 * every same-origin /api/* call carries the session automatically — the Google
 * token's 1-hour expiry never touches the API surface again.
 *
 * Also folds in the user upsert that /api/track-login did, so login is one call.
 */
import { json, handleOptions, rejectMethod, parseBody } from "./utils.js";
import { applyCors } from "./_lib/auth-middleware.js";
import {
  verifyGoogleIdToken,
  signSession,
  sessionCookieHeader,
  sessionConfigError,
  verifySession,
  readSessionCookie,
} from "./_lib/session.js";

export const config = { runtime: "nodejs" };

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

async function upsertUser(u: {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        google_id: u.sub,
        email: u.email.toLowerCase(),
        name: u.name,
        picture: u.picture,
        last_login: new Date().toISOString(),
      }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_login`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_google_id: u.sub }),
    }).catch(() => {});
  } catch (err) {
    console.warn("[session] user upsert failed (non-fatal):", err);
  }
}

/**
 * GET /api/session — restore a login from the session cookie alone.
 *
 * This is what lets a returning user come back without re-clicking Google. The
 * 7-day HttpOnly cookie is set at login but the client can't read it (that's the
 * point — HttpOnly), so before this endpoint the only signal the app had for
 * "logged in" was a localStorage key. Any browser that clears localStorage
 * (managed/enterprise like Keller Williams, Safari's ITP, incognito, a second
 * device) dropped the user to a full re-login even while holding a valid
 * cookie. Now the app asks here first.
 *
 * The token carries only { email, sub }; name/picture come from the users row
 * (written on every login upsert). Sliding refresh re-issues the cookie so an
 * active user never hard-expires at the 7-day mark.
 */
async function handleRestore(req: any, res: any) {
  const token = readSessionCookie(req);
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    json(res, 401, { ok: false, error: "no session" });
    return;
  }

  let name: string | null = null;
  let picture: string | null = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const rows = await fetch(
        `${SUPABASE_URL}/rest/v1/users?google_id=eq.${encodeURIComponent(
          claims.sub,
        )}&select=name,picture&limit=1`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        },
      ).then((r) => r.json());
      if (Array.isArray(rows) && rows[0]) {
        name = rows[0].name ?? null;
        picture = rows[0].picture ?? null;
      }
    } catch {
      /* non-fatal — restore still succeeds with email+sub */
    }
  }

  // Sliding refresh: re-mint so an active session never hard-expires.
  try {
    const fresh = await signSession({ email: claims.email, sub: claims.sub });
    res.setHeader("Set-Cookie", sessionCookieHeader(fresh));
  } catch {
    /* non-fatal — the existing cookie is still valid */
  }

  json(res, 200, {
    ok: true,
    user: { email: claims.email, sub: claims.sub, name, picture },
  });
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "GET,POST,OPTIONS")) return;

  const cfgErr = sessionConfigError();
  if (cfgErr) {
    console.error(`[session] ${cfgErr}`);
    json(res, 503, { ok: false, error: "auth not configured" });
    return;
  }

  if (req.method === "GET") return handleRestore(req, res);
  if (rejectMethod(req, res, "POST")) return;

  try {
    const body = parseBody(req.body);
    const credential = body.credential;
    if (!credential || typeof credential !== "string") {
      json(res, 400, { ok: false, error: "credential is required" });
      return;
    }

    let identity;
    try {
      identity = await verifyGoogleIdToken(credential);
    } catch (err: any) {
      console.warn("[session] google token rejected:", err?.message);
      json(res, 401, { ok: false, error: "invalid Google token" });
      return;
    }

    const token = await signSession({
      email: identity.email,
      sub: identity.sub,
    });
    res.setHeader("Set-Cookie", sessionCookieHeader(token));

    // Fire-and-forget the analytics upsert; don't block login on it.
    upsertUser(identity).catch(() => {});

    json(res, 200, {
      ok: true,
      user: {
        email: identity.email,
        sub: identity.sub,
        name: identity.name || null,
        picture: identity.picture || null,
      },
    });
  } catch (err: any) {
    console.error("[session] error:", err?.message || err);
    json(res, 500, { ok: false, error: "session error" });
  }
}
