import React, { useState } from 'react';
import { Icon } from './icons';

interface RefillModalProps {
  open: boolean;
  needed: number;
  balance: number;
  onClose: () => void;
  onConfirm: (added: number) => void;
}

const PACKS = [
  { id: 'pack-25', cr: 25, price: 19, rate: '$0.76 / credit' },
  { id: 'pack-50', cr: 50, price: 35, rate: '$0.70 / credit', best: true },
  { id: 'pack-150', cr: 150, price: 89, rate: '$0.59 / credit' },
];

const VellumRefillModal: React.FC<RefillModalProps> = ({ open, needed, balance, onClose, onConfirm }) => {
  const [pack, setPack] = useState('pack-50');

  if (!open) return null;

  const short = Math.max(0, needed - balance);
  const maxVal = Math.max(needed, balance, 1);

  return (
    <div className="v-modal-shade" onClick={onClose}>
      <div className="v-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>

        <div className="v-modal-eyebrow">Credits required</div>
        <h2 className="v-modal-title">A few more credits to <em>finish this export.</em></h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--graphite)', margin: '0 0 24px' }}>
          You're <strong>{short} credits short</strong> for this render. Add a top-up below — packs never expire,
          and credits draw from packs first before your monthly allowance.
        </p>

        <div style={{
          background: 'var(--background-primary)', border: '1px solid var(--soft-stone)',
          borderRadius: 6, padding: '14px 16px', marginBottom: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
            <span>Studio plan balance</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{balance} cr</span>
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
          {needed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: 'var(--graphite)' }}>
              <span>This export</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{needed} cr</span>
            </div>
          )}
        </div>

        <div className="v-pack-list">
          {PACKS.map(p => (
            <button
              key={p.id}
              className={'v-pack' + (pack === p.id ? ' on' : '')}
              onClick={() => setPack(p.id)}
            >
              {'best' in p && p.best && <span className="v-pack-flag">Most chosen</span>}
              <div className="v-pack-cr">
                <span className="cr">{p.cr}</span>
                <span className="lbl">credits</span>
              </div>
              <div className="v-pack-price">${p.price}</div>
              <div className="v-pack-rate">{p.rate}</div>
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', paddingTop: 16,
          borderTop: '1px solid var(--soft-stone)'
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: 3,
              background: 'var(--deep-charcoal)', border: '1px solid var(--deep-charcoal)', color: 'var(--warm-ivory)'
            }}>
              <Icon name="check" size={10} />
            </span>
            Auto-refill when balance drops below 10
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={onClose}>Cancel</button>
            <button
              className="v-btn v-btn--primary v-btn--sm"
              onClick={() => {
                const selected = PACKS.find(p => p.id === pack);
                if (selected) onConfirm(selected.cr);
                onClose();
              }}
            >
              Add credits & continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VellumRefillModal;
