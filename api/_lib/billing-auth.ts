/**
 * api/_lib/billing-auth.ts: the gate every money endpoint runs first.
 *
 * requireSession proves that SOMEONE is signed in. It does not prove they are
 * the customer whose billing they are touching. Every billing endpoint in this
 * repo historically identified the customer by an email in the request body,
 * which made "know an email" equivalent to "authorized". requireBillingSession
 * binds the session identity to the record being acted on, and lets admins
 * through for support work.
 */
import { requireSession } from "./auth-middleware.js";
import type { SessionClaims } from "./session.js";
import { isAdminEmail } from "../../shared/monetization.js";

export type BillingAuthOptions = {
  /** The customer email this request will read or mutate, if any. */
  actingOn?: string;
};

function norm(email: string | null | undefined): string {
  return (email || "").toLowerCase().trim();
}

/**
 * Require a valid session AND, when `actingOn` is supplied, require that the
 * session belongs to that customer (or to an admin). Returns claims, or null
 * after writing 401 (not signed in) or 403 (signed in as someone else).
 */
export async function requireBillingSession(
  req: any,
  res: any,
  opts: BillingAuthOptions = {},
): Promise<SessionClaims | null> {
  const claims = await requireSession(req, res);
  if (!claims) return null; // requireSession already wrote 401/503

  const target = norm(opts.actingOn);
  if (!target) return claims;

  const caller = norm(claims.email);
  if (caller === target) return claims;
  if (isAdminEmail(caller)) return claims;

  console.warn(
    `[billing-auth] denied: ${caller} attempted to act on ${target}`,
  );
  res.status(403);
  res.setHeader("Content-Type", "application/json");
  res.send(
    JSON.stringify({
      ok: false,
      error: "not authorized for this account",
      code: "forbidden",
    }),
  );
  return null;
}
