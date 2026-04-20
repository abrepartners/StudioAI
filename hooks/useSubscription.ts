import { useState, useEffect, useCallback } from 'react';
import {
  FREE_TIER_POLICY,
  MONETIZATION_POLICY_VERSION,
  STARTER_MONTHLY_LIMIT,
  hasUnlimitedGeneration,
  normalizePlan,
  type PlanId,
} from '../shared/monetization';

export interface SubscriptionState {
  loading: boolean;
  plan: PlanId;
  subscribed: boolean;
  /** Usage in the active counting window (daily for free, monthly for starter, n/a for pro/team). */
  generationsUsed: number;
  /** -1 = unlimited. Starter = 40. Free-daily = 1. Free-lifetime = 5 (until exhausted, then switches). */
  generationsLimit: number;
  canGenerate: boolean;
  credits: number;
  /** Free-tier phase tracker (Fork #3). */
  lifetimeFreeGensUsed: number;
  lifetimeFreeGensCap: number;
  /** Next monthly/daily reset (unix seconds). 0 = unlimited/no reset. */
  generationsResetAt: number;
  /** Paused subscription metadata (R18). */
  pausedUntil?: number;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: number;
  /** Billing interval if subscribed. */
  interval?: 'month' | 'year';
  /** Seats on Team plan. */
  seats?: number;
  /** Optional normalized display metadata from API responses. */
  display?: {
    policyVersion: string;
    freeTierSummary: string;
  };
}

const ADMIN_DOMAINS = ['averyandbryant.com'];

const FREE_LIFETIME_CAP = FREE_TIER_POLICY.lifetimeCap;
const FREE_DAILY_LIMIT_AFTER_LIFETIME = FREE_TIER_POLICY.dailyAfterLifetime;

const isAdminEmail = (email: string) =>
  ADMIN_DOMAINS.some(domain => email.toLowerCase().endsWith(`@${domain}`));

export function useSubscription(userEmail: string | null) {
  const [state, setState] = useState<SubscriptionState>({
    loading: true, plan: 'free', subscribed: false,
    generationsUsed: 0, generationsLimit: FREE_LIFETIME_CAP,
    canGenerate: true, credits: 0,
    lifetimeFreeGensUsed: 0, lifetimeFreeGensCap: FREE_LIFETIME_CAP,
    generationsResetAt: 0,
  });

  const checkStatus = useCallback(async () => {
    if (!userEmail) { setState(prev => ({ ...prev, loading: false })); return; }

    // Admin bypass — unlimited Pro for team emails
    if (isAdminEmail(userEmail)) {
      setState({
        loading: false, plan: 'pro', subscribed: true,
        generationsUsed: 0, generationsLimit: -1, canGenerate: true, credits: 0,
        lifetimeFreeGensUsed: 0, lifetimeFreeGensCap: FREE_LIFETIME_CAP,
        generationsResetAt: 0,
        display: {
          policyVersion: MONETIZATION_POLICY_VERSION,
          freeTierSummary: `${FREE_LIFETIME_CAP} free, then ${FREE_DAILY_LIMIT_AFTER_LIFETIME}/day`,
        },
      });
      return;
    }

    try {
      const res = await fetch(`/api/stripe-status?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.ok) {
        const plan = normalizePlan(data.plan);
        const credits = data.credits ?? 0;
        const lifetimeFreeGensUsed = data.lifetimeFreeGensUsed ?? data.generationsUsed ?? 0;
        const lifetimeFreeGensCap  = data.lifetimeFreeGensCap  ?? FREE_LIFETIME_CAP;

        // Compute effective limit per Fork #3 — 5 lifetime first, then 1/day.
        let generationsLimit: number;
        let generationsUsed: number;

        if (hasUnlimitedGeneration(plan)) {
          generationsLimit = -1; // unlimited
          generationsUsed  = 0;
        } else if (plan === 'starter') {
          generationsLimit = data.generationsLimit ?? STARTER_MONTHLY_LIMIT;
          generationsUsed  = data.generationsUsed ?? 0;
        } else if (plan === 'credits') {
          // Credit-only users: limit == credits remaining, used tracked externally.
          generationsLimit = credits;
          generationsUsed  = 0;
        } else {
          // Free tier — two-phase per Fork #3.
          if (lifetimeFreeGensUsed < lifetimeFreeGensCap) {
            generationsLimit = lifetimeFreeGensCap;
            generationsUsed  = lifetimeFreeGensUsed;
          } else {
            // Exhausted lifetime — switch to 1/day window.
            generationsLimit = FREE_DAILY_LIMIT_AFTER_LIFETIME;
            generationsUsed  = data.generationsUsed ?? 0;
          }
        }

        const canGenerate =
          hasUnlimitedGeneration(plan) ||
          generationsLimit === -1 ||
          generationsUsed < generationsLimit ||
          credits > 0;

        setState({
          loading: false,
          plan,
          subscribed: data.subscribed || false,
          generationsUsed,
          generationsLimit,
          canGenerate,
          credits,
          lifetimeFreeGensUsed,
          lifetimeFreeGensCap,
          generationsResetAt: data.generationsResetAt ?? 0,
          pausedUntil: data.pausedUntil,
          customerId: data.customerId,
          subscriptionId: data.subscriptionId,
          currentPeriodEnd: data.currentPeriodEnd,
          interval: data.interval,
          seats: data.seats,
          display: data.display,
        });
      } else { setState(prev => ({ ...prev, loading: false })); }
    } catch { setState(prev => ({ ...prev, loading: false })); }
  }, [userEmail]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    const onFocus = () => checkStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => checkStatus(), 1500);
    }
  }, [checkStatus]);

  const recordGeneration = useCallback(async () => {
    if (!userEmail) return;
    if (isAdminEmail(userEmail)) return; // Admin — no tracking needed

    // Optimistic update
    setState(prev => {
      const newCount = prev.generationsUsed + 1;
      const newLifetimeUsed = prev.plan === 'free'
        ? Math.min(prev.lifetimeFreeGensCap, prev.lifetimeFreeGensUsed + 1)
        : prev.lifetimeFreeGensUsed;
      return {
        ...prev,
        generationsUsed: newCount,
        lifetimeFreeGensUsed: newLifetimeUsed,
        canGenerate: hasUnlimitedGeneration(prev.plan) ||
          prev.generationsLimit === -1 || newCount < prev.generationsLimit,
      };
    });

    // Record server-side
    try {
      const res = await fetch('/api/record-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (data.ok && data.generationsUsed !== -1) {
        setState(prev => ({
          ...prev,
          generationsUsed: data.generationsUsed,
          lifetimeFreeGensUsed: data.lifetimeFreeGensUsed ?? prev.lifetimeFreeGensUsed,
          canGenerate: hasUnlimitedGeneration(prev.plan) ||
            prev.generationsLimit === -1 || data.generationsUsed < prev.generationsLimit,
        }));
      }
    } catch {
      // Server call failed — optimistic update already applied
    }
  }, [userEmail]);

  const startCheckout = useCallback(async (
    userId: string,
    opts?: { plan?: 'starter' | 'pro' | 'team'; interval?: 'month' | 'year'; seats?: number },
  ) => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          email: userEmail,
          userId,
          plan: opts?.plan || 'pro',
          interval: opts?.interval || 'month',
          seats: opts?.seats || 1,
          returnUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.already_subscribed) { checkStatus(); return; }
      if (data.url) { window.location.href = data.url; }
    } catch (err) { console.error('Checkout error:', err); }
  }, [userEmail, checkStatus]);

  const openPortal = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/stripe-portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, returnUrl: window.location.origin }),
      });
      const data = await res.json();
      if (data.url) { window.open(data.url, '_blank'); }
    } catch (err) { console.error('Portal error:', err); }
  }, [userEmail]);

  const buyCredits = useCallback(async (pack: 'starter' | 'pro_pack' | 'agency', userId: string) => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'credits', email: userEmail, userId, pack, returnUrl: window.location.origin }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
    } catch (err) { console.error('Credit checkout error:', err); }
  }, [userEmail]);

  const pauseSubscription = useCallback(async (days: 30 | 60 | 90) => {
    if (!userEmail) return { ok: false };
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause_subscription', email: userEmail, days }),
      });
      const data = await res.json();
      if (data.ok) setTimeout(() => checkStatus(), 800);
      return data;
    } catch (err) { console.error('Pause error:', err); return { ok: false }; }
  }, [userEmail, checkStatus]);

  const resumeSubscription = useCallback(async () => {
    if (!userEmail) return { ok: false };
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume_subscription', email: userEmail }),
      });
      const data = await res.json();
      if (data.ok) setTimeout(() => checkStatus(), 800);
      return data;
    } catch (err) { console.error('Resume error:', err); return { ok: false }; }
  }, [userEmail, checkStatus]);

  // Fulfill credits after successful purchase (check URL params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success' && params.get('session_id')) {
      const sessionId = params.get('session_id');
      window.history.replaceState({}, '', window.location.pathname);
      fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fulfill', sessionId }),
      }).then(() => setTimeout(() => checkStatus(), 1500)).catch(() => {});
    }
  }, [checkStatus]);

  return {
    ...state,
    recordGeneration,
    startCheckout,
    openPortal,
    buyCredits,
    pauseSubscription,
    resumeSubscription,
    refresh: checkStatus,
  };
}
