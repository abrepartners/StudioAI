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

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  const cfgErr = sessionConfigError();
  if (cfgErr) {
    console.error(`[session] ${cfgErr}`);
    json(res, 503, { ok: false, error: "auth not configured" });
    return;
  }

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
