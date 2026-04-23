import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Heart,
  Eye,
  RotateCcw,
  Pause,
  Play,
  Wand2,
  Trash2,
  Sunset,
  Cloud,
  Download,
} from 'lucide-react';
import {
  generateRoomDesign,
  virtualTwilight,
  replaceSky,
} from '../services/geminiService';
import { fluxCleanup } from '../services/fluxService';
import { FurnitureRoomType, SavedStage } from '../types';
import { type BatchImage, type BatchAction } from './BatchUploader';
import Tooltip from './Tooltip';
import { batchExportMLS, MLS_PRESETS } from '../utils/imageExport';
import { sharpenImage } from '../utils/sharpen';
import { compositeStackedEdit } from '../utils/stackComposite';
import { checkAlignment } from '../utils/alignmentCheck';
import { generateThumbnail } from '../utils/thumbnail';
import { CLEANUP_COMPOSITE_OPTIONS, FLUX_CLEANUP_COMPOSITE_OPTIONS, shouldSkipCompositeForTool } from '../utils/compositeProfiles';
import { buildCleanupSignal, type CleanupQualitySignal } from '../src/types/cleanupQuality';
import { trackCleanupRisk, trackEvent } from '../src/lib/analytics';

// Post-process a batch tool's raw Gemini output. Mirrors SpecialModesPanel's
// postProcessToolOutput: sharpen (PNG when chain is on) + Phase C composite
// against the input so unchanged regions come byte-identical from the source,
// not from Gemini's re-synthesis. Without this, batch outputs look soft/washed
// compared to single-image runs. Twilight/Sky skip compositing to avoid
// blend overlays on broad relighting edits.
async function postProcessBatchOutput(
  raw: string,
  prior: string,
  action: BatchAction,
  customCompositeOpts?: { threshold?: number; dilatePx?: number; featherPx?: number },
): Promise<string> {
  const chainEnabled = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('chain') !== '0'
    : true;
  const fmt: 'png' | 'jpeg' = chainEnabled ? 'png' : 'jpeg';
  const sharpened = await sharpenImage(raw, 0.4, 1, fmt);
  if (action === 'export') return sharpened;
  const toolForComposite = action === 'stage' ? 'staging' : action;
  if (shouldSkipCompositeForTool(toolForComposite)) {
    return sharpened;
  }
  const baseOpts = action === 'cleanup' ? CLEANUP_COMPOSITE_OPTIONS : undefined;
  const compositeOptions = customCompositeOpts
    ? { ...baseOpts, ...customCompositeOpts }
    : baseOpts;
  try {
    return await compositeStackedEdit(prior, sharpened, { format: fmt, ...compositeOptions });
  } catch (err) {
    console.warn('[BatchProcessor] composite failed, using sharpened raw:', err);
    return sharpened;
  }
}

const ACTION_LABELS: Record<BatchAction, { label: string; icon: React.ReactNode; color: string }> = {
  stage:    { label: 'Staged',   icon: <Wand2 size={10} />,    color: '#0A84FF' },
  cleanup:  { label: 'Cleaned',  icon: <Trash2 size={10} />,   color: '#30D158' },
  twilight: { label: 'Twilight', icon: <Sunset size={10} />,   color: '#FF9F0A' },
  sky:      { label: 'Sky',      icon: <Cloud size={10} />,    color: '#64D2FF' },
  export:   { label: 'Export',   icon: <Download size={10} />, color: '#BF5AF2' },
};

export interface BatchResult {
  id: string;
  originalImage: string;
  generatedImage: string | null;
  roomType: FurnitureRoomType;
  action: BatchAction;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  saved: boolean;
  cleanupQuality?: CleanupQualitySignal;
}

interface BatchProcessorProps {
  images: BatchImage[];
  onComplete: (results: BatchResult[]) => void;
  onSaveStage: (stage: SavedStage) => void;
  onCancel: () => void;
  onLoadImage: (original: string, generated: string) => void;
  /** Mirror of the internal results up to App so state survives unmount. */
  onResultsChange?: (results: BatchResult[]) => void;
  /** If provided, seed state from these (user returning from editor back to batch). */
  initialResults?: BatchResult[];
  concurrency?: number;
  isPro?: boolean;
}

/** Build the right prompt / API call based on the action */
const processImage = async (img: BatchImage, isPro: boolean = false): Promise<string> => {
  const roomType = img.roomType || 'Living Room';

  switch (img.action) {
    case 'stage': {
      const prompt = `Virtually stage this ${roomType}. Add appropriate, style-neutral modern furniture and decor. Preserve all existing wall colors, floor colors, ceiling, architecture, layout, windows, doors, and built-in fixtures EXACTLY as they are. Do NOT change or color-grade existing surfaces. Keep the exact same framing and crop.`;
      const results = await generateRoomDesign(img.base64, prompt, null, false, 1, isPro);
      return await postProcessBatchOutput(results[0], img.base64, 'stage');
    }
    case 'cleanup': {
      const { resultBase64 } = await fluxCleanup(img.base64, roomType);
      return await postProcessBatchOutput(resultBase64, img.base64, 'cleanup', FLUX_CLEANUP_COMPOSITE_OPTIONS);
    }
    case 'twilight': {
      const raw = await virtualTwilight(img.base64, isPro);
      return await postProcessBatchOutput(raw, img.base64, 'twilight');
    }
    case 'sky': {
      const raw = await replaceSky(img.base64, 'blue', isPro);
      return await postProcessBatchOutput(raw, img.base64, 'sky');
    }
    case 'export': {
      // No AI processing — just pass through the original
      return img.base64;
    }
  }
};

const BatchProcessor: React.FC<BatchProcessorProps> = ({
  images,
  onComplete,
  onSaveStage,
  onCancel,
  onLoadImage,
  onResultsChange,
  initialResults,
  concurrency = 3,
  isPro = false,
}) => {
  // Freeze images on mount — they never change during processing
  const imagesRef = useRef(images);

  const [results, setResults] = useState<BatchResult[]>(() =>
    initialResults && initialResults.length === imagesRef.current.length
      ? initialResults
      : imagesRef.current.map(img => ({
          id: img.id,
          originalImage: img.base64,
          generatedImage: null,
          roomType: img.roomType || 'Living Room',
          action: img.action,
          status: img.action === 'export' ? 'done' as const : 'pending' as const,
          saved: false,
        }))
  );

  // X2: Per-row action override. When the user changes a pending row's
  // action via the dropdown, we update results[row].action. processImage
  // reads the LATEST action via resultsRef at dispatch time — already-
  // processing rows keep their original action; pending/error rows pick
  // up the new one. Export rows auto-save on mount and are locked to
  // their initial action (changing them post-hoc would require reverting
  // the auto-save which isn't worth the UX debt).
  const changeRowAction = useCallback((id: string, action: BatchAction) => {
    setResults(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        // Don't hijack in-flight or already-done rows.
        if (r.status === 'processing' || r.status === 'done') return r;
        // Export is a sentinel action (no AI call). Don't let users accidentally
        // downgrade a real action back to export mid-batch — add an explicit
        // "pending" status reset otherwise it looks stuck.
        return { ...r, action };
      })
    );
  }, []);
  const applyActionToAllPending = useCallback((action: BatchAction) => {
    setResults(prev =>
      prev.map(r =>
        r.status === 'processing' || r.status === 'done' ? r : { ...r, action }
      )
    );
  }, []);

  // Mirror results up to parent so App.tsx can restore them after remount
  // (e.g., user opens a single result in the editor, then clicks Back to Batch).
  const onResultsChangeRef = useRef(onResultsChange);
  onResultsChangeRef.current = onResultsChange;
  // Ref-read of results inside processQueue avoids stale closure issues
  // when retryFailed flips items back to 'pending' after initial mount.
  const resultsRef = useRef(results);
  useEffect(() => {
    resultsRef.current = results;
    onResultsChangeRef.current?.(results);
  }, [results]);
  const [paused, setPaused] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const processingRef = useRef(false);
  const onSaveStageRef = useRef(onSaveStage);
  onSaveStageRef.current = onSaveStage;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Auto-save export-only images on mount
  useEffect(() => {
    imagesRef.current.forEach(img => {
      if (img.action === 'export') {
        void (async () => {
          // D8: generate thumbnail alongside original + generated.
          const thumbnail = await generateThumbnail(img.base64);
          const stage: SavedStage = {
            id: crypto.randomUUID(),
            name: `Export ${img.roomType || 'Room'} ${new Date().toLocaleDateString()}`,
            originalImage: img.base64,
            generatedImage: img.base64,
            thumbnail,
            timestamp: Date.now(),
          };
          onSaveStage(stage);
          setResults(prev =>
            prev.map(r => (r.id === img.id ? { ...r, generatedImage: img.base64, saved: true } : r))
          );
        })();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Only process non-export images that aren't already done (e.g., after
      // a return from editor when results were restored via initialResults).
      // Read from resultsRef so retryFailed's fresh-pending items are seen.
      const current = resultsRef.current;
      const pending = imagesRef.current.filter(img => {
        if (img.action === 'export') return false;
        const existing = current.find(r => r.id === img.id);
        return !existing || existing.status === 'pending' || existing.status === 'error';
      });
      if (pending.length === 0) return;
      const activePromises: Promise<void>[] = [];

      const processOne = async (img: BatchImage) => {
        while (pausedRef.current) {
          await new Promise(r => setTimeout(r, 300));
        }

        // X2: Read the LATEST action off resultsRef so per-row overrides made
        // while the row was still pending are honored. Fall back to the
        // upload-time action if the row isn't in results for any reason.
        const currentResult = resultsRef.current.find(r => r.id === img.id);
        const actionAtDispatch: BatchAction = currentResult?.action ?? img.action;
        const dispatchImg: BatchImage = actionAtDispatch === img.action
          ? img
          : { ...img, action: actionAtDispatch };

        setResults(prev =>
          prev.map(r => (r.id === img.id ? { ...r, status: 'processing', action: actionAtDispatch } : r))
        );

        try {
          const generated = await processImage(dispatchImg, isPro);
          const cleanupQuality = actionAtDispatch === 'cleanup'
            ? buildCleanupSignal({
                risk: 'review',
                source: 'batch',
                reason: 'Batch cleanup finished; review edges before export.',
                compositeMode: 'applied',
                nextActions: ['Spot-check edges on final selection'],
              })
            : undefined;
          if (cleanupQuality) {
            trackCleanupRisk(cleanupQuality.risk, { source: 'batch', imageId: img.id });
          }

          setResults(prev =>
            prev.map(r =>
              r.id === img.id
                ? { ...r, generatedImage: generated, status: 'done', cleanupQuality }
                : r
            )
          );

          // D8: generate thumbnail alongside generated image (non-blocking for UI).
          const thumbnail = await generateThumbnail(generated);
          const stage: SavedStage = {
            id: crypto.randomUUID(),
            name: `Batch ${ACTION_LABELS[actionAtDispatch].label} ${img.roomType || 'Room'} ${new Date().toLocaleDateString()}`,
            originalImage: img.base64,
            generatedImage: generated,
            thumbnail,
            timestamp: Date.now(),
          };
          onSaveStageRef.current(stage);

          setResults(prev =>
            prev.map(r => (r.id === img.id ? { ...r, saved: true } : r))
          );
        } catch (e: any) {
          const cleanupQuality = actionAtDispatch === 'cleanup'
            ? buildCleanupSignal({
                risk: 'high',
                source: 'batch',
                reason: e?.code === 'ALIGNMENT_BAIL'
                  ? "Batch cleanup couldn't preserve framing."
                  : 'Batch cleanup failed.',
                compositeMode: 'not_applicable',
                nextActions: ['Retry this image', 'Try a tighter crop/mask', 'Use Pro quality if drift persists'],
              })
            : undefined;
          if (cleanupQuality) {
            trackCleanupRisk(cleanupQuality.risk, { source: 'batch', imageId: img.id });
          }
          setResults(prev =>
            prev.map(r =>
              r.id === img.id
                ? { ...r, status: 'error', error: e?.message || 'Failed', cleanupQuality }
                : r
            )
          );
        }
      };

      let index = 0;
      const next = async (): Promise<void> => {
        if (index >= pending.length) return;
        const img = pending[index++];
        await processOne(img);
        await next();
      };

      for (let i = 0; i < Math.min(concurrency, pending.length); i++) {
        activePromises.push(next());
      }

      await Promise.all(activePromises);
    } catch (e: any) {
      setFatalError(e?.message || 'Batch processing crashed');
    } finally {
      processingRef.current = false;
    }
  }, [concurrency]); // images frozen via ref — no dependency needed

  useEffect(() => {
    processQueue();
  }, [processQueue]);

  const retryFailed = useCallback(() => {
    const failedIds = results.filter(r => r.status === 'error').map(r => r.id);
    const hasCleanupRetry = results.some((r) => r.status === 'error' && r.action === 'cleanup');
    if (hasCleanupRetry) {
      trackEvent('cleanup_retried', { source: 'batch', count: failedIds.length });
    }
    setResults(prev =>
      prev.map(r => (failedIds.includes(r.id) ? { ...r, status: 'pending', error: undefined } : r))
    );
    processingRef.current = false;
    processQueue();
  }, [results, processQueue]);

  // ─── Selection helpers ──────────────────────────────────────────────────
  // Every completed result is selected by default — matches Photoroom / Topaz /
  // Lightroom convention where the implied intent after a batch is "export all."
  const doneResults = results.filter(r => r.status === 'done' && r.generatedImage);
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      doneResults.forEach(r => next.add(r.id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneResults.length]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = doneResults.length > 0 && doneResults.every(r => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      doneResults.forEach(r => next.add(r.id));
      return next;
    });
  };

  // ─── Download All (ZIP) ─────────────────────────────────────────────────
  // Wraps the existing batchExportMLS() utility (imageExport.ts). Uses the
  // HD Landscape preset (1920×1080) as a sensible default — biggest MLS-
  // compatible size without a preset picker. "Export with preset…" flow can
  // be added later for power users.
  const handleDownloadAll = useCallback(async () => {
    const selected = doneResults.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setExporting(true);
    setExportProgress({ current: 0, total: selected.length });
    try {
      const defaultPreset = MLS_PRESETS.find(p => p.name === 'HD Landscape') ?? MLS_PRESETS[0];
      const payload = selected.map(r => ({
        source: r.generatedImage as string,
        label: r.roomType || 'listing',
      }));
      await batchExportMLS(
        payload,
        defaultPreset,
        undefined,
        (current, total) => setExportProgress({ current, total })
      );
    } catch (err) {
      console.error('[BatchProcessor] Download All failed:', err);
      setFatalError('Download failed. Please try again or use Export with preset.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [doneResults, selectedIds]);

  // ─── Lightbox keyboard nav ──────────────────────────────────────────────
  useEffect(() => {
    if (!lightboxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxId(null);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const idx = doneResults.findIndex(r => r.id === lightboxId);
        if (idx === -1) return;
        const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
        const target = doneResults[nextIdx];
        if (target) setLightboxId(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxId, doneResults]);

  const lightboxResult = lightboxId ? results.find(r => r.id === lightboxId) : null;

  const doneCount = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const processingCount = results.filter(r => r.status === 'processing').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;
  const totalCount = results.length;
  const allDone = doneCount + errorCount === totalCount;
  const progressPct = ((doneCount + errorCount) / totalCount) * 100;

  // Fatal error — show escape hatch
  if (fatalError) {
    return (
      <div className="space-y-4">
        <div className="premium-surface rounded-2xl p-5 text-center space-y-3">
          <AlertCircle size={32} className="text-[#FF375F] mx-auto" />
          <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">Batch Processing Error</h3>
          <p className="text-xs text-[var(--color-text)]/70">{fatalError}</p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition"
          >
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="premium-surface rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {allDone ? 'Batch Complete' : 'Processing Batch'}
            </h3>
            <p className="text-xs text-[var(--color-text)]/70">
              {doneCount}/{totalCount} complete
              {errorCount > 0 && ` · ${errorCount} failed`}
              {processingCount > 0 && ` · ${processingCount} active`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {!allDone && (
              <button
                type="button"
                onClick={() => setPaused(p => !p)}
                className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
                title={paused ? 'Resume' : 'Pause'}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
            )}
            {errorCount > 0 && allDone && (
              <button
                type="button"
                onClick={retryFailed}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10 transition inline-flex items-center gap-1"
              >
                <RotateCcw size={10} /> Retry {errorCount}
              </button>
            )}
            {allDone && doneResults.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={exporting || selectedIds.size === 0}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedIds.size === 0 ? 'Select at least one result' : `Download ${selectedIds.size} as ZIP`}
              >
                {exporting ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    {exportProgress ? `${exportProgress.current}/${exportProgress.total}` : 'Zipping…'}
                  </>
                ) : (
                  <>
                    <Download size={10} /> Download {selectedIds.size > 0 && selectedIds.size < doneResults.length ? `${selectedIds.size}` : 'All'}
                  </>
                )}
              </button>
            )}
            {allDone && (
              <Tooltip label="Import all into editor (keeps them stacked in the session queue)">
                <button
                  type="button"
                  onClick={() => onComplete(results)}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold bg-white/[0.04] border border-white/10 text-white hover:bg-white/[0.08] transition inline-flex items-center gap-1"
                >
                  <CheckCircle2 size={10} /> Open in Editor
                </button>
              </Tooltip>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-[var(--color-text)]/50 hover:text-[#FF375F] hover:bg-[var(--color-bg)] transition"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: errorCount > 0 && allDone
                ? 'linear-gradient(90deg, #30D158, #FF375F)'
                : allDone
                ? '#30D158'
                : 'var(--color-primary)',
            }}
          />
        </div>

        {paused && (
          <div className="flex items-center gap-2 text-xs text-[#FFD60A] font-semibold">
            <Pause size={10} /> Paused — tap play to resume
          </div>
        )}

        {/* X2: Apply-to-all action toolbar. Shows while there are still
            pending/error rows that can receive a new action.  Per-row
            dropdowns on the grid tiles handle individual overrides. */}
        {(pendingCount > 0 || errorCount > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap border-t border-white/5 pt-2.5">
            <span className="text-xs uppercase tracking-wider text-[var(--color-text)]/50 font-semibold mr-1">
              Apply to {pendingCount + errorCount} remaining:
            </span>
            {(['stage', 'cleanup', 'twilight', 'sky'] as BatchAction[]).map((action) => {
              const info = ACTION_LABELS[action];
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => applyActionToAllPending(action)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold inline-flex items-center gap-1 transition-all border border-[var(--color-border-strong)] bg-black/40 hover:bg-current/10"
                  style={{ color: info.color }}
                  title={`Set every pending row to ${info.label}`}
                >
                  {info.icon} {info.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Select-all row — appears when at least one result is done */}
      {allDone && doneResults.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-[var(--color-text)]/70">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 hover:text-white transition"
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${allSelected ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-white/30'}`}>
              {allSelected && <CheckCircle2 size={10} className="text-white" />}
            </span>
            <span className="font-semibold uppercase tracking-wider">
              {selectedIds.size} of {doneResults.length} selected
            </span>
          </button>
          <span className="text-xs text-[var(--color-text)]/50">Click a result to preview · Esc closes</span>
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {results.map((result) => {
          const actionInfo = ACTION_LABELS[result.action];
          const isSelected = selectedIds.has(result.id);
          return (
            <div
              key={result.id}
              className={`relative rounded-lg overflow-hidden aspect-[4/3] border-2 transition-all ${
                result.status === 'done'
                  ? 'cursor-pointer hover:border-[var(--color-primary)]'
                  : result.status === 'error'
                  ? 'border-[#FF375F]/40'
                  : result.status === 'processing'
                  ? 'border-[var(--color-primary)]/40'
                  : 'border-transparent opacity-60'
              }`}
              style={result.status === 'done' ? { borderColor: isSelected ? 'var(--color-primary)' : `${actionInfo.color}60` } : undefined}
              onClick={() => {
                if (result.status === 'done' && result.generatedImage) {
                  setLightboxId(result.id);
                }
              }}
            >
              <img
                src={
                  result.generatedImage
                    ? result.generatedImage.startsWith('data:')
                      ? result.generatedImage
                      : `data:image/jpeg;base64,${result.generatedImage}`
                    : result.originalImage
                }
                alt={result.roomType}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />

              {/* Status overlay */}
              {result.status === 'processing' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 size={20} className="text-[var(--color-primary)] animate-spin" />
                </div>
              )}
              {result.status === 'error' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 p-2">
                  <AlertCircle size={16} className="text-[#FF375F]" />
                  <span className="text-2xs text-[#FF375F] text-center truncate w-full">{result.error}</span>
                </div>
              )}
              {result.status === 'pending' && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <span className="text-xs text-white/60 font-semibold">Queued</span>
                </div>
              )}

              {/* Selection checkbox — top right, only on done results */}
              {result.status === 'done' && result.generatedImage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelected(result.id);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-black/80 transition"
                  aria-label={isSelected ? 'Deselect' : 'Select'}
                >
                  {isSelected && <CheckCircle2 size={12} className="text-[var(--color-primary)]" />}
                </button>
              )}

              {/* Action badge — top left.
                  X2: On pending/error rows this becomes a <select> so the user
                  can reassign that specific row's action before the orchestrator
                  dispatches it. processOne reads the latest action off
                  resultsRef at dispatch time, so the override lands correctly. */}
              {(result.status === 'pending' || result.status === 'error') ? (
                <select
                  value={result.action}
                  onChange={(e) => {
                    e.stopPropagation();
                    changeRowAction(result.id, e.target.value as BatchAction);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1 left-1 text-2xs font-bold px-1 py-0.5 rounded border-0 focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer appearance-none"
                  style={{ backgroundColor: actionInfo.color, color: '#000' }}
                  aria-label="Action for this image"
                >
                  <option value="stage">Stage</option>
                  <option value="cleanup">Cleanup</option>
                  <option value="twilight">Twilight</option>
                  <option value="sky">Sky</option>
                  <option value="export">Export</option>
                </select>
              ) : (
                <div
                  className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-bold"
                  style={{ backgroundColor: actionInfo.color, color: '#000' }}
                >
                  {actionInfo.icon} {actionInfo.label}
                </div>
              )}

              {/* Bottom badge */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center justify-between">
                <span className="text-2xs font-semibold text-white truncate">{result.roomType}</span>
                {result.status === 'done' && (
                  <div className="flex items-center gap-0.5">
                    {result.saved && <Heart size={10} className="fill-[var(--color-primary)] text-[var(--color-primary)]" />}
                    <Eye size={10} className="text-white/70" />
                  </div>
                )}
              </div>
              {result.cleanupQuality && result.action === 'cleanup' && (
                <div className={`absolute bottom-6 left-1.5 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider ${
                  result.cleanupQuality.risk === 'safe'
                    ? 'bg-[#30D158]/80 text-black'
                    : result.cleanupQuality.risk === 'high'
                      ? 'bg-[#FF375F]/85 text-white'
                      : 'bg-[#FF9F0A]/85 text-black'
                }`}>
                  {result.cleanupQuality.risk === 'safe' ? 'Safe' : result.cleanupQuality.risk === 'high' ? 'High Risk' : 'Review'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Lightbox overlay — click-to-preview without losing the grid ─── */}
      {lightboxResult && lightboxResult.generatedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col"
          onClick={() => setLightboxId(null)}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10">
            <div className="flex items-center gap-3 text-xs text-white">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-bold"
                  style={{ backgroundColor: ACTION_LABELS[lightboxResult.action].color, color: '#000' }}
                >
                  {ACTION_LABELS[lightboxResult.action].icon} {ACTION_LABELS[lightboxResult.action].label}
                </span>
                {lightboxResult.roomType}
              </span>
              <span className="text-xs text-white/50">
                {doneResults.findIndex(r => r.id === lightboxResult.id) + 1} of {doneResults.length}
              </span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  onLoadImage(lightboxResult.originalImage, lightboxResult.generatedImage!);
                  setLightboxId(null);
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition"
              >
                Open in Editor
              </button>
              <button
                type="button"
                onClick={() => setLightboxId(null)}
                className="rounded-lg p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {/* Before / after side-by-side */}
          <div
            className="flex-1 overflow-auto p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 place-items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full max-w-2xl">
              <img
                src={lightboxResult.originalImage}
                alt="Before"
                className="w-full h-auto rounded-xl"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute bottom-2 left-2 bg-black/80 text-xs font-bold text-white uppercase px-2 py-1 rounded">Before</span>
            </div>
            <div className="relative w-full max-w-2xl">
              <img
                src={lightboxResult.generatedImage.startsWith('data:') ? lightboxResult.generatedImage : `data:image/jpeg;base64,${lightboxResult.generatedImage}`}
                alt="After"
                className="w-full h-auto rounded-xl"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute bottom-2 left-2 bg-[var(--color-primary)]/90 text-xs font-bold text-white uppercase px-2 py-1 rounded">After</span>
            </div>
          </div>
          {/* Bottom hint */}
          <div className="px-4 py-2 text-center text-xs text-white/40 border-t border-white/10">
            ← → to navigate · Esc to close
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchProcessor;
