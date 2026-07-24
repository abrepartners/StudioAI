/**
 * api/_lib/batch-usage.ts — server-side usage accounting for the batch pipeline.
 *
 * The interactive editor charges through the client's recordGeneration call to
 * /api/record-generation after each success. The batch pipeline runs headless
 * across many polls, so the SERVER must do that same accounting or Starter's
 * 40/month cap and the usage dashboard both go blind to batch work:
 *
 *   - assertStarterCapacity: hard gate at batch init. reserveQuota lets Starter
 *     through (it is Stripe-metered, not reserve-metered), so without this a
 *     capped-out Starter could still run a 30-photo batch.
 *   - recordBatchGeneration: after each successful photo, mirror
 *     record-generation's bookkeeping — generation_logs for the dashboard,
 *     plus the Stripe customer metadata counter for Starter.
 */
import { STARTER_MONTHLY_LIMIT } from "../../shared/monetization.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const stripeHeaders = {
  Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ":")}`,
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function findCustomer(email: string): Promise<any | null> {
  const search = await fetch(
    `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
    { headers: stripeHeaders },
  ).then((r) => r.json());
  return search?.data?.[0] || null;
}

/** This month's metered count from Stripe customer metadata (Starter path). */
async function readMonthlyUsed(customer: any): Promise<number> {
  const period = customer?.metadata?.generation_period || "";
  if (period !== currentMonth()) return 0;
  return parseInt(customer?.metadata?.generations_used || "0", 10) || 0;
}

/**
 * Gate a Starter batch of `amount` photos against the monthly cap.
 * Fail-open on Stripe outage (matches the client-side gate's posture; the
 * refusal case we're closing is the routine one, not the outage one).
 */
export async function assertStarterCapacity(
  email: string,
  amount: number,
): Promise<{ allowed: boolean; used: number }> {
  if (!STRIPE_SECRET_KEY) return { allowed: true, used: 0 };
  try {
    const customer = await findCustomer(email);
    const used = customer ? await readMonthlyUsed(customer) : 0;
    return { allowed: used + amount <= STARTER_MONTHLY_LIMIT, used };
  } catch (err: any) {
    console.warn("[batch-usage] starter cap check failed (allowing):", err?.message);
    return { allowed: true, used: 0 };
  }
}

/** Rough per-generation cost (cents) — same heuristic as record-generation. */
function estimateCostCents(model: string): number {
  if (model.includes("flux-fill")) return 10;
  if (model.includes("seedream")) return 6;
  if (model.includes("nano")) return 14;
  return 4;
}

/** The primary model behind each batch tool, for cost/dashboard attribution. */
export function modelForBatchTool(tool: string | null): string {
  if (tool === "whiten") return "black-forest-labs/flux-kontext-pro";
  if (tool === "exterior") return "google/nano-banana";
  return "google/nano-banana-pro";
}

/**
 * Record one successful batch photo. Best-effort on the log write; the Starter
 * Stripe bump is the billing-relevant part. `starter` comes from the quota
 * method captured at batch init.
 */
export async function recordBatchGeneration(
  email: string,
  tool: string | null,
  starter: boolean,
): Promise<void> {
  const model = modelForBatchTool(tool);
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/generation_logs`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_email: email.toLowerCase(),
          tool: tool || "batch",
          model,
          estimated_cost_cents: estimateCostCents(model),
          source: "app",
        }),
      });
    }
  } catch (err: any) {
    console.warn("[batch-usage] generation_logs write failed (non-fatal):", err?.message);
  }

  if (!starter || !STRIPE_SECRET_KEY) return;
  try {
    const customer = await findCustomer(email);
    if (!customer) return;
    const used = await readMonthlyUsed(customer);
    await fetch(`https://api.stripe.com/v1/customers/${customer.id}`, {
      method: "POST",
      headers: {
        ...stripeHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `metadata[generations_used]=${used + 1}&metadata[generation_period]=${currentMonth()}`,
    });
  } catch (err: any) {
    console.warn("[batch-usage] starter meter bump failed (non-fatal):", err?.message);
  }
}
