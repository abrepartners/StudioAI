/**
 * components/UsageDashboard.tsx
 *
 * Shows the user their own generation usage + estimated cost from
 * public.generation_logs. Mounted in /settings/billing. Non-user-fatal —
 * if the API errors, the component silently collapses (we're not going to
 * block the settings page on a metrics query).
 *
 * Filters out qa-harness traffic by default (source='app' only). Dev traffic
 * stays hidden unless the ?includeDev=1 URL param is passed to the endpoint.
 */
import React, { useEffect, useState } from 'react';
import { Activity, Sparkles, DollarSign } from 'lucide-react';

interface UsageResponse {
  ok: boolean;
  today?: { calls: number; costUsd: string } | null;
  month?: { calls: number; costUsd: string } | null;
  byTool?: Record<string, { calls: number; costUsd: string }>;
  /** This month's staging engine mix, e.g. { "flux-fill": 84, "seedream": 13 }. */
  stagingEngines?: Record<string, number>;
}

interface Props {
  email: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  stage: 'Virtual Staging',
  staging: 'Virtual Staging',
  cleanup: 'Smart Cleanup',
  declutter: 'Smart Cleanup',
  whiten: 'Photo Correction',
  lawn: 'Lawn Repair',
  twilight: 'Day to Dusk',
  sky: 'Sky Replacement',
  renovation: 'Virtual Renovation',
  score: 'Listing Score',
  'listing-copy': 'Listing Copy',
  'room-detect': 'Room Detection',
  unknown: 'Other',
};

const ENGINE_LABELS: Record<string, string> = {
  'nano-banana': 'Nano (primary)',
  'flux-fill': 'Fill (fallback)',
  seedream: 'Seedream (last resort)',
  unknown: 'Untracked',
};

const UsageDashboard: React.FC<Props> = ({ email }) => {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    fetch(`/api/usage?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d: UsageResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [email]);

  if (!email) return null;
  if (loading) {
    return (
      <div className="premium-surface rounded-2xl p-5">
        <p className="text-sm text-[var(--color-text)]/60">Loading usage…</p>
      </div>
    );
  }
  if (!data?.ok) {
    return (
      <div className="premium-surface rounded-2xl p-5">
        <p className="text-sm text-[var(--color-text)]/60">Usage data unavailable right now.</p>
      </div>
    );
  }

  const today = data.today || { calls: 0, costUsd: '0.00' };
  const month = data.month || { calls: 0, costUsd: '0.00' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="premium-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-[var(--color-text)]/70" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/70">Today</p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[var(--color-ink)]">{today.calls}</p>
          <p className="text-xs text-[var(--color-text)]/60 mt-1">
            generations · est. <span className="tabular-nums">${today.costUsd}</span>
          </p>
        </div>
        <div className="premium-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-[var(--color-text)]/70" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/70">This month</p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[var(--color-ink)]">{month.calls}</p>
          <p className="text-xs text-[var(--color-text)]/60 mt-1">
            generations · est. <span className="tabular-nums">${month.costUsd}</span>
          </p>
        </div>
      </div>

      {data.byTool && Object.keys(data.byTool).length > 0 && (
        <div className="premium-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-[var(--color-text)]/70" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/70">By tool · last 30 days</p>
          </div>
          <div className="space-y-2">
            {Object.entries(data.byTool as Record<string, { calls: number; costUsd: string }>)
              .sort((a, b) => b[1].calls - a[1].calls)
              .map(([tool, stats]) => (
                <div key={tool} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-ink)]">{TOOL_LABELS[tool] || tool}</span>
                  <span className="text-[var(--color-text)]/60 tabular-nums">
                    {stats.calls} · ${stats.costUsd}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.stagingEngines && Object.keys(data.stagingEngines).length > 0 && (() => {
        const entries = Object.entries(data.stagingEngines as Record<string, number>);
        const total = entries.reduce((s, [, n]) => s + n, 0);
        const fallback = (data.stagingEngines as Record<string, number>)['seedream'] || 0;
        const fallbackPct = total > 0 ? Math.round((fallback / total) * 100) : 0;
        return (
          <div className="premium-surface rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-[var(--color-text)]/70" />
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/70">Staging engine · this month</p>
            </div>
            <div className="space-y-2">
              {entries
                .sort((a, b) => b[1] - a[1])
                .map(([eng, n]) => (
                  <div key={eng} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-ink)]">{ENGINE_LABELS[eng] || eng}</span>
                    <span className="text-[var(--color-text)]/60 tabular-nums">
                      {n} · {total > 0 ? Math.round((n / total) * 100) : 0}%
                    </span>
                  </div>
                ))}
            </div>
            <p className="text-xs text-[var(--color-text)]/50 mt-3">
              Fallback rate: {fallbackPct}%. Rising fallback means floor detection is degrading — check staging quality.
            </p>
          </div>
        );
      })()}

      <p className="text-xs text-[var(--color-text)]/50 px-1">
        Estimates based on public model list pricing. Excludes internal QA traffic. Your provider
        bill is the authoritative number — this view is for same-day visibility.
      </p>
    </div>
  );
};

export default UsageDashboard;
