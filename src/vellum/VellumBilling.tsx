import React from 'react';
import { Icon } from './icons';

interface BillingProps {
  setPage: (p: string) => void;
  credits: number;
}

const VellumBilling: React.FC<BillingProps> = ({ setPage, credits }) => {
  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Plan & billing</div>
          <h1 className="v-page-title">Refined work, <em>fairly priced.</em></h1>
          <p className="v-page-sub">Each credit is one finished photo or one reel scene. Monthly credits roll over up to 2× your plan amount.</p>
        </div>
      </div>

      <div className="v-plans">
        <div className="v-plan">
          <div className="v-plan-name">Solo</div>
          <div className="v-plan-price">$29<em>/mo</em></div>
          <div className="v-plan-tag">For agents listing under 4 properties / month.</div>
          <ul>
            <li>50 photo credits</li>
            <li>2 reels per month</li>
            <li>Standard staging styles</li>
            <li>MLS-ready exports</li>
            <li>Email support</li>
          </ul>
          <button className="v-plan-cta">Select</button>
        </div>

        <div className="v-plan featured">
          <div className="v-plan-name">Studio</div>
          <div className="v-plan-price">$89<em>/mo</em></div>
          <div className="v-plan-tag">For working agents and small teams.</div>
          <ul>
            <li>200 photo credits</li>
            <li>10 reels per month</li>
            <li>Full staging library</li>
            <li>Twilight & sky replace</li>
            <li>Custom lower-third branding</li>
            <li>Priority processing</li>
          </ul>
          <button className="v-plan-cta">Manage plan</button>
        </div>

        <div className="v-plan">
          <div className="v-plan-name">Brokerage</div>
          <div className="v-plan-price">$249<em>/mo</em></div>
          <div className="v-plan-tag">For teams and brokerages with shared inventory.</div>
          <ul>
            <li>Unlimited photo credits</li>
            <li>40 reels per month</li>
            <li>Up to 12 team members</li>
            <li>Brokerage-wide branding</li>
            <li>MLS bulk import</li>
            <li>Dedicated success manager</li>
          </ul>
          <button className="v-plan-cta">Upgrade</button>
        </div>
      </div>

      <div className="v-section-head" style={{ marginTop: 0 }}>
        <div>
          <div className="eyebrow">Usage</div>
          <h2 className="title">This billing period</h2>
        </div>
      </div>

      <div className="v-kpi-row">
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Photo credits</div>
          <div className="value">{200 - credits}<span style={{ fontSize: 24, color: 'var(--graphite)' }}> / 200</span></div>
          <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${((200 - credits) / 200) * 100}%`, height: '100%', background: 'var(--deep-charcoal)' }} />
          </div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Reels created</div>
          <div className="value">0<span style={{ fontSize: 24, color: 'var(--graphite)' }}> / 10</span></div>
          <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: '0%', height: '100%', background: 'var(--deep-charcoal)' }} />
          </div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Storage</div>
          <div className="value">0<span style={{ fontSize: 24, color: 'var(--graphite)' }}> GB</span></div>
          <div className="delta">Of 50 GB included</div>
        </div>
      </div>

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
    </div>
  );
};

export default VellumBilling;
