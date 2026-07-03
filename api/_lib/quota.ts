/**
 * api/_lib/quota.ts — server-only, server-authoritative generation quota.
 *
 * Two layers:
 *   1. Plan resolution (Stripe): unlimited plans (pro/team) skip the reserve
 *      entirely; they are metered by Stripe, not the free counter.
 *   2. Atomic free-tier reserve (Supabase RPC `reserve_generation`): a single
 *      row-locked check-and-increment, so a 25-photo batch cannot all read the
 *      same lifetime count and blow the 5-free cap (the TOCTOU the old
 *      "increment after the fact" path allowed).
 *
 * Reserve BEFORE the Replicate call; refund on failure so a user is never
 * charged for a delivery they didn't get. Never import from client code.
 */
import {
  hasUnlimitedGeneration,
  normalizePlan,
} from "../../shared/monetization.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const FREE_LIFETIME_CAP = 5;

export interface QuotaResult {
  allowed: boolean;
  method: "unlimited" | "lifetime" | "credits" | "starter" | "denied";
  reason?: string;
  lifetimeUsed?: number;
  credits?: number;
  /** Set when a reservation was made and must be refunded on failure. */
  refundHandle?: { googleId: string; amount: number; method: string } | null;
}

/** Best-effort Stripe plan lookup. Returns the plan slug or null (free). */
async function resolvePlan(email: string): Promise<string | null> {
  if (!STRIPE_SECRET_KEY) return null;
  try {
    const search = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ":")}` } },
    ).then((r) => r.json());
    const customer = search?.data?.[0];
    if (!customer) return null;
    const subs = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ":")}` } },
    ).then((r) => r.json());
    const sub = subs?.data?.[0];
    if (!sub) return null;
    return (
      sub?.metadata?.studioai_plan ||
      sub?.items?.data?.[0]?.price?.metadata?.studioai_plan ||
      "pro"
    );
  } catch {
    return null;
  }
}

async function callRpc(fn: string, payload: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}`);
  return res.json();
}

/**
 * Reserve `amount` generations for the caller. Call BEFORE the Replicate work.
 * - unlimited plans: allowed, no reserve.
 * - free/credits: atomic reserve; caller MUST refundQuota on generation failure.
 * Fail-closed on a misconfigured backend (no Supabase) is the safe default for
 * a paid resource, but we keep the existing behavior of allowing when the
 * quota backend is entirely unconfigured so a missing env var in a preview
 * doesn't brick the app — logged loudly so it's visible.
 */
export async function reserveQuota(
  email: string,
  googleId: string,
  amount: number = 1,
): Promise<QuotaResult> {
  const plan = normalizePlan(await resolvePlan(email));
  if (hasUnlimitedGeneration(plan)) {
    return { allowed: true, method: "unlimited", refundHandle: null };
  }
  // Starter is Stripe-metered monthly; keep it on the existing accounting path
  // (record-generation) but let it through the gate — it is authenticated and
  // capped downstream. Free tier is the atomic-reserve path.
  if (plan === "starter") {
    return { allowed: true, method: "starter", refundHandle: null };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn(
      "[quota] Supabase not configured — allowing without reserve (free-tier cap NOT enforced)",
    );
    return { allowed: true, method: "lifetime", refundHandle: null };
  }

  try {
    const out = await callRpc("reserve_generation", {
      p_google_id: googleId,
      p_email: email.toLowerCase(),
      p_amount: amount,
      p_lifetime_cap: FREE_LIFETIME_CAP,
    });
    if (out?.allowed) {
      return {
        allowed: true,
        method: out.method,
        lifetimeUsed: out.lifetime_used,
        credits: out.credits,
        refundHandle: { googleId, amount, method: out.method },
      };
    }
    return {
      allowed: false,
      method: "denied",
      reason: out?.reason || "quota_exhausted",
      lifetimeUsed: out?.lifetime_used,
      credits: out?.credits,
      refundHandle: null,
    };
  } catch (err: any) {
    // Reserve backend erroring is a genuine outage. Fail-CLOSED: a paid
    // resource must not be handed out for free when we cannot account for it.
    console.error("[quota] reserve failed — denying:", err?.message);
    return {
      allowed: false,
      method: "denied",
      reason: "quota_backend_unavailable",
      refundHandle: null,
    };
  }
}

/** Restore a reservation after a failed generation. Best-effort. */
export async function refundQuota(
  handle: QuotaResult["refundHandle"],
): Promise<void> {
  if (!handle || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await callRpc("refund_generation", {
      p_google_id: handle.googleId,
      p_amount: handle.amount,
      p_method: handle.method,
    });
  } catch (err: any) {
    console.warn("[quota] refund failed (non-fatal):", err?.message);
  }
}
