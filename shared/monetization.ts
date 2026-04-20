export type PlanId = 'free' | 'starter' | 'pro' | 'team' | 'credits';
export type PricingInterval = 'month' | 'year';

export const MONETIZATION_POLICY_VERSION = '2026-04-p0';

export const FREE_TIER_POLICY = {
  lifetimeCap: 5,
  dailyAfterLifetime: 1,
} as const;

export const STARTER_MONTHLY_LIMIT = 40;

export const PLAN_PRICING_USD = {
  starter: { month: 19, year: 15, seats: 1 },
  pro: { month: 49, year: 39, seats: 1 },
  team: { month: 99, year: 79, seats: 3 },
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
