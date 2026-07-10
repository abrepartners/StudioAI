/**
 * api/_lib/auth-middleware.ts — the gate every generation endpoint runs first.
 *
 * requireSession is the primary control that closes the anonymous-access hole:
 * it reads the HttpOnly session cookie, verifies it, and returns the caller's
 * identity — or writes a 401 and returns null. Because the session is a cookie
 * and SameSite=Lax, a cross-origin site's fetch can't smuggle it, so the old
 * wildcard-CORS exposure is defanged; the origin-aware CORS below is
 * defense-in-depth, not the primary control.
 */
import {
  readSessionCookie,
  verifySession,
  sessionConfigError,
  sessionCookieHeader,
  signSession,
  type SessionClaims,
} from "./session.js";
import { timingSafeEqual } from "node:crypto";

const APP_ORIGINS = [
  "https://studioai.averyandbryant.com",
  "http://localhost:3000",
  "http://localhost:3100",
];

/** True for our own app origins and any Vercel preview for this project. */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (APP_ORIGINS.includes(origin)) return true;
  // Vercel preview deploys: https://studioai-<hash>-abrepartners.vercel.app
  return /^https:\/\/studioai-[a-z0-9-]+-abrepartners\.vercel\.app$/.test(
    origin,
  );
}

/** Origin-aware CORS: echo an allowlisted origin (never a bare wildcard for
 *  credentialed requests) + Vary: Origin. Handles the OPTIONS preflight. */
export function applyCors(
  req: any,
  res: any,
  methods: string = "POST,OPTIONS",
): boolean {
  const origin = req.headers?.origin || "";
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

const ENFORCE = process.env.AUTH_ENFORCE !== "log-only";

/**
 * Require a valid session. Returns the caller's claims, or null after writing a
 * 401. When AUTH_ENFORCE=log-only, an unauthenticated request is logged but
 * allowed through with a synthetic anon identity — used for the rollout window
 * to observe traffic shape before hard-blocking. Fail-closed 503 if the server
 * is missing its signing secret (never silently allow when misconfigured).
 */
export async function requireSession(
  req: any,
  res: any,
): Promise<SessionClaims | null> {
  const cfgErr = sessionConfigError();
  if (cfgErr) {
    res.status(503);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify({ ok: false, error: `auth misconfigured` }));
    console.error(`[auth] ${cfgErr}`);
    return null;
  }

  const token = readSessionCookie(req);
  const claims = token ? await verifySession(token) : null;

  if (!claims) {
    if (!ENFORCE) {
      console.warn(
        "[auth] log-only: unauthenticated request allowed through (rollout window)",
      );
      return { email: "anon@log-only.local", sub: "log-only" };
    }
    res.status(401);
    res.setHeader("Content-Type", "application/json");
    res.send(
      JSON.stringify({
        ok: false,
        error: "authentication required",
        code: "auth_required",
      }),
    );
    return null;
  }
  return claims;
}

/** Constant-time string compare that tolerates length mismatch. */
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Accept EITHER a machine service key OR a valid user session. A request whose
 * `x-service-key` header matches SERVICE_API_KEY is authorized as a synthetic
 * service identity (`service: true`), so our own agents/pipelines can call the
 * staging engine headlessly without a browser login. DORMANT until
 * SERVICE_API_KEY is set in the env — with no secret provisioned this behaves
 * exactly like requireSession, so existing traffic is unaffected.
 */
export async function requireServiceOrSession(
  req: any,
  res: any,
): Promise<(SessionClaims & { service?: boolean }) | null> {
  const svcKey = process.env.SERVICE_API_KEY || "";
  const provided = String(req.headers?.["x-service-key"] || "");
  if (svcKey && provided && safeEq(provided, svcKey)) {
    return { email: "service@vellum.local", sub: "service", service: true };
  }
  return requireSession(req, res);
}

/** Re-export so endpoints can mint a fresh cookie on a sliding refresh. */
export { sessionCookieHeader, signSession };
