/**
 * components/QualityScore.tsx — D1 Listing Score badge (Cluster J).
 *
 * Small badge that lives on top of every staged result. Shows the overall
 * 1-10 score with a color (red <6, amber 6-8, green >=8). Hover (desktop) or
 * click (mobile/touch) to expand the 4 sub-scores + per-dimension callouts.
 *
 * Lifecycle:
 *  - Fires async after `generatedImage` lands. Does NOT block the user from
 *    seeing the result — badge shows a "Scoring..." spinner until the call
 *    returns.
 *  - Caches by image hash via a parent-owned `useRef<Map>` so re-renders
 *    (history nav, undo/redo) re-use the prior score instead of re-billing
 *    Gemini for the same pixels.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  scoreListingImage,
  hashImageDataUrl,
  type ListingScore,
  type ListingScoreDimension,
} from '../services/qualityScoreService';

interface QualityScoreProps {
  generatedImage: string | null;
  roomType: string;
}

type Tier = 'strong' | 'ok' | 'weak';

const tierFor = (score: number): Tier => {
  if (score >= 8) return 'strong';
  if (score >= 6) return 'ok';
  return 'weak';
};

const TIER_BADGE: Record<Tier, string> = {
  strong: 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/40',
  ok: 'bg-[#FFD60A]/15 text-[#FFD60A] border-[#FFD60A]/40',
  weak: 'bg-[#FF375F]/15 text-[#FF375F] border-[#FF375F]/40',
};

const TIER_BAR: Record<Tier, string> = {
  strong: 'bg-[#30D158]',
  ok: 'bg-[#FFD60A]',
  weak: 'bg-[#FF375F]',
};

const TIER_LABEL: Record<Tier, string> = {
  strong: 'MLS-ready',
  ok: 'Polish suggested',
  weak: 'Needs work',
};

// Module-level cache shared across mounts (e.g. when QualityScore unmounts
// during a panel switch and remounts). Keyed by image hash, value is the
// fully-resolved ListingScore. Score is deterministic per image, so cross-mount
// reuse is safe and keeps Gemini cost flat.
const scoreCache = new Map<string, ListingScore>();
// Inflight promise cache so we don't double-fire if the component re-renders
// while the score is still in flight (StrictMode in dev does this).
const inflight = new Map<string, Promise<ListingScore>>();

const DimensionRow: React.FC<{ label: string; data: ListingScoreDimension }> = ({ label, data }) => {
  const tier = tierFor(data.score);
  const widthPct = (data.score / 10) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-ink)]">{label}</span>
        <span className="text-sm font-mono font-semibold text-[var(--color-ink)] tabular-nums">
          {data.score.toFixed(1)}<span className="text-[var(--color-text)]">/10</span>
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${TIER_BAR[tier]}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-[var(--color-text)]">{data.callout}</p>
    </div>
  );
};

const QualityScore: React.FC<QualityScoreProps> = ({ generatedImage, roomType }) => {
  const [score, setScore] = useState<ListingScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // Track which image URL the current `score` belongs to so a fast image swap
  // doesn't show stale numbers under a fresh result.
  const lastHashRef = useRef<string | null>(null);

  // Stable hash of the current image — same hash = same score, no re-fetch.
  const currentHash = useMemo(
    () => (generatedImage ? hashImageDataUrl(generatedImage) : null),
    [generatedImage],
  );

  useEffect(() => {
    if (!generatedImage || !currentHash) {
      setScore(null);
      setLoading(false);
      return;
    }

    // Cache hit: render instantly, no API call.
    const cached = scoreCache.get(currentHash);
    if (cached) {
      setScore(cached);
      setLoading(false);
      lastHashRef.current = currentHash;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setScore(null);

    // De-dupe: if another mount already fired this hash, ride the same promise.
    let promise = inflight.get(currentHash);
    if (!promise) {
      promise = scoreListingImage(generatedImage, roomType).then((res) => {
        scoreCache.set(currentHash, res);
        inflight.delete(currentHash);
        return res;
      }).catch((err) => {
        inflight.delete(currentHash);
        throw err;
      });
      inflight.set(currentHash, promise);
    }

    promise
      .then((res) => {
        if (cancelled) return;
        // Guard against race: only commit if the image hasn't changed since
        // we kicked off this scoring call.
        if (lastHashRef.current && lastHashRef.current !== currentHash) return;
        lastHashRef.current = currentHash;
        setScore(res);
      })
      .catch((err) => {
        if (cancelled) return;
        // Silent failure — scoring is non-critical. Console-log for debugging,
        // but don't show a user error. The badge just disappears.
        console.warn('[QualityScore] Scoring failed:', err);
        setScore(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [generatedImage, currentHash, roomType]);

  if (!generatedImage) return null;

  // Loading state — small badge with spinner. Same footprint as the final
  // badge so the layout doesn't jump when scoring lands.
  if (loading) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-black/60 backdrop-blur-sm"
        aria-live="polite"
        aria-label="Scoring listing quality"
      >
        <Loader2 size={12} className="animate-spin text-[var(--color-primary)]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
          Scoring
        </span>
      </div>
    );
  }

  if (!score) return null;

  const overallTier = tierFor(score.overall);

  return (
    <div className="relative inline-block group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${TIER_BADGE[overallTier]} backdrop-blur-sm font-semibold tabular-nums shadow-sm hover:shadow-md transition-shadow`}
        aria-expanded={open}
        aria-label={`Listing quality score ${score.overall} out of 10. ${TIER_LABEL[overallTier]}.`}
      >
        <Sparkles size={12} />
        <span className="text-sm">
          {score.overall.toFixed(1)}<span className="opacity-70">/10</span>
        </span>
      </button>

      {open && (
        <div
          // Click handlers are mouse-only; we keep mouse-enter on the popover so
          // users can move into it without it closing.
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-full mt-2 w-72 z-30 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] shadow-xl p-3 space-y-3 animate-slide-down"
          role="dialog"
          aria-label="Listing score details"
        >
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
                Listing Score
              </p>
              <p className="text-xs font-medium text-[var(--color-ink)] mt-0.5">
                {TIER_LABEL[overallTier]}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-[var(--color-ink)] leading-none">
                {score.overall.toFixed(1)}
              </p>
              <p className="text-xs text-[var(--color-text)] mt-0.5">/ 10</p>
            </div>
          </div>
          <div className="space-y-2.5 pt-2 border-t border-white/5">
            <DimensionRow label="Architectural integrity" data={score.architecture} />
            <DimensionRow label="Lighting realism" data={score.lighting} />
            <DimensionRow label="Perspective accuracy" data={score.perspective} />
            <DimensionRow label="Staging quality" data={score.staging} />
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityScore;
