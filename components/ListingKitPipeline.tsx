/**
 * ListingKitPipeline.tsx — D4 (Cluster K) one-click Listing Kit pipeline.
 *
 * Single button that runs the saved A&B "AI Listing Kit" recipe end-to-end:
 *   1. Stage all uploaded photos        (geminiService.generateRoomDesign)
 *   2. Apply dusk to the chosen hero    (twilightService.fluxTwilight)
 *   3. Smart cleanup pass on every shot (geminiService.instantDeclutter)
 *   4. MLS export (HD Landscape preset) (utils/imageExport.processForMLS)
 *   5. Social pack — branded just-listed
 *      tile via the existing /api/render-template endpoint that backs SocialPack
 *   6. Listing copy in luxury tone      (geminiService.generateListingCopy)
 *
 * Output: a single zip with five sub-folders + listing_description.txt that the
 * user downloads with one click. Cancel mid-pipeline is wired through an
 * AbortController so partial results stay downloadable.
 *
 * UI surface: a modal launched from the App.tsx batch view header. Renders the
 * uploaded photos, a hero-shot dropdown, a Generate button, a progress bar
 * stamped "Step N/6: <label>…" and a Cancel/Download Partial control.
 *
 * Concurrency: staging + cleanup steps run a small worker pool (default 3) so
 * we don't synchronously fire 25+ Gemini calls at once and trip rate limits.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  ChevronDown,
  Wand2,
  Sunset,
  Eraser,
  Package,
  Share2,
  FileText,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  generateRoomDesign,
  generateListingCopy,
  type ListingCopyPropertyDetails,
  type ListingCopyTone,
} from '../services/geminiService';
import { fluxCleanup } from '../services/fluxService';
import { fluxTwilight } from '../services/twilightService';
import {
  processForMLS,
  MLS_PRESETS,
  dataURLtoBlob,
  downloadBlob,
} from '../utils/imageExport';
import type { BatchImage } from './BatchUploader';
import { useBrandKit } from '../hooks/useBrandKit';
import { buildCleanupSignal, type CleanupQualitySignal } from '../src/types/cleanupQuality';
import { trackCleanupRisk } from '../src/lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListingKitPipelineProps {
  images: BatchImage[];
  isOpen: boolean;
  onClose: () => void;
  isPro?: boolean;
  /** Optional pre-filled property details. Passed straight to the listing-copy step. */
  propertyDetails?: ListingCopyPropertyDetails;
  /** Optional tone override. Defaults to luxury per the D4 spec. */
  tone?: ListingCopyTone;
  /** Concurrency for the staging + cleanup worker pools. Default 3. */
  concurrency?: number;
}

type StepKey = 'stage' | 'twilight' | 'cleanup' | 'mls' | 'social' | 'copy';

interface StepDef {
  key: StepKey;
  label: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { key: 'stage',    label: 'Staging photos',           icon: Wand2 },
  { key: 'twilight', label: 'Twilight hero',            icon: Sunset },
  { key: 'cleanup',  label: 'Smart cleanup',            icon: Eraser },
  { key: 'mls',      label: 'MLS export',               icon: Package },
  { key: 'social',   label: 'Social pack',              icon: Share2 },
  { key: 'copy',     label: 'Listing copy',             icon: FileText },
];

interface PipelineState {
  currentStep: number;          // 0-based
  stepStatus: Record<StepKey, 'pending' | 'running' | 'done' | 'error' | 'cancelled'>;
  stepDetail: string;           // e.g. "3/8 photos"
  stepError: Partial<Record<StepKey, string>>;
}

const initialPipelineState = (): PipelineState => ({
  currentStep: -1,
  stepStatus: {
    stage: 'pending', twilight: 'pending', cleanup: 'pending',
    mls: 'pending', social: 'pending', copy: 'pending',
  },
  stepDetail: '',
  stepError: {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalise either a base64 string ("iVBORw0K…") OR a data URL to a data URL.
// Gemini returns raw base64; uploads/orig images are data URLs. The MLS+zip
// path needs a real Blob, so we go through dataURLtoBlob().
function toDataUrl(b64OrDataUrl: string): string {
  if (b64OrDataUrl.startsWith('data:')) return b64OrDataUrl;
  return `data:image/jpeg;base64,${b64OrDataUrl}`;
}

function safeName(label: string, idx: number): string {
  const slug = (label || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'photo';
  return `${String(idx + 1).padStart(3, '0')}_${slug}`;
}

// Bounded worker pool — kept inline so we don't pull a dep just for this. Errors
// are captured on the result item so a single failure doesn't kill the batch.
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
  abortSignal?: AbortSignal
): Promise<Array<{ ok: true; value: R } | { ok: false; error: Error }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: Error }> = new Array(items.length);
  let cursor = 0;
  let done = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      if (abortSignal?.aborted) throw new Error('ABORTED');
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await worker(items[i], i);
        results[i] = { ok: true, value };
      } catch (err: any) {
        results[i] = { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
      } finally {
        done++;
        onProgress?.(done, items.length);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function isAbort(err: any): boolean {
  return err?.name === 'AbortError' || err?.message === 'ABORTED';
}

// ─── Component ────────────────────────────────────────────────────────────────

const ListingKitPipeline: React.FC<ListingKitPipelineProps> = ({
  images,
  isOpen,
  onClose,
  isPro = false,
  propertyDetails,
  tone = 'luxury' as ListingCopyTone,
  concurrency = 3,
}) => {
  const { brandKit } = useBrandKit();
  const [heroId, setHeroId] = useState<string>(() => images[0]?.id || '');
  const [state, setState] = useState<PipelineState>(initialPipelineState);
  const [running, setRunning] = useState(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipName, setZipName] = useState<string>('listing_kit.zip');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [cleanupQuality, setCleanupQuality] = useState<CleanupQualitySignal | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset hero default whenever the source image set changes.
  useEffect(() => {
    if (!heroId || !images.find(i => i.id === heroId)) {
      setHeroId(images[0]?.id || '');
    }
  }, [images, heroId]);

  // Cancel + close on unmount so the modal doesn't leak in-flight Gemini calls.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateStep = useCallback((key: StepKey, partial: Partial<Pick<PipelineState, 'stepDetail'>> & { status?: PipelineState['stepStatus'][StepKey]; errorMsg?: string }) => {
    setState(prev => {
      const stepIdx = STEPS.findIndex(s => s.key === key);
      const next: PipelineState = {
        ...prev,
        stepStatus: { ...prev.stepStatus },
        stepError: { ...prev.stepError },
      };
      if (partial.status) next.stepStatus[key] = partial.status;
      if (partial.status === 'running') next.currentStep = stepIdx;
      if (partial.stepDetail !== undefined) next.stepDetail = partial.stepDetail;
      if (partial.errorMsg) next.stepError[key] = partial.errorMsg;
      return next;
    });
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClose = useCallback(() => {
    if (running) handleCancel();
    onClose();
  }, [running, handleCancel, onClose]);

  const handleGenerate = useCallback(async () => {
    if (running || images.length === 0) return;
    setRunning(true);
    setFatalError(null);
    setZipBlob(null);
    setCleanupQuality(null);
    setState(initialPipelineState());

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    // Per-step bag of partial results so cancel still produces a useful zip.
    const stagedByImageId = new Map<string, string>();        // base64 OR data URL
    const cleanedByImageId = new Map<string, string>();
    let twilightHero: string | null = null;
    let mlsZipBlob: Blob | null = null;
    let socialPng: Blob | null = null;
    let listingCopy: { headline: string; description: string; socialCaption: string; hashtags: string[] } | null = null;

    const heroImage = images.find(i => i.id === heroId) || images[0];

    try {
      // ─── Step 1 — Stage everything (concurrent worker pool) ─────────────
      updateStep('stage', { status: 'running', stepDetail: `0/${images.length} photos` });
      const stageResults = await runPool<BatchImage, string>(
        images,
        concurrency,
        async (img) => {
          if (signal.aborted) throw new Error('ABORTED');
          const roomType = img.roomType || 'Living Room';
          const prompt = `Virtually stage this ${roomType}. Add appropriate, style-neutral modern furniture and decor. Preserve all existing wall colors, floor colors, ceiling, architecture, layout, windows, doors, and built-in fixtures EXACTLY as they are. Do NOT change or color-grade existing surfaces. Keep the exact same framing and crop.`;
          const out = await generateRoomDesign(img.base64, prompt, null, false, 1, isPro, null, signal);
          return out[0];
        },
        (done, total) => updateStep('stage', { stepDetail: `${done}/${total} photos` }),
        signal
      );
      stageResults.forEach((r, i) => {
        if (r.ok) stagedByImageId.set(images[i].id, r.value);
      });
      const stageFails = stageResults.filter(r => !r.ok).length;
      updateStep('stage', {
        status: stageFails === images.length ? 'error' : 'done',
        stepDetail: stageFails > 0 ? `${images.length - stageFails}/${images.length} succeeded` : `${images.length}/${images.length} photos`,
        errorMsg: stageFails > 0 ? `${stageFails} failed (used originals as fallback)` : undefined,
      });
      if (signal.aborted) throw new Error('ABORTED');

      // ─── Step 2 — Twilight on the hero (single call, fast) ──────────────
      updateStep('twilight', { status: 'running', stepDetail: heroImage.roomType || 'hero' });
      try {
        const heroSource = stagedByImageId.get(heroImage.id) || heroImage.base64;
        const { resultBase64 } = await fluxTwilight(heroSource, 'warm-classic', signal);
        twilightHero = resultBase64;
        updateStep('twilight', { status: 'done', stepDetail: 'dusk applied' });
      } catch (err: any) {
        if (isAbort(err)) throw err;
        // Twilight is best-effort — we still ship the kit if dusk fails.
        updateStep('twilight', { status: 'error', errorMsg: err?.message || 'failed' });
      }
      if (signal.aborted) throw new Error('ABORTED');

      // ─── Step 3 — Smart cleanup on every shot ───────────────────────────
      updateStep('cleanup', { status: 'running', stepDetail: `0/${images.length} photos` });
      const cleanupResults = await runPool<BatchImage, string>(
        images,
        concurrency,
        async (img) => {
          if (signal.aborted) throw new Error('ABORTED');
          // Cleanup runs on the staged version when available — that's the user
          // intent: clutter on a real listing photo gets removed AFTER staging.
          // Hero cleanup applies to the twilight render so the user gets one
          // pristine dusk hero in the cleanup folder too.
          const source = img.id === heroImage.id && twilightHero
            ? twilightHero
            : (stagedByImageId.get(img.id) || img.base64);
          const { resultBase64 } = await fluxCleanup(source, img.roomType || 'Living Room', signal);
          return resultBase64;
        },
        (done, total) => updateStep('cleanup', { stepDetail: `${done}/${total} photos` }),
        signal
      );
      cleanupResults.forEach((r, i) => {
        if (r.ok) cleanedByImageId.set(images[i].id, r.value);
      });
      const cleanupFails = cleanupResults.filter(r => !r.ok).length;
      updateStep('cleanup', {
        status: cleanupFails === images.length ? 'error' : 'done',
        stepDetail: cleanupFails > 0 ? `${images.length - cleanupFails}/${images.length} succeeded` : `${images.length}/${images.length} photos`,
        errorMsg: cleanupFails > 0 ? `${cleanupFails} failed (used staged as fallback)` : undefined,
      });
      const cleanupSignal = cleanupFails === images.length
        ? buildCleanupSignal({
            risk: 'high',
            source: 'listing-kit',
            reason: 'Cleanup failed across all listing-kit images.',
            compositeMode: 'not_applicable',
            nextActions: ['Retry kit with fewer images', 'Run cleanup manually on key hero photos'],
          })
        : cleanupFails > 0
          ? buildCleanupSignal({
              risk: 'review',
              source: 'listing-kit',
              reason: `${cleanupFails} cleanup pass(es) fell back to staged outputs.`,
              compositeMode: 'fallback_raw_after_error',
              nextActions: ['Review cleanup folder before sharing', 'Retry failed photos individually'],
            })
          : buildCleanupSignal({
              risk: 'review',
              source: 'listing-kit',
              reason: 'Cleanup completed for all images; review key rooms before sharing.',
              compositeMode: 'applied',
              nextActions: ['Review cleanup folder before sharing', 'Continue to export'],
            });
      setCleanupQuality(cleanupSignal);
      trackCleanupRisk(cleanupSignal.risk, { source: 'listing-kit', images: images.length, fails: cleanupFails });
      if (signal.aborted) throw new Error('ABORTED');

      // ─── Step 4 — MLS zip (HD Landscape) ────────────────────────────────
      // We bundle the per-image MLS jpegs into the final zip directly rather
      // than triggering a second download — that's the whole point of D4.
      updateStep('mls', { status: 'running', stepDetail: `0/${images.length} photos` });
      const preset = MLS_PRESETS.find(p => p.name === 'HD Landscape') ?? MLS_PRESETS[0];
      const mlsZip = new JSZip();
      let mlsDone = 0;
      for (const img of images) {
        if (signal.aborted) throw new Error('ABORTED');
        const source = cleanedByImageId.get(img.id)
          || stagedByImageId.get(img.id)
          || img.base64;
        try {
          const blob = await processForMLS(toDataUrl(source), preset);
          mlsZip.file(`${safeName(img.roomType || 'room', mlsDone)}_mls.jpg`, blob);
        } catch (err) {
          // Skip individual MLS failures rather than aborting the whole pipeline.
          console.warn('[ListingKit] MLS export skipped for image', img.id, err);
        }
        mlsDone++;
        updateStep('mls', { stepDetail: `${mlsDone}/${images.length} photos` });
      }
      mlsZipBlob = await mlsZip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      updateStep('mls', { status: 'done', stepDetail: `${images.length}/${images.length} photos` });
      if (signal.aborted) throw new Error('ABORTED');

      // ─── Step 5 — Social pack (Just Listed via /api/render-template) ────
      // Reuses the SocialPack server endpoint so the pipeline ships the same
      // branded tile the manual flow produces. Best-effort: a brand-kit gap or
      // network blip can't fail the kit, so we degrade to a hero-only PNG.
      updateStep('social', { status: 'running', stepDetail: 'rendering tile' });
      try {
        const socialHero = cleanedByImageId.get(heroImage.id) || twilightHero || stagedByImageId.get(heroImage.id) || heroImage.base64;
        const heroDataUrl = toDataUrl(socialHero);
        // Brand kit loaded via the shared hook — covers the split-image fallback
        // path automatically. Missing fields degrade to `undefined` so the
        // render-template endpoint just skips the agent card.
        const data: Record<string, any> = {
          heroImage: heroDataUrl,
          agentName: brandKit.agentName || undefined,
          brokerageName: brandKit.brokerageName || undefined,
          phone: brandKit.phone || undefined,
          email: brandKit.email || undefined,
          website: brandKit.website || undefined,
          primaryColor: brandKit.primaryColor,
          logo: brandKit.logo || undefined,
          headshot: brandKit.headshot || undefined,
          address: propertyDetails?.address,
          beds: propertyDetails?.beds,
          baths: propertyDetails?.baths,
          sqft: propertyDetails?.sqft,
          price: propertyDetails?.price ? `$${propertyDetails.price.toLocaleString()}` : undefined,
        };
        const res = await fetch('/api/render-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: 'just-listed', format: 'ig-post', data }),
          signal,
        });
        if (!res.ok) throw new Error(`render-template HTTP ${res.status}`);
        socialPng = await res.blob();
        updateStep('social', { status: 'done', stepDetail: '1×1 ig-post' });
      } catch (err: any) {
        if (isAbort(err)) throw err;
        updateStep('social', { status: 'error', errorMsg: err?.message || 'render failed' });
      }
      if (signal.aborted) throw new Error('ABORTED');

      // ─── Step 6 — Listing copy (luxury tone default) ────────────────────
      updateStep('copy', { status: 'running', stepDetail: tone });
      try {
        const copySource = cleanedByImageId.get(heroImage.id)
          || stagedByImageId.get(heroImage.id)
          || heroImage.base64;
        listingCopy = await generateListingCopy(toDataUrl(copySource), heroImage.roomType || 'Living Room', {
          tone,
          propertyDetails,
          abortSignal: signal,
        });
        updateStep('copy', { status: 'done', stepDetail: `${listingCopy.description.length} chars` });
      } catch (err: any) {
        if (isAbort(err)) throw err;
        updateStep('copy', { status: 'error', errorMsg: err?.message || 'generation failed' });
      }
    } catch (err: any) {
      if (isAbort(err)) {
        // Mark every still-pending/running step as cancelled so the UI tells
        // the user exactly where the pipeline halted.
        setState(prev => {
          const stepStatus = { ...prev.stepStatus };
          for (const k of Object.keys(stepStatus) as StepKey[]) {
            if (stepStatus[k] === 'running' || stepStatus[k] === 'pending') stepStatus[k] = 'cancelled';
          }
          return { ...prev, stepStatus };
        });
      } else {
        setFatalError(err?.message || 'Pipeline failed');
      }
    } finally {
      // Always assemble whatever we have so partial results are downloadable.
      try {
        const finalZip = new JSZip();
        const stagedFolder = finalZip.folder('staged_photos');
        const cleanupFolder = finalZip.folder('cleanup_photos');
        const mlsFolder = finalZip.folder('mls_exports');
        const socialFolder = finalZip.folder('social_pack');

        images.forEach((img, idx) => {
          const staged = stagedByImageId.get(img.id);
          if (staged && stagedFolder) {
            stagedFolder.file(`${safeName(img.roomType || 'room', idx)}_staged.jpg`, dataURLtoBlob(toDataUrl(staged)));
          }
          const cleaned = cleanedByImageId.get(img.id);
          if (cleaned && cleanupFolder) {
            cleanupFolder.file(`${safeName(img.roomType || 'room', idx)}_cleanup.jpg`, dataURLtoBlob(toDataUrl(cleaned)));
          }
        });

        if (twilightHero && stagedFolder) {
          stagedFolder.file(`000_hero_twilight.jpg`, dataURLtoBlob(toDataUrl(twilightHero)));
        }
        if (mlsZipBlob && mlsFolder) {
          mlsFolder.file('mls_export_hd_landscape.zip', mlsZipBlob);
        }
        if (socialPng && socialFolder) {
          socialFolder.file('just_listed_ig_post.png', socialPng);
        }
        if (listingCopy) {
          const txt = [
            `HEADLINE`, `--------`, listingCopy.headline, '',
            `DESCRIPTION`, `-----------`, listingCopy.description, '',
            `SOCIAL CAPTION`, `--------------`, listingCopy.socialCaption, '',
            `HASHTAGS`, `--------`, listingCopy.hashtags.map(h => `#${h}`).join(' '),
          ].join('\n');
          finalZip.file('listing_description.txt', txt);
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const generated = await finalZip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        setZipBlob(generated);
        setZipName(`listing_kit_${stamp}.zip`);
      } catch (zipErr) {
        console.error('[ListingKit] zip assembly failed:', zipErr);
        if (!fatalError) setFatalError('Failed to assemble final zip');
      }
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, images, heroId, isPro, propertyDetails, tone, concurrency, fatalError, updateStep, brandKit]);

  const handleDownload = useCallback(() => {
    if (zipBlob) downloadBlob(zipBlob, zipName);
  }, [zipBlob, zipName]);

  // ─── Derived UI state ───────────────────────────────────────────────────
  const completedSteps = useMemo(
    () => STEPS.filter(s => state.stepStatus[s.key] === 'done').length,
    [state.stepStatus]
  );
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);
  const currentStepDef = state.currentStep >= 0 ? STEPS[state.currentStep] : null;
  const allDone = STEPS.every(s => state.stepStatus[s.key] === 'done');
  const partial = !running && !!zipBlob && !allDone;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Generate Listing Kit"
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#0A84FF]/15 text-[#0A84FF]">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-white font-semibold text-base leading-tight">Generate Listing Kit</h3>
              <p className="text-sm text-zinc-500">One-click recipe — staged + dusk + cleanup + MLS + social + copy</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Photo summary + hero picker */}
          <div className="rounded-xl border border-zinc-800 bg-black/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm uppercase tracking-wider text-zinc-500 font-semibold">
                {images.length} photo{images.length === 1 ? '' : 's'} queued
              </span>
              <span className="text-xs text-zinc-600">Concurrency {concurrency}</span>
            </div>

            {/* Photo strip */}
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {images.slice(0, 16).map(img => (
                <div
                  key={img.id}
                  className={`relative aspect-square rounded-md overflow-hidden border ${
                    img.id === heroId ? 'border-[#0A84FF] ring-2 ring-[#0A84FF]/30' : 'border-zinc-800'
                  }`}
                  title={img.roomType || 'Photo'}
                >
                  <img src={img.base64} alt={img.roomType || ''} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
              {images.length > 16 && (
                <div className="aspect-square rounded-md border border-zinc-800 bg-black/60 flex items-center justify-center text-xs font-semibold text-zinc-400">
                  +{images.length - 16}
                </div>
              )}
            </div>

            {/* Hero selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="lk-hero" className="text-sm uppercase tracking-wider text-zinc-500 font-semibold whitespace-nowrap">
                Hero shot
              </label>
              <div className="relative flex-1">
                <select
                  id="lk-hero"
                  value={heroId}
                  onChange={(e) => setHeroId(e.target.value)}
                  disabled={running}
                  className="w-full appearance-none rounded-lg bg-black border border-zinc-800 text-zinc-100 text-xs font-medium px-2.5 py-1.5 pr-8 focus:outline-none focus:border-[#0A84FF] disabled:opacity-50"
                >
                  {images.map((img, i) => (
                    <option key={img.id} value={img.id}>
                      #{i + 1} — {img.roomType || 'Photo'}{i === 0 ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Progress bar (visible while running OR after) */}
          {(running || allDone || partial || fatalError) && (
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-wider text-zinc-400 font-semibold">
                  {currentStepDef && running
                    ? `Step ${state.currentStep + 1}/${STEPS.length}: ${currentStepDef.label}…`
                    : allDone
                    ? 'Listing kit complete'
                    : partial
                    ? 'Cancelled — partial results ready'
                    : 'Pipeline error'}
                </div>
                <div className="text-xs text-zinc-500 font-mono">{progressPct}%</div>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%`, background: allDone ? '#30D158' : '#0A84FF' }}
                />
              </div>
              {state.stepDetail && running && (
                <p className="text-sm text-zinc-400">{state.stepDetail}</p>
              )}
            </div>
          )}

          {/* Step list */}
          <ol className="space-y-1.5">
            {STEPS.map((step, idx) => {
              const status = state.stepStatus[step.key];
              const Icon = step.icon;
              const stateColor =
                status === 'done' ? 'text-[#30D158]' :
                status === 'running' ? 'text-[#0A84FF]' :
                status === 'error' ? 'text-[#FF375F]' :
                status === 'cancelled' ? 'text-zinc-500' : 'text-zinc-600';
              return (
                <li
                  key={step.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                    status === 'running' ? 'border-[#0A84FF]/30 bg-[#0A84FF]/5' :
                    status === 'done' ? 'border-zinc-800 bg-black/30' :
                    status === 'error' ? 'border-[#FF375F]/30 bg-[#FF375F]/5' :
                    'border-zinc-800/60'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center bg-zinc-900 border border-zinc-800 ${stateColor}`}>
                    {status === 'running' ? <Loader2 size={13} className="animate-spin" /> :
                     status === 'done' ? <CheckCircle2 size={13} /> :
                     status === 'error' ? <AlertCircle size={13} /> :
                     <Icon size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-zinc-200">
                      Step {idx + 1}/{STEPS.length} — {step.label}
                    </div>
                    {state.stepError[step.key] && (
                      <div className="text-xs text-[#FF8294] truncate">{state.stepError[step.key]}</div>
                    )}
                  </div>
                  <div className={`text-xs font-mono uppercase tracking-wider ${stateColor}`}>
                    {status}
                  </div>
                </li>
              );
            })}
          </ol>

          {fatalError && (
            <div className="flex items-start gap-2 rounded-lg border border-[#FF375F]/40 bg-[#FF375F]/5 px-3 py-2.5">
              <AlertCircle size={14} className="text-[#FF375F] mt-0.5 shrink-0" />
              <div className="text-sm text-[#FF8294]">{fatalError}</div>
            </div>
          )}
          {cleanupQuality && (
            <div className={`rounded-lg border px-3 py-2.5 ${
              cleanupQuality.risk === 'safe'
                ? 'border-[#30D158]/35 bg-[#30D158]/10'
                : cleanupQuality.risk === 'high'
                  ? 'border-[#FF375F]/40 bg-[#FF375F]/10'
                  : 'border-[#FF9F0A]/35 bg-[#FF9F0A]/10'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-white">
                Cleanup confidence: {cleanupQuality.risk}
              </p>
              <p className="mt-1 text-xs text-zinc-300">{cleanupQuality.reason}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-zinc-800 bg-black/30">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {running && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-[#FF375F] border border-[#FF375F]/40 hover:bg-[#FF375F]/10 transition"
              >
                Cancel
              </button>
            )}
            {zipBlob && !running && (
              <button
                type="button"
                onClick={handleDownload}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  allDone
                    ? 'bg-[#30D158] text-black hover:opacity-90'
                    : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                <Download size={12} /> {allDone ? 'Download Kit' : 'Download Partial Kit'}
              </button>
            )}
            {!running && !allDone && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={images.length === 0}
                className="rounded-lg px-3.5 py-2 text-xs font-semibold text-white bg-[#0A84FF] hover:opacity-90 transition inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={12} /> Generate Kit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingKitPipeline;
