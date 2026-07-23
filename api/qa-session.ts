/**
 * api/qa-session.ts — QA-only session mint (no Google OAuth).
 *
 * Lets an automated QA client (Playwright on the always-on Mac Mini) log in
 * WITHOUT the Google sign-in flow, so authenticated screens can be self-verified
 * after a deploy. It mints a session for ONE fixed, powerless QA identity —
 * never an arbitrary caller-supplied user — and only when the caller presents
 * the QA_SESSION_TOKEN.
 *
 * Security design (blast radius is nil by construction):
 *  - Fail-closed: if QA_SESSION_TOKEN is not configured, the endpoint 404s as if
 *    it does not exist. It is off unless deliberately switched on via env.
 *  - Constant-time token compare (no timing oracle).
 *  - The ONLY identity it can ever mint is qa@averyandbryant.com / sub "qa-bot" —
 *    a normal free-tier account with no admin/owner powers, which anyone could
 *    create by signing up. A leaked QA token therefore grants nothing that a
 *    self-serve signup would not.
 *  - Never touches a real user's account, billing, or data.
 */
import crypto from "node:crypto";
import { json, rejectMethod } from "./utils.js";
import { applyCors } from "./_lib/auth-middleware.js";
import { signSession, sessionCookieHeader } from "./_lib/session.js";

export const config = { runtime: "nodejs" };

const QA_SESSION_TOKEN = process.env.QA_SESSION_TOKEN || "";

// Fixed, powerless QA identity. Not derived from any request input.
const QA_EMAIL = "qa@averyandbryant.com";
const QA_SUB = "qa-bot";

function tokenOk(provided: string): boolean {
  if (!QA_SESSION_TOKEN || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(QA_SESSION_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  // Off unless a token is configured — the endpoint simply does not exist.
  if (!QA_SESSION_TOKEN) {
    json(res, 404, { ok: false, error: "not found" });
    return;
  }

  const provided =
    (req.headers["x-qa-token"] as string) ||
    (typeof req.query?.token === "string" ? req.query.token : "");
  if (!tokenOk(provided)) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  // Only ever the fixed QA identity — no caller input influences who is minted.
  const token = await signSession({ email: QA_EMAIL, sub: QA_SUB });
  res.setHeader("Set-Cookie", sessionCookieHeader(token));
  json(res, 200, { ok: true, user: { email: QA_EMAIL, sub: QA_SUB } });
}
