import React, { useState, useEffect, useCallback } from 'react';
import { Share2, Copy, Check, Loader2, Gift, Users } from 'lucide-react';

interface ReferralCode {
  id: string;
  code: string;
  discount_price: number;
  max_uses: number;
  times_used: number;
  is_early_bird: boolean;
}

interface Referral {
  id: string;
  referred_email: string;
  referred_subscribed: boolean;
  created_at: string;
}

interface ReferralDashboardProps {
  userEmail: string;
  userId: string;
}

const ReferralDashboard: React.FC<ReferralDashboardProps> = ({ userEmail, userId }) => {
  const [code, setCode] = useState<ReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [earlyBirdRemaining, setEarlyBirdRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [codeRes, slotsRes] = await Promise.all([
        fetch(`/api/referral?action=my_code&email=${encodeURIComponent(userEmail)}`).then(r => r.json()),
        fetch('/api/referral?action=early_bird_status').then(r => r.json()),
      ]);

      if (codeRes.ok) {
        setCode(codeRes.code);
        setReferrals(codeRes.referrals || []);
      }
      if (slotsRes.ok) {
        setEarlyBirdRemaining(slotsRes.slotsRemaining);
      }
    } catch {
      setError('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClaimEarlyBird = async () => {
    setClaiming(true);
    setError('');
    try {
      // Claim early bird spot
      const claimRes = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_early_bird', email: userEmail }),
      }).then(r => r.json());

      if (!claimRes.ok) {
        setError(claimRes.error || 'Failed to claim spot');
        setClaiming(false);
        return;
      }

      // Start checkout at early bird price
      const checkoutRes = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout',
          email: userEmail,
          userId,
          price: 1400,
          returnUrl: window.location.origin,
        }),
      }).then(r => r.json());

      if (checkoutRes.already_subscribed) {
        setCode(claimRes.code);
        fetchData();
        setClaiming(false);
        return;
      }

      if (checkoutRes.url) {
        window.location.href = checkoutRes.url;
      } else {
        setError(checkoutRes.error || 'Checkout failed');
        setClaiming(false);
      }
    } catch {
      setError('Failed to start checkout');
      setClaiming(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    const url = `${window.location.origin}?ref=${code.code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={16} className="text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  // No code yet — show early bird CTA or standard referral
  if (!code) {
    const spotsLeft = earlyBirdRemaining ?? 0;
    const hasSpots = spotsLeft > 0;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-[#FFD60A]" />
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">
            {hasSpots ? 'Early Bird Special' : 'Refer & Earn'}
          </h4>
        </div>

        {hasSpots ? (
          <>
            <div className="rounded-xl border border-[#FFD60A]/30 bg-[#FFD60A]/[0.04] p-3">
              <p className="text-xs text-zinc-300">
                Lock in <span className="font-bold text-white">$14/mo</span> forever (regular $29). Get a referral code to share the same rate with up to 5 friends.
              </p>
              <p className="text-xs text-[#FFD60A] font-semibold mt-1.5">
                {spotsLeft} of 20 spots remaining
              </p>
              <div className="h-1.5 bg-black/40 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full bg-[#FFD60A] transition-all"
                  style={{ width: `${((20 - spotsLeft) / 20) * 100}%` }}
                />
              </div>
            </div>

            {error && <p className="text-xs text-[#FF375F]">{error}</p>}

            <button
              type="button"
              onClick={handleClaimEarlyBird}
              disabled={claiming}
              className="w-full rounded-xl py-2.5 text-sm font-bold bg-[#FFD60A] text-black hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
              Claim Early Bird — $14/mo
            </button>
          </>
        ) : (
          <p className="text-xs text-[var(--color-text)]/50">
            Early bird spots are filled. Subscribe to Pro to get a referral code.
          </p>
        )}
      </div>
    );
  }

  // Has a code — show dashboard
  const usesLeft = code.max_uses - code.times_used;
  const shareUrl = `${window.location.origin}?ref=${code.code}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={16} className="text-[var(--color-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">Your Referral Code</h4>
        </div>
        {code.is_early_bird && (
          <span className="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/30">
            Early Bird
          </span>
        )}
      </div>

      {/* Code display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg bg-black/60 border border-[var(--color-border-strong)] px-3 py-2 text-sm font-mono font-bold text-[var(--color-primary)] text-center tracking-wider">
          {code.code}
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="rounded-lg px-3 py-2 bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-90 transition inline-flex items-center gap-1"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy Link'}
        </button>
      </div>

      <p className="text-xs text-[var(--color-text)]/50">
        Friends who use your code get Pro at ${(code.discount_price / 100).toFixed(0)}/mo. {usesLeft} use{usesLeft !== 1 ? 's' : ''} remaining.
      </p>

      {/* Usage bar */}
      <div className="flex items-center gap-2">
        <Users size={12} className="text-[var(--color-text)]/40" />
        <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${(code.times_used / code.max_uses) * 100}%` }}
          />
        </div>
        <span className="text-xs text-[var(--color-text)]/50 tabular-nums">{code.times_used}/{code.max_uses}</span>
      </div>

      {/* Referral list */}
      {referrals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text)]/40 font-semibold">Referrals</p>
          {referrals.map((ref) => (
            <div key={ref.id} className="flex items-center justify-between rounded-lg bg-black/30 border border-[var(--color-border)] px-3 py-1.5">
              <span className="text-xs text-[var(--color-text)]/70 truncate">{ref.referred_email}</span>
              <span className={`text-xs font-semibold ${ref.referred_subscribed ? 'text-[#30D158]' : 'text-zinc-500'}`}>
                {ref.referred_subscribed ? 'Subscribed' : 'Signed up'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReferralDashboard;
