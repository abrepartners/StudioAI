import { useState, useEffect, useCallback } from 'react';

export interface SubscriptionState {
  loading: boolean;
  plan: 'free' | 'pro';
  subscribed: boolean;
  generationsUsed: number;
  generationsLimit: number;
  canGenerate: boolean;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: number;
}

const GEN_COUNT_KEY = 'studioai_gen_count';
const GEN_PERIOD_KEY = 'studioai_gen_period';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function getStoredGenerationCount(): number {
  try {
    const period = localStorage.getItem(GEN_PERIOD_KEY);
    const current = getCurrentPeriod();
    if (period !== current) {
      localStorage.setItem(GEN_PERIOD_KEY, current);
      localStorage.setItem(GEN_COUNT_KEY, '0');
      return 0;
    }
    return parseInt(localStorage.getItem(GEN_COUNT_KEY) || '0', 10);
  } catch { return 0; }
}

function incrementStoredGenerationCount(): number {
  const current = getStoredGenerationCount();
  const next = current + 1;
  try {
    localStorage.setItem(GEN_COUNT_KEY, String(next));
    localStorage.setItem(GEN_PERIOD_KEY, getCurrentPeriod());
  } catch {}
  return next;
}

export function useSubscription(userEmail: string | null) {
  const [state, setState] = useState<SubscriptionState>({
    loading: true, plan: 'free', subscribed: false,
    generationsUsed: getStoredGenerationCount(), generationsLimit: 5, canGenerate: true,
  });

  const checkStatus = useCallback(async () => {
    if (!userEmail) { setState(prev => ({ ...prev, loading: false })); return; }
    try {
      const res = await fetch(`/api/stripe-status?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.ok) {
        const genCount = getStoredGenerationCount();
        const limit = data.generationsLimit ?? 5;
        setState({
          loading: false, plan: data.plan || 'free', subscribed: data.subscribed || false,
          generationsUsed: genCount, generationsLimit: limit,
          canGenerate: limit === -1 || genCount < limit,
          customerId: data.customerId, subscriptionId: data.subscriptionId,
          currentPeriodEnd: data.currentPeriodEnd,
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

  const recordGeneration = useCallback(() => {
    const newCount = incrementStoredGenerationCount();
    setState(prev => ({
      ...prev, generationsUsed: newCount,
      canGenerate: prev.generationsLimit === -1 || newCount < prev.generationsLimit,
    }));
  }, []);

  const startCheckout = useCallback(async (userId: string) => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, userId, plan: 'pro', returnUrl: window.location.origin }),
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

  return { ...state, recordGeneration, startCheckout, openPortal, refresh: checkStatus };
}
