/**
 * PricingPage — Phase 2 / R19
 *
 * XL visual: 4 tiers (Team · Pro · Starter · Free) with decoy ordering —
 * Team first (left) anchors high, Pro second flagged "Most Popular" as the
 * intended pick, Starter third as price-anchor, Free fourth.
 *
 * Annual toggle default-on (20% off, "2 months free"). Per-photo framing
 * under each monthly price. Credit packs below the grid.
 *
 * Extracted from App.tsx. Wired into both the marketing homepage (#pricing
 * anchor) and the /pricing route (Cluster C's MarketingRoute).
 *
 * Locked behavior:
 *   - Early Bird card remains separate (off-grid) so the "First 20 users"
 *     promise is still visible.
 *   - startCheckout is injected from useSubscription — respects
 *     grandfathering rules on the server side.
 */

import React, { useState } from 'react';
import { Check, Crown, Star, Users, Sparkles } from 'lucide-react';

export type PricingPlan = 'starter' | 'pro' | 'team';
export type PricingInterval = 'month' | 'year';

interface PricingPageProps {
  /** User email. When null, CTAs trigger sign-in flow. */
  email: string | null;
  /** Called when a sign-in is required (user not authed). */
  onRequireSignIn: () => void;
  /** Starts Stripe checkout for a given plan/interval. */
  onStartCheckout?: (plan: PricingPlan, interval: PricingInterval) => void;
  /** Anchor id for the pricing section. */
  id?: string;
}

// ─── Catalog (mirrors api/stripe-checkout.ts PLAN_CATALOG) ──────────────────
const CATALOG = {
  free: {
    name: 'Free',
    tagline: 'Kick the tires.',
    month: 0,
    year: 0,
    perPhoto: null as string | null,
    seats: 1,
    ctaMonth: 'Start Free',
    ctaYear: 'Start Free',
    features: [
      '5 lifetime generations',
      'Then 1 generation / day',
      'Staging + Cleanup',
      '"Virtually Staged" watermark',
    ],
    accent: 'zinc',
  },
  starter: {
    name: 'Starter',
    tagline: 'One listing, done right.',
    month: 19,
    year: 15,
    perPhoto: '$0.48 per staged photo',
    seats: 1,
    ctaMonth: 'Start Starter',
    ctaYear: 'Start Starter — save $48/yr',
    features: [
      '40 generations / month',
      'Staging + Cleanup + MLS Export',
      'Listing Copy (1 Pro AI Tool)',
      'Text watermark only',
    ],
    accent: 'zinc',
  },
  pro: {
    name: 'Pro',
    tagline: 'Unlimited listings. Every tool.',
    month: 49,
    year: 39,
    perPhoto: 'Less than $0.05/photo at typical use',
    seats: 1,
    ctaMonth: 'Start Pro',
    ctaYear: 'Start Pro — save $120/yr',
    features: [
      'Unlimited generations',
      'All Pro AI Tools (day-to-dusk, sky, reno)',
      'Batch processing',
      'Custom-logo watermark',
      'Priority rendering',
      'Community showcase access',
    ],
    accent: 'blue',
  },
  team: {
    name: 'Team',
    tagline: 'For media shops + small brokerages.',
    month: 99,
    year: 79,
    perPhoto: 'Shared across 3 seats',
    seats: 3,
    ctaMonth: 'Start Team',
    ctaYear: 'Start Team — save $240/yr',
    features: [
      'Everything in Pro',
      '3 team seats included',
      'Shared Brand Kits',
      'Admin dashboard',
      'Priority support',
    ],
    accent: 'gold',
  },
} as const;

// Decoy ordering (left → right): Team anchors high, Pro is "most popular",
// Starter is entry-level, Free closes the row.
const ORDER: Array<keyof typeof CATALOG> = ['team', 'pro', 'starter', 'free'];

// ─── Styling helpers ────────────────────────────────────────────────────────
const ACCENT_STYLES = {
  blue: {
    card: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/[0.04] hover:border-[var(--color-primary)]/60',
    badge: 'bg-[var(--color-primary)] text-white',
    check: 'text-[var(--color-primary)]',
    cta: 'bg-[var(--color-primary)] text-white hover:opacity-90',
    iconBg: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
  },
  gold: {
    card: 'border-[#FFD60A]/25 bg-[#FFD60A]/[0.03] hover:border-[#FFD60A]/40',
    badge: 'bg-[#FFD60A] text-black',
    check: 'text-[#FFD60A]',
    cta: 'bg-white/10 text-white hover:bg-white/15 border border-white/10',
    iconBg: 'bg-[#FFD60A]/15 text-[#FFD60A]',
  },
  zinc: {
    card: 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]',
    badge: 'bg-white/10 text-white',
    check: 'text-zinc-500',
    cta: 'bg-white/10 text-white hover:bg-white/15 border border-white/10',
    iconBg: 'bg-white/5 text-zinc-400',
  },
} as const;

const PLAN_ICON: Record<keyof typeof CATALOG, React.ReactNode> = {
  free: <Sparkles size={18} />,
  starter: <Sparkles size={18} />,
  pro: <Crown size={18} />,
  team: <Users size={18} />,
};

// ─── Component ──────────────────────────────────────────────────────────────
export const PricingPage: React.FC<PricingPageProps> = ({
  email,
  onRequireSignIn,
  onStartCheckout,
  id = 'pricing',
}) => {
  // Annual default-on (spec §4).
  const [interval, setInterval] = useState<PricingInterval>('year');
  const annual = interval === 'year';

  const handleCtaClick = (plan: keyof typeof CATALOG) => {
    if (plan === 'free') {
      if (!email) onRequireSignIn();
      return;
    }
    if (!email) { onRequireSignIn(); return; }
    onStartCheckout?.(plan as PricingPlan, interval);
  };

  return (
    <section id={id} className="px-5 sm:px-8 lg:px-12 py-24 sm:py-32 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 reveal">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Pricing</p>
          <h2 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            One price. Every tool. No per-photo math.
          </h2>
          <p className="text-zinc-400 text-base max-w-xl mx-auto">
            Start free. Upgrade when you're ready. Cancel anytime. Early Bird + current Pro rates honored per grandfathering.
          </p>
        </div>

        {/* Annual toggle */}
        <div className="flex items-center justify-center gap-3 mb-12 reveal">
          <span className={`text-sm font-semibold transition-colors ${!annual ? 'text-white' : 'text-zinc-500'}`}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing (20% off)"
            onClick={() => setInterval(annual ? 'month' : 'year')}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              annual ? 'bg-[var(--color-primary)]' : 'bg-white/10'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                annual ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold transition-colors ${annual ? 'text-white' : 'text-zinc-500'}`}>
              Annual
            </span>
            <span className="rounded-full px-2 py-0.5 bg-[#30D158]/15 border border-[#30D158]/30 text-xs font-bold text-[#30D158]">
              Save 20% · 2 months free
            </span>
          </div>
        </div>

        {/* Social proof strip */}
        <div className="mb-10 reveal">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-600 mb-4">
            Trusted by agents, photographers, and media shops
          </p>
          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} size={14} className="text-[#FFD60A] fill-[#FFD60A]" />
              ))}
            </div>
            <span className="text-sm font-semibold text-white">4.9/5</span>
            <span className="text-xs text-zinc-500">from verified agents</span>
          </div>
        </div>

        {/* Tier grid — decoy order: Team · Pro · Starter · Free */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-16 reveal">
          {ORDER.map((key) => {
            const plan = CATALOG[key];
            const styles = ACCENT_STYLES[plan.accent];
            const isPro = key === 'pro';
            const isFree = key === 'free';
            const displayPrice = annual ? plan.year : plan.month;
            const priceLabel = isFree ? '0' : String(displayPrice);
            const suffix = isFree ? '' : '/mo';
            const secondaryPrice = !isFree && annual
              ? `Billed $${plan.year * 12}/yr · save $${(plan.month - plan.year) * 12}`
              : !isFree && !annual
                ? `or $${plan.year}/mo billed annually`
                : '';

            return (
              <div
                key={key}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${styles.card} ${
                  isPro ? 'lg:scale-[1.03] lg:shadow-xl lg:shadow-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30' : ''
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[var(--color-primary)] text-xs font-bold uppercase tracking-widest text-white whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.iconBg}`}>
                    {PLAN_ICON[key]}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">{plan.name}</p>
                    <p className="text-sm text-zinc-400 leading-tight">{plan.tagline}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-white">${priceLabel}</span>
                  {!isFree && <span className="text-sm text-zinc-500">{suffix}</span>}
                </div>
                <p className="text-xs text-zinc-500 mb-1 min-h-[14px]">
                  {secondaryPrice}
                </p>
                {plan.perPhoto && (
                  <p className="text-sm font-semibold text-[var(--color-primary)] mb-5 min-h-[16px]">
                    {plan.perPhoto}
                  </p>
                )}
                {!plan.perPhoto && <div className="mb-5 min-h-[16px]" />}

                {/* Features */}
                <ul className="space-y-2 text-[12px] text-zinc-300 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={13} className={`${styles.check} mt-0.5 shrink-0`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  type="button"
                  onClick={() => handleCtaClick(key)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${styles.cta}`}
                >
                  {annual ? plan.ctaYear : plan.ctaMonth}
                </button>
                {!isFree && (
                  <p className="mt-2 text-xs text-center text-zinc-600">
                    Cancel anytime · 3-month pause available
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Credit packs — post-grid, for occasional users */}
        <div className="reveal">
          <div className="text-center mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">Pay-As-You-Go Credits</p>
            <p className="text-sm text-zinc-400">No subscription. Buy credits, use anytime.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { name: '10 Credits', price: '$15', per: '$1.50/image' },
              { name: '25 Credits', price: '$29', per: '$1.16/image' },
              { name: '75 Credits', price: '$69', per: '$0.92/image' },
            ].map((pack) => (
              <div
                key={pack.name}
                className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center hover:border-white/[0.12] transition-all"
              >
                <p className="text-xs font-bold text-white mb-1">{pack.name}</p>
                <p className="text-lg font-black text-white">{pack.price}</p>
                <p className="text-xs text-zinc-500">{pack.per}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Grandfathering footnote */}
        <div className="mt-12 max-w-2xl mx-auto text-center reveal">
          <p className="text-sm text-zinc-500 leading-relaxed">
            <span className="font-semibold text-zinc-400">Already a subscriber?</span>
            {' '}Early Bird users stay at $14/mo forever. Current Pro users keep $29/mo for 12 months, then move to $49/mo with 30-day notice. No surprise rate hikes — it's all in the account.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingPage;
