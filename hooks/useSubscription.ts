import { useState, useEffect, useCallback } from 'react';

export interface SubscriptionState {
  loading: boolean;
  plan: 'free' | 'pro' | 'credits';
  subscribed: boolean;
  generationsUsed: number;
  generationsLimit: number;
  canGenerate: boolean;
  credits: number;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: number;
}

const ADMIN_DOMAINS = ['averyandbryant.com'];

const isAdminEmail = (email: string) =>
  ADMIN_DOMAINS.some(domain => email.toLowerCase().endsWith(`@${domain}`));

export function useSubscription(userEmail: string | null) {
  const [state, setState] = useState<SubscriptionState>({
    loading: true, plan: 'free', subscribed: false,
    generationsUsed: 0, generationsLimit: 5, canGenerate: true, credits: 0,
  });

  const checkStatus = useCallback(async () => {
    if (!userEmail) { setState(prev => ({ ...prev, loading: false })); return; }

    // Admin bypass — unlimited Pro for team emails
    if (isAdminEmail(userEmail)) {
      setState({
        loading: false, plan: 'pro', subscribed: true,
        generationsUsed: 0, generationsLimit: -1, canGenerate: true, credits: 0,
      });
      return;
    }

    try {
      const res = await fetch(`/api/stripe-status?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.ok) {
        const genCount = data.generationsUsed ?? 0;
        const limit = data.generationsLimit ?? 5;
        const credits = data.credits ?? 0;
        const plan = data.plan || 'free';
        setState({
          loading: false, plan, subscribed: data.subscribed || false,
          generationsUsed: genCount, generationsLimit: limit,
          canGenerate: plan === 'pro' || limit === -1 || genCount < limit || credits > 0,
          credits,
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

  const recordGeneration = useCallback(async () => {
    if (!userEmail) return;
    if (isAdminEmail(userEmail)) return; // Admin — no tracking needed

    // Optimistic update
    setState(prev => {
      const newCount = prev.generationsUsed + 1;
      return {
        ...prev, generationsUsed: newCount,
        canGenerate: prev.generationsLimit === -1 || newCount < prev.generationsLimit,
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
          canGenerate: prev.generationsLimit === -1 || data.generationsUsed < prev.generationsLimit,
        }));
      }
    } catch {
      // Server call failed — optimistic update already applied
    }
  }, [userEmail]);

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

  const buyCredits = useCallback(async (pack: 'starter' | 'pro_pack' | 'agency', userId: string) => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/credit-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, userId, pack, returnUrl: window.location.origin }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
    } catch (err) { console.error('Credit checkout error:', err); }
  }, [userEmail]);

  // Fulfill credits after successful purchase (check URL params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success' && params.get('session_id')) {
      const sessionId = params.get('session_id');
      window.history.replaceState({}, '', window.location.pathname);
      fetch('/api/credit-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fulfill', sessionId }),
      }).then(() => setTimeout(() => checkStatus(), 1500)).catch(() => {});
    }
  }, [checkStatus]);

  return { ...state, recordGeneration, startCheckout, openPortal, buyCredits, refresh: checkStatus };
}
