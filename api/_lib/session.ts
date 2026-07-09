/**
 * api/_lib/session.ts — server-only auth session primitives.
 *
 * The app used to treat the Google Identity Services ID token as if it were
 * an API credential, but the client discards that token right after login and
 * it expires in ~1 hour with no refresh. Instead we verify the Google token
 * ONCE at login, then mint our own StudioAI session (7-day HS256 JWT) delivered
 * as an HttpOnly cookie. Same-origin /api/* calls send the cookie automatically,
 * so no per-request Bearer threading through the service layer is needed.
 *
 * Never import this from client code — it uses the SESSION_SECRET.
 */
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const GOOGLE_CLIENT_ID =
  process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

export const SESSION_COOKIE = "studioai_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
// Re-issue the cookie when the session is more than half-consumed, so an
// active user never hits a hard expiry mid-listing.
const SESSION_REFRESH_AFTER_SECONDS = Math.floor(SESSION_TTL_SECONDS / 2);

// Google's JWKS — createRemoteJWKSet caches keys and refetches on unknown kid,
// so key rotation is handled without a full outage.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface SessionClaims {
  email: string;
  sub: string;
}

/** True once at boot if the server is missing the secret it needs to sign
 *  sessions. Endpoints treat a misconfigured server as fail-closed (503),
 *  never fail-open. */
export function sessionConfigError(): string | null {
  if (!SESSION_SECRET) return "SESSION_SECRET not configured";
  if (!GOOGLE_CLIENT_ID) return "VITE_GOOGLE_CLIENT_ID not configured";
  return null;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(SESSION_SECRET);
}

/**
 * Verify a raw Google Identity Services ID token (the `credential` from the
 * sign-in callback). Validates signature against Google's JWKS plus issuer,
 * audience, expiry, and email_verified. Returns the identity or throws.
 */
export async function verifyGoogleIdToken(
  credential: string,
): Promise<{ email: string; sub: string; name?: string; picture?: string }> {
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: GOOGLE_CLIENT_ID,
  });
  const email = typeof payload.email === "string" ? payload.email : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!email || !sub) throw new Error("Google token missing email/sub");
  if (payload.email_verified === false) {
    throw new Error("Google email not verified");
  }
  return {
    email: email.toLowerCase(),
    sub,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

/** Sign a StudioAI session JWT for the given identity. */
export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, sub: claims.sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Verify a StudioAI session JWT. Returns claims or null (expired/invalid). */
export async function verifySession(
  token: string,
): Promise<SessionClaims | null> {
  if (!token || !SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const email = typeof payload.email === "string" ? payload.email : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!email) return null;
    return { email, sub };
  } catch {
    return null;
  }
}

/** True when a session should be silently re-issued (past the halfway mark). */
export function shouldRefresh(payloadIat: number | undefined): boolean {
  if (!payloadIat) return true;
  const ageSeconds = Math.floor(Date.now() / 1000) - payloadIat;
  return ageSeconds > SESSION_REFRESH_AFTER_SECONDS;
}

const isProd = process.env.VERCEL_ENV === "production";

/** Build the Set-Cookie value for the session (HttpOnly, SameSite=Lax). */
export function sessionCookieHeader(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Build the Set-Cookie value that clears the session. */
export function clearSessionCookieHeader(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Read the raw session token from the request Cookie header. */
export function readSessionCookie(req: any): string {
  const raw = req.headers?.cookie || "";
  if (typeof raw !== "string" || !raw) return "";
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name === SESSION_COOKIE) return pair.slice(idx + 1).trim();
  }
  return "";
}
