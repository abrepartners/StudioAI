import React, { useState } from 'react';
import { Icon } from './icons';
import type { SubscriptionState } from '../../hooks/useSubscription';

interface RefillModalProps {
  open: boolean;
  needed: number;
  balance: number;
  onClose: () => void;
  onConfirm: (added: number) => void;
  subscription?: SubscriptionState & {
    startCheckout: (userId: string, opts?: { plan?: 'starter' | 'pro' | 'team'; interval?: 'month' | 'year' }) => void;
    buyCredits: (pack: 'starter' | 'pro_pack' | 'agency', userId: string) => void;
  };
  userEmail?: string;
  userId?: string;
}

const PACKS: { id: 'starter' | 'pro_pack' | 'agency'; cr: number; price: number; rate: string; best?: boolean }[] = [
  { id: 'starter', cr: 10, price: 15, rate: '$1.50 / edit' },
  { id: 'pro_pack', cr: 25, price: 29, rate: '$1.16 / edit', best: true },
  { id: 'agency', cr: 75, price: 69, rate: '$0.92 / edit' },
];

const VellumRefillModal: React.FC<RefillModalProps> = ({ open, needed, balance, onClose, onConfirm, subscription, userEmail, userId }) => {
  const [pack, setPack] = useState<'starter' | 'pro_pack' | 'agency'>('pro_pack');

  if (!open) return null;

  const short = Math.max(0, needed - balance);
  const maxVal = Math.max(needed, balance, 1);
  const isFreePlan = !subscription?.subscribed;
  const planName = subscription?.plan === 'starter' ? 'Starter' : subscription?.plan === 'pro' ? 'Pro' : subscription?.plan === 'team' ? 'Team' : 'Free';

  const handleBuyCredits = () => {
    if (subscription && userId) {
      subscription.buyCredits(pack, userId);
    }
  };

  const handleUpgrade = () => {
    if (subscription && userId) {
      subscription.startCheckout(userId, { plan: 'pro', interval: 'month' });
    }
  };

  return (
    <div className="v-modal-shade" onClick={onClose}>
      <div className="v-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>

        <div className="v-modal-eyebrow">
          {isFreePlan ? 'Limit reached' : 'Credits required'}
        </div>
        <h2 className="v-modal-title">
          {isFreePlan
            ? <>Upgrade to keep <em>creating.</em></>
            : <>A few more credits to <em>finish this edit.</em></>
          }
        </h2>

        {isFreePlan ? (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--graphite)', margin: '0 0 24px' }}>
            You've used your free generations. Upgrade to Pro for unlimited edits, or buy a credit pack to keep going.
          </p>
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--graphite)', margin: '0 0 24px' }}>
            You're <strong>{short} edit{short !== 1 ? 's' : ''} short</strong> for this render.
            Add a credit pack below — packs never expire.
          </p>
        )}

        <div style={{
          background: 'var(--background-primary)', border: '1px solid var(--soft-stone)',
          borderRadius: 6, padding: '14px 16px', marginBottom: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
            <span>{planName} plan balance</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{balance} remaining</span>
          </div>
          <div style={{
            position: 'relative', height: 4, margin: '8px 0',
            background: 'var(--soft-stone)', borderRadius: 2
          }}>
            <span style={{
              display: 'block', height: '100%', borderRadius: 2,
              background: 'var(--deep-charcoal)',
              width: `${Math.min(100, (balance / maxVal) * 100)}%`
            }} />
            {needed > 0 && (
              <span style={{
                position: 'absolute', top: -4, width: 2, height: 12,
                background: 'var(--pale-gold)',
                left: `${Math.min(100, (needed / maxVal) * 100)}%`
              }} title={`Needed: ${needed}`} />
            )}
          </div>
        </div>

        {/* Upgrade CTAs for free users */}
        {isFreePlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <button
              className="v-btn v-btn--primary"
              style={{ width: '100%' }}
              onClick={handleUpgrade}
            >
              Upgrade to Pro — $59/mo unlimited
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--graphite)', marginBottom: 12 }}>
          {isFreePlan ? 'Or buy a credit pack' : 'Credit packs'}
        </div>

        <div className="v-pack-list">
          {PACKS.map(p => (
            <button
              key={p.id}
              className={'v-pack' + (pack === p.id ? ' on' : '')}
              onClick={() => setPack(p.id)}
            >
              {'best' in p && p.best && <span className="v-pack-flag">Best value</span>}
              <div className="v-pack-cr">
                <span className="cr">{p.cr}</span>
                <span className="lbl">edits</span>
              </div>
              <div className="v-pack-price">${p.price}</div>
              <div className="v-pack-rate">{p.rate}</div>
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, paddingTop: 16,
          borderTop: '1px solid var(--soft-stone)'
        }}>
          <button className="v-btn v-btn--ghost v-btn--sm" onClick={onClose}>Cancel</button>
          <button className="v-btn v-btn--primary v-btn--sm" onClick={handleBuyCredits}>
            Buy {PACKS.find(p => p.id === pack)?.cr} edits — ${PACKS.find(p => p.id === pack)?.price}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VellumRefillModal;
