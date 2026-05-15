import React, { useState } from 'react';
import { Icon } from './icons';
import type { SubscriptionState } from '../../hooks/useSubscription';
import {
  PLAN_PRICING_USD,
  STARTER_MONTHLY_LIMIT,
  getPlanDisplayName,
} from '../../shared/monetization';

interface BillingProps {
  setPage: (p: string) => void;
  credits: number;
  subscription?: SubscriptionState & {
    startCheckout: (userId: string, opts?: { plan?: 'starter' | 'pro' | 'team'; interval?: 'month' | 'year' }) => void;
    openPortal: () => void;
    buyCredits: (pack: 'starter' | 'pro_pack' | 'agency', userId: string) => void;
  };
  userEmail?: string;
  userId?: string;
}

const VellumBilling: React.FC<BillingProps> = ({ setPage, credits, subscription, userEmail, userId }) => {
  const [interval, setInterval] = useState<'month' | 'year'>('year');

  const plan = subscription?.plan || 'free';
  const isSubscribed = subscription?.subscribed || false;
  const isUnlimited = subscription?.generationsLimit === -1;
  const limit = subscription?.generationsLimit ?? 5;
  const used = subscription?.generationsUsed ?? 0;
  const loading = subscription?.loading ?? false;

  const handleUpgrade = (targetPlan: 'starter' | 'pro' | 'team') => {
    if (!userId || !subscription) return;
    subscription.startCheckout(userId, { plan: targetPlan, interval });
  };

  const handleManage = () => {
    if (!subscription) return;
    subscription.openPortal();
  };

  const annualSaving = (monthly: number, yearly: number) => {
    const saved = (monthly * 12) - (yearly * 12);
    return saved > 0 ? `Save $${saved}/yr` : '';
  };

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Plan & billing</div>
          <h1 className="v-page-title">Refined work, <em>fairly priced.</em></h1>
          <p className="v-page-sub">
            {isSubscribed
              ? `You're on the ${getPlanDisplayName(plan)} plan. ${isUnlimited ? 'Unlimited generations.' : `${Math.max(0, limit - used)} of ${limit} generations remaining this period.`}`
              : 'Start free, upgrade when you need more.'}
          </p>
        </div>
      </div>

      {/* Interval toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
        <button
          className={`v-btn v-btn--sm ${interval === 'month' ? 'v-btn--primary' : 'v-btn--ghost'}`}
          onClick={() => setInterval('month')}
        >Monthly</button>
        <button
          className={`v-btn v-btn--sm ${interval === 'year' ? 'v-btn--primary' : 'v-btn--ghost'}`}
          onClick={() => setInterval('year')}
        >Annual <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>2 months free</span></button>
      </div>

      <div className="v-plans">
        {/* Free */}
        <div className={`v-plan ${plan === 'free' ? 'featured' : ''}`}>
          <div className="v-plan-name">Free</div>
          <div className="v-plan-price">$0</div>
          <div className="v-plan-tag">5 edits to start, then 1 per day.</div>
          <ul>
            <li>5 lifetime free generations</li>
            <li>1/day after that</li>
            <li>Staging + Cleanup</li>
            <li>No credit card required</li>
          </ul>
          {plan === 'free' && <div className="v-plan-cta" style={{ opacity: 0.5 }}>Current plan</div>}
        </div>

        {/* Starter */}
        <div className={`v-plan ${plan === 'starter' ? 'featured' : ''}`}>
          <div className="v-plan-name">Starter</div>
          <div className="v-plan-price">
            ${interval === 'year' ? PLAN_PRICING_USD.starter.year : PLAN_PRICING_USD.starter.month}
            <em>/mo</em>
          </div>
          <div className="v-plan-tag">
            {STARTER_MONTHLY_LIMIT} generations/month.
            {interval === 'year' && ` ${annualSaving(PLAN_PRICING_USD.starter.month, PLAN_PRICING_USD.starter.year)}`}
          </div>
          <ul>
            <li>{STARTER_MONTHLY_LIMIT} AI generations/month</li>
            <li>Staging + Cleanup + MLS Export</li>
            <li>Listing Copy</li>
            <li>Email support</li>
          </ul>
          {plan === 'starter'
            ? <button className="v-plan-cta" onClick={handleManage}>Manage plan</button>
            : <button className="v-plan-cta" onClick={() => handleUpgrade('starter')}>
                {isSubscribed ? 'Switch' : 'Upgrade'}
              </button>
          }
        </div>

        {/* Pro */}
        <div className={`v-plan ${plan === 'pro' ? 'featured' : ''}`}>
          {plan !== 'pro' && <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--pale-gold)', marginBottom: 8 }}>Most popular</div>}
          <div className="v-plan-name">Pro</div>
          <div className="v-plan-price">
            ${interval === 'year' ? PLAN_PRICING_USD.pro.year : PLAN_PRICING_USD.pro.month}
            <em>/mo</em>
          </div>
          <div className="v-plan-tag">
            Unlimited generations.
            {interval === 'year' && ` ${annualSaving(PLAN_PRICING_USD.pro.month, PLAN_PRICING_USD.pro.year)}`}
          </div>
          <ul>
            <li>Unlimited AI staging & cleanup</li>
            <li>Twilight & sky replace</li>
            <li>Renovation visualization</li>
            <li>Full marketing toolkit</li>
            <li>Priority processing</li>
          </ul>
          {plan === 'pro'
            ? <button className="v-plan-cta" onClick={handleManage}>Manage plan</button>
            : <button className="v-plan-cta" onClick={() => handleUpgrade('pro')}>
                {isSubscribed ? 'Switch to Pro' : 'Upgrade to Pro'}
              </button>
          }
        </div>

        {/* Team */}
        <div className={`v-plan ${plan === 'team' ? 'featured' : ''}`}>
          <div className="v-plan-name">Team</div>
          <div className="v-plan-price">
            ${interval === 'year' ? PLAN_PRICING_USD.team.year : PLAN_PRICING_USD.team.month}
            <em>/mo</em>
          </div>
          <div className="v-plan-tag">
            Unlimited + {PLAN_PRICING_USD.team.seats} seats.
            {interval === 'year' && ` ${annualSaving(PLAN_PRICING_USD.team.month, PLAN_PRICING_USD.team.year)}`}
          </div>
          <ul>
            <li>Everything in Pro</li>
            <li>Up to {PLAN_PRICING_USD.team.seats} team members</li>
            <li>Brokerage-wide branding</li>
            <li>Admin dashboard</li>
            <li>Dedicated support</li>
          </ul>
          {plan === 'team'
            ? <button className="v-plan-cta" onClick={handleManage}>Manage plan</button>
            : <button className="v-plan-cta" onClick={() => handleUpgrade('team')}>
                {isSubscribed ? 'Switch to Team' : 'Upgrade to Team'}
              </button>
          }
        </div>
      </div>

      {/* Usage */}
      <div className="v-section-head" style={{ marginTop: 0 }}>
        <div>
          <div className="eyebrow">Usage</div>
          <h2 className="title">This billing period</h2>
        </div>
      </div>

      <div className="v-kpi-row">
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Generations</div>
          {isUnlimited ? (
            <>
              <div className="value">{used}<span style={{ fontSize: 24, color: 'var(--graphite)' }}> used</span></div>
              <div className="delta">Unlimited on {getPlanDisplayName(plan)}</div>
            </>
          ) : (
            <>
              <div className="value">{used}<span style={{ fontSize: 24, color: 'var(--graphite)' }}> / {limit}</span></div>
              <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%`, height: '100%', background: 'var(--deep-charcoal)' }} />
              </div>
            </>
          )}
        </div>
        {subscription && subscription.credits > 0 && (
          <div className="v-kpi">
            <div className="v-gold-rule" />
            <div className="label">Credit balance</div>
            <div className="value">{subscription.credits}</div>
            <div className="delta">From purchased credit packs</div>
          </div>
        )}
      </div>

      {/* Manage billing */}
      {isSubscribed && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="v-btn v-btn--ghost v-btn--sm" onClick={handleManage}>
            Manage billing & invoices
          </button>
        </div>
      )}

      {!isSubscribed && (
        <>
          <div className="v-section-head">
            <div>
              <div className="eyebrow">Invoices</div>
              <h2 className="title">Recent receipts</h2>
            </div>
          </div>
          <div className="v-empty-state" style={{ padding: '40px 0' }}>
            <div className="v-empty-icon">
              <Icon name="card" size={24} color="var(--graphite)" />
            </div>
            <h3>No invoices yet</h3>
            <p>Your billing history will appear here once your first payment is processed.</p>
          </div>
        </>
      )}
    </div>
  );
};

export default VellumBilling;
