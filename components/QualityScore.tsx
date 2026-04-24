/**
 * components/QualityScore.tsx — D1 Listing Score badge (Cluster J).
 *
 * v2 UPGRADE: circular SVG dial that animates from 0 → score when the value
 * lands. Replaces the flat pill badge. Expanded popover unchanged (dimensions
 * still list out on hover/focus). Zero API change; same props.
 *
 * Visual spec:
 *  - 56×56 circular dial with a thin (3px) background ring and a tier-colored
 *    progress ring that fills clockwise over 900ms with ease-out.
 *  - Center shows the score number in tabular-nums; small "/10" under it.
 *  - Tier colors match prior behavior (green ≥8, amber 6-8, red <6).
 *  - Subtle outer halo glow in the tier color on "strong" tier.
 *  - Liquid-glass container (backdrop-blur + inner highlight) on popover.
 *
 * Lifecycle unchanged — same score fetch, cache, and race-guard logic.
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

// Tier → ring stroke color + glow color + text color.
const TIER_RING: Record<Tier, string> = {
  strong: '#30D158',
  ok: '#FFD60A',
  weak: '#FF375F',
};

const TIER_GLOW: Record<Tier, string> = {
  strong: 'rgba(48, 209, 88, 0.35)',
  ok: 'rgba(255, 214, 10, 0.25)',
  weak: 'rgba(255, 55, 95, 0.28)',
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

// Module-level caches (unchanged from v1).
const scoreCache = new Map<string, ListingScore>();
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
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${TIER_BAR[tier]}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-[var(--color-text)]">{data.callout}</p>
    </div>
  );
};

// ─── Animated ring dial ────────────────────────────────────────────────
// Uses stroke-dasharray + stroke-dashoffset trick. We mount at offset=full
// (empty) and animate to offset=full*(1 - score/10) via CSS transition.
const ScoreDial: React.FC<{ score: number; tier: Tier; size?: number }> = ({ score, tier, size = 56 }) => {
  const strokeW = 3;
  const r = (size - strokeW * 2) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(10, score));
  const offset = c * (1 - target / 10);

  // Start from empty, then snap to target after first paint so the CSS
  // transition plays. Without this the dial renders pre-filled.
  const [animatedOffset, setAnimatedOffset] = useState(c);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimatedOffset(offset));
    return () => cancelAnimationFrame(id);
  }, [offset, c]);

  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        // Subtle glow only on strong scores — rewards completion, doesn't
        // scream on amber/red which users shouldn't celebrate.
        filter: tier === 'strong' ? `drop-shadow(0 0 8px ${TIER_GLOW[tier]})` : undefined,
      }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={strokeW}
        />
        {/* Foreground progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TIER_RING[tier]}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={animatedOffset}
          style={{
            transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[13px] font-bold tabular-nums leading-none"
          style={{ color: TIER_RING[tier] }}
        >
          {target.toFixed(1)}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white/40 leading-none mt-0.5">
          /10
        </span>
      </div>
    </div>
  );
};

const QualityScore: React.FC<QualityScoreProps> = ({ generatedImage, roomType }) => {
  const [score, setScore] = useState<ListingScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const lastHashRef = useRef<string | null>(null);

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
        if (lastHashRef.current && lastHashRef.current !== currentHash) return;
        lastHashRef.current = currentHash;
        setScore(res);
      })
      .catch((err) => {
        if (cancelled) return;
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

  // Loading state — same footprint as the final dial (56×56) so no layout jump.
  if (loading) {
    return (
      <div
        className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/50 backdrop-blur-xl"
        style={{ width: 56, height: 56 }}
        aria-live="polite"
        aria-label="Scoring listing quality"
      >
        <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
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
        className="rounded-full p-1 hover:scale-105 active:scale-95 transition-transform"
        aria-expanded={open}
        aria-label={`Listing quality score ${score.overall} out of 10. ${TIER_LABEL[overallTier]}.`}
      >
        <ScoreDial score={score.overall} tier={overallTier} />
      </button>

      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 top-full mt-2 w-72 z-30 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-2xl shadow-2xl shadow-black/60 p-4 space-y-3 animate-slide-down"
          role="dialog"
          aria-label="Listing score details"
          style={{
            // Inner highlight — liquid glass top sheen.
            boxShadow:
              '0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles size={14} className="text-[var(--color-primary)]" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
                  Listing Score
                </p>
                <p className="text-sm font-semibold text-white mt-0.5" style={{ color: TIER_RING[overallTier] }}>
                  {TIER_LABEL[overallTier]}
                </p>
              </div>
            </div>
            <ScoreDial score={score.overall} tier={overallTier} size={48} />
          </div>
          <div className="space-y-3 pt-3 border-t border-white/5">
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
