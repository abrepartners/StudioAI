import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Loader2, Building2, AlertCircle, Crown, Check } from 'lucide-react';

interface Agent {
  id: string;
  email: string;
  name: string | null;
  added_at: string;
}

interface Brokerage {
  id: string;
  name: string;
  admin_email: string;
  max_seats: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  brokerage_agents: Agent[];
}

type Tier = 'team' | 'brokerage' | 'enterprise';

const TIERS: { id: Tier; name: string; price: number; maxSeats: number; perAgent: string; save: string }[] = [
  { id: 'team',       name: 'Team',       price: 119, maxSeats: 5,  perAgent: '~$24', save: '17%' },
  { id: 'brokerage',  name: 'Brokerage',  price: 299, maxSeats: 15, perAgent: '~$20', save: '31%' },
  { id: 'enterprise', name: 'Enterprise', price: 699, maxSeats: 40, perAgent: '~$17', save: '41%' },
];

interface ManageTeamProps {
  adminEmail: string;
}

const ManageTeam: React.FC<ManageTeamProps> = ({ adminEmail }) => {
  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [brokerageName, setBrokerageName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>('team');
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchBrokerage = useCallback(async () => {
    try {
      const res = await fetch(`/api/brokerage?adminEmail=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (data.ok) {
        setBrokerage(data.brokerage);
      }
    } catch {
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { fetchBrokerage(); }, [fetchBrokerage]);

  // Check for checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && params.get('tier')) {
      setTimeout(() => fetchBrokerage(), 1500);
    }
  }, [fetchBrokerage]);

  const handleCreate = async () => {
    if (!brokerageName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/brokerage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, action: 'create', name: brokerageName.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setBrokerage({ ...data.brokerage, brokerage_agents: [] });
        setShowCreate(false);
      } else {
        setError(data.error || 'Failed to create brokerage');
      }
    } catch {
      setError('Failed to create brokerage');
    } finally {
      setCreating(false);
    }
  };

  const handleCheckout = async () => {
    if (!brokerage) return;
    setCheckingOut(true);
    setError('');
    try {
      const res = await fetch('/api/brokerage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout',
          adminEmail,
          tier: selectedTier,
          brokerageId: brokerage.id,
          returnUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.already_subscribed) {
        fetchBrokerage();
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start checkout');
      }
    } catch {
      setError('Failed to start checkout');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleAddAgent = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/brokerage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail,
          action: 'add_agent',
          agentEmail: newEmail.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewEmail('');
        fetchBrokerage();
      } else {
        setError(data.error || 'Failed to add agent');
      }
    } catch {
      setError('Failed to add agent');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAgent = async (agentEmail: string) => {
    setError('');
    try {
      const res = await fetch('/api/brokerage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, action: 'remove_agent', agentEmail }),
      });
      const data = await res.json();
      if (data.ok) fetchBrokerage();
      else setError(data.error || 'Failed to remove agent');
    } catch {
      setError('Failed to remove agent');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={20} className="text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  // No brokerage yet — show setup
  if (!brokerage) {
    if (!showCreate) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-[var(--color-primary)]" />
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">Manage Team</h4>
          </div>
          <p className="text-xs text-[var(--color-text)]/70">
            Set up a brokerage to give your agents Pro access to StudioAI.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="cta-primary w-full rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            <Building2 size={14} /> Set Up Brokerage
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[var(--color-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">Create Brokerage</h4>
        </div>
        <input
          value={brokerageName}
          onChange={(e) => setBrokerageName(e.target.value)}
          placeholder="Brokerage name (e.g., Keller Williams Chenal)"
          className="w-full rounded-xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2.5 text-sm text-white placeholder:text-[var(--color-text)]/30 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
        />
        {error && (
          <p className="text-xs text-[#FF375F] flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowCreate(false)} className="cta-secondary rounded-xl py-2.5 text-sm font-semibold">Cancel</button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!brokerageName.trim() || creating}
            className="cta-primary rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />} Create
          </button>
        </div>
      </div>
    );
  }

  // Brokerage exists but no subscription — show tier selection
  const hasSubscription = !!brokerage.stripe_subscription_id || !!brokerage.stripe_customer_id;
  const agents = brokerage.brokerage_agents || [];
  const seatsUsed = agents.length;
  const seatsMax = brokerage.max_seats;

  if (!hasSubscription) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[var(--color-primary)]" />
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">{brokerage.name}</h4>
            <p className="text-[10px] text-[var(--color-text)]/50">Choose a plan for your team</p>
          </div>
        </div>

        {/* Tier cards */}
        <div className="space-y-2">
          {TIERS.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setSelectedTier(tier.id)}
              className={`w-full text-left rounded-xl p-3 border transition-all ${
                selectedTier === tier.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'border-[var(--color-border-strong)] bg-black/30 hover:border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[var(--color-ink)]">{tier.name}</span>
                  <span className="ml-2 text-[10px] text-[var(--color-text)]/50">Up to {tier.maxSeats} agents</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-white">${tier.price}</span>
                  <span className="text-[10px] text-[var(--color-text)]/50">/mo</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-[var(--color-text)]/50">{tier.perAgent}/agent</span>
                <span className="text-[10px] font-semibold text-[#30D158]">Save {tier.save}</span>
              </div>
              {selectedTier === tier.id && (
                <div className="absolute top-2 right-2">
                  <Check size={14} className="text-[var(--color-primary)]" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-[var(--color-text)]/40 text-center">
          Individual Pro is $29/agent/mo. Brokerage plans save your team money.
        </div>

        {error && (
          <p className="text-xs text-[#FF375F] flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkingOut}
          className="w-full cta-primary rounded-xl py-3 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {checkingOut ? (
            <><Loader2 size={14} className="animate-spin" /> Starting checkout...</>
          ) : (
            <><Crown size={14} /> Subscribe — ${TIERS.find(t => t.id === selectedTier)!.price}/mo</>
          )}
        </button>

        <p className="text-[9px] text-[var(--color-text)]/30 text-center">
          Powered by Stripe. Cancel anytime. Coupon codes accepted at checkout.
        </p>
      </div>
    );
  }

  // Active subscription — show agent management
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[var(--color-primary)]" />
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">{brokerage.name}</h4>
            <p className="text-[10px] text-[var(--color-text)]/50">{seatsUsed}/{seatsMax} seats used</p>
          </div>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30">
          Admin
        </span>
      </div>

      {/* Seats progress */}
      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min((seatsUsed / seatsMax) * 100, 100)}%`,
            background: seatsUsed >= seatsMax ? '#FF375F' : 'var(--color-primary)',
          }}
        />
      </div>

      {error && (
        <p className="text-xs text-[#FF375F] flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {/* Add agent form */}
      {seatsUsed < seatsMax && (
        <div className="flex gap-1.5">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="agent@email.com"
            type="email"
            className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-black/60 px-2.5 py-2 text-xs text-white placeholder:text-[var(--color-text)]/30 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddAgent(); }}
          />
          <button
            type="button"
            onClick={handleAddAgent}
            disabled={!newEmail.trim() || adding}
            className="rounded-lg px-3 py-2 bg-[var(--color-primary)] text-white text-xs font-semibold disabled:opacity-40 transition-all hover:opacity-90 inline-flex items-center gap-1"
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
          </button>
        </div>
      )}
      {seatsUsed >= seatsMax && (
        <p className="text-[10px] text-[#FF375F] text-center">
          All seats filled. Upgrade your plan to add more agents.
        </p>
      )}

      {/* Agent list */}
      {agents.length === 0 ? (
        <p className="text-xs text-[var(--color-text)]/50 text-center py-3">
          No agents added yet. Add your team members above.
        </p>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between rounded-lg bg-black/30 border border-[var(--color-border)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--color-text)]/70 truncate">{agent.email}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAgent(agent.email)}
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-text)]/40 hover:text-[#FF375F] hover:bg-[#FF375F]/10 transition"
                title="Remove agent"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManageTeam;
