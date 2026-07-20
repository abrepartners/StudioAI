/**
 * api/stripe-webhook.ts — the only trusted inbound channel for payment events.
 *
 * Raw-body warning: Vercel's Node runtime buffers the request and parses
 * req.body lazily. Re-serializing parsed JSON does NOT reproduce the bytes
 * Stripe signed, so this handler reads the stream directly and never touches
 * req.body. Body parsing is disabled below.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = { runtime: "nodejs", api: { bodyParser: false } };

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

/** Stripe's default replay window. */
const TOLERANCE_SECONDS = 300;

function send(res: any, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

async function readRawBody(req: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parse `t=...,v1=...` (there may be several v1 entries during secret rotation). */
function parseSignatureHeader(header: string): { t: number; v1: string[] } {
  const out = { t: 0, v1: [] as string[] };
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") out.t = parseInt(v, 10);
    if (k === "v1") out.v1.push(v);
  }
  return out;
}

function safeEqHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return send(res, 405, { ok: false, error: "Method not allowed" });

  if (!STRIPE_WEBHOOK_SECRET) {
    // Fail closed. An unverifiable webhook is worse than no webhook.
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return send(res, 503, { ok: false, error: "webhook not configured" });
  }

  const header = String(req.headers?.["stripe-signature"] || "");
  if (!header) return send(res, 400, { ok: false, error: "missing signature" });

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch (err: any) {
    console.error("[stripe-webhook] could not read raw body:", err?.message);
    return send(res, 400, { ok: false, error: "unreadable body" });
  }

  const { t, v1 } = parseSignatureHeader(header);
  if (!t || v1.length === 0)
    return send(res, 400, { ok: false, error: "malformed signature" });

  const age = Math.abs(Math.floor(Date.now() / 1000) - t);
  if (age > TOLERANCE_SECONDS) {
    console.warn(`[stripe-webhook] rejected stale event, age ${age}s`);
    return send(res, 400, { ok: false, error: "timestamp outside tolerance" });
  }

  const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${raw}`)
    .digest("hex");

  if (!v1.some((candidate) => safeEqHex(expected, candidate))) {
    console.warn("[stripe-webhook] rejected bad signature");
    return send(res, 400, { ok: false, error: "signature mismatch" });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return send(res, 400, { ok: false, error: "invalid json" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "[stripe-webhook] Supabase not configured, event dropped:",
      event.id,
    );
    return send(res, 500, { ok: false, error: "storage not configured" });
  }

  // Claim the event id. A conflict means Stripe redelivered something we
  // already have, so acknowledge and stop.
  const claim = await fetch(`${SUPABASE_URL}/rest/v1/stripe_events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ id: event.id, type: event.type, payload: event }),
  });

  if (!claim.ok) {
    if (claim.status === 409) {
      return send(res, 200, { ok: true, duplicate: true });
    }
    const text = await claim.text();
    console.error(`[stripe-webhook] persist failed ${claim.status}: ${text}`);
    // Non-2xx tells Stripe to retry, which is what we want on a storage failure.
    return send(res, 500, { ok: false, error: "could not record event" });
  }

  // Phase 0.5 records events only. Reacting to them (dunning, churn tagging,
  // entitlement revocation) is deliberately deferred so this PR stays a
  // security fix rather than a behavior change.
  console.log(`[stripe-webhook] recorded ${event.type} ${event.id}`);
  return send(res, 200, { ok: true, recorded: true });
}
