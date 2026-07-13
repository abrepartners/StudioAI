export type PlanId = 'free' | 'starter' | 'pro' | 'team' | 'credits';
export type PricingInterval = 'month' | 'year';

export const MONETIZATION_POLICY_VERSION = '2026-04-p0';

export const FREE_TIER_POLICY = {
  lifetimeCap: 5,
  dailyAfterLifetime: 1,
} as const;

export const STARTER_MONTHLY_LIMIT = 40;

// ── Owner / admin allowlist ─────────────────────────────────────────────────
// Owner accounts get UNLIMITED generation everywhere. This is the single source
// of truth: the client gate (useSubscription) and the server quota gate
// (reserveQuota) both read it, so they can never disagree and bounce an owner to
// billing. Before this existed the client treated admins as unlimited but the
// server did not, so an owner could click Generate and get 402'd into billing.
export const ADMIN_EMAIL_DOMAINS = ['averyandbryant.com'];
// Specific owner emails on other domains (add teammates who are NOT on an admin
// domain here, e.g. a personal Gmail or another company address).
export const ADMIN_EMAILS: string[] = [];

/** True if this email is an owner/admin (unlimited generation). Case-insensitive. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return (
    ADMIN_EMAILS.includes(e) ||
    ADMIN_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`))
  );
}

export const PLAN_PRICING_USD = {
  starter: { month: 19, year: 15, seats: 1 },
  pro: { month: 59, year: 47, seats: 1 },
  team: { month: 149, year: 119, seats: 5 },
} as const;

export const EARLY_BIRD_MONTHLY_USD = 14;

export const DISPLAY_COPY = {
  freeTierShort: `${FREE_TIER_POLICY.lifetimeCap} free to start, then ${FREE_TIER_POLICY.dailyAfterLifetime}/day`,
  freeTierFaq: `Every account gets ${FREE_TIER_POLICY.lifetimeCap} free generations to start, then ${FREE_TIER_POLICY.dailyAfterLifetime} per day after that. No credit card required.`,
  starterMonthlySummary: `${STARTER_MONTHLY_LIMIT} generations/month`,
} as const;

export function hasUnlimitedGeneration(plan: PlanId): boolean {
  return plan === 'pro' || plan === 'team';
}

export function hasProImageQuality(plan: PlanId): boolean {
  return plan === 'pro' || plan === 'team';
}

export function hasProAiTools(plan: PlanId): boolean {
  return plan === 'pro' || plan === 'team';
}

export function formatPlanPrice(plan: Exclude<PlanId, 'free' | 'credits'>, interval: PricingInterval): string {
  return `$${PLAN_PRICING_USD[plan][interval]}`;
}

export function getPlanDisplayName(plan: PlanId): string {
  if (plan === 'starter') return 'Starter';
  if (plan === 'pro') return 'Pro';
  if (plan === 'team') return 'Team';
  if (plan === 'credits') return 'Credits';
  return 'Free';
}

export function normalizePlan(input: string | null | undefined): PlanId {
  if (input === 'starter' || input === 'pro' || input === 'team' || input === 'credits') {
    return input;
  }
  return 'free';
}
