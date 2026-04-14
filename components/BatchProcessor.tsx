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
  instantDeclutter,
} from '../services/geminiService';
import { FurnitureRoomType, SavedStage } from '../types';
import { type BatchImage, type BatchAction } from './BatchUploader';

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
}

interface BatchProcessorProps {
  images: BatchImage[];
  onComplete: (results: BatchResult[]) => void;
  onSaveStage: (stage: SavedStage) => void;
  onCancel: () => void;
  onLoadImage: (original: string, generated: string) => void;
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
      return results[0];
    }
    case 'cleanup': {
      return await instantDeclutter(img.base64, roomType, isPro);
    }
    case 'twilight': {
      return await virtualTwilight(img.base64, isPro);
    }
    case 'sky': {
      return await replaceSky(img.base64, 'blue', isPro);
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
  concurrency = 3,
  isPro = false,
}) => {
  // Freeze images on mount — they never change during processing
  const imagesRef = useRef(images);

  const [results, setResults] = useState<BatchResult[]>(() =>
    imagesRef.current.map(img => ({
      id: img.id,
      originalImage: img.base64,
      generatedImage: null,
      roomType: img.roomType || 'Living Room',
      action: img.action,
      status: img.action === 'export' ? 'done' as const : 'pending' as const,
      saved: false,
    }))
  );
  const [paused, setPaused] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
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
        const stage: SavedStage = {
          id: crypto.randomUUID(),
          name: `Export ${img.roomType || 'Room'} ${new Date().toLocaleDateString()}`,
          originalImage: img.base64,
          generatedImage: img.base64,
          timestamp: Date.now(),
        };
        onSaveStage(stage);
        setResults(prev =>
          prev.map(r => (r.id === img.id ? { ...r, generatedImage: img.base64, saved: true } : r))
        );
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Only process non-export images
      const pending = imagesRef.current.filter(img => img.action !== 'export');
      const activePromises: Promise<void>[] = [];

      const processOne = async (img: BatchImage) => {
        while (pausedRef.current) {
          await new Promise(r => setTimeout(r, 300));
        }

        setResults(prev =>
          prev.map(r => (r.id === img.id ? { ...r, status: 'processing' } : r))
        );

        try {
          const generated = await processImage(img, isPro);

          setResults(prev =>
            prev.map(r =>
              r.id === img.id
                ? { ...r, generatedImage: generated, status: 'done' }
                : r
            )
          );

          const stage: SavedStage = {
            id: crypto.randomUUID(),
            name: `Batch ${ACTION_LABELS[img.action].label} ${img.roomType || 'Room'} ${new Date().toLocaleDateString()}`,
            originalImage: img.base64,
            generatedImage: generated,
            timestamp: Date.now(),
          };
          onSaveStageRef.current(stage);

          setResults(prev =>
            prev.map(r => (r.id === img.id ? { ...r, saved: true } : r))
          );
        } catch (e: any) {
          setResults(prev =>
            prev.map(r =>
              r.id === img.id
                ? { ...r, status: 'error', error: e?.message || 'Failed' }
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
    setResults(prev =>
      prev.map(r => (failedIds.includes(r.id) ? { ...r, status: 'pending', error: undefined } : r))
    );
    processingRef.current = false;
    processQueue();
  }, [results, processQueue]);

  const doneCount = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const processingCount = results.filter(r => r.status === 'processing').length;
  const totalCount = results.length;
  const allDone = doneCount + errorCount === totalCount;
  const progressPct = ((doneCount + errorCount) / totalCount) * 100;

  const compareResult = compareId ? results.find(r => r.id === compareId) : null;

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
            <p className="text-[10px] text-[var(--color-text)]/70">
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
                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)] border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10 transition inline-flex items-center gap-1"
              >
                <RotateCcw size={10} /> Retry {errorCount}
              </button>
            )}
            {allDone && (
              <button
                type="button"
                onClick={() => onComplete(results)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition inline-flex items-center gap-1"
              >
                <CheckCircle2 size={10} /> Done
              </button>
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
          <div className="flex items-center gap-2 text-[10px] text-[#FFD60A] font-semibold">
            <Pause size={10} /> Paused — tap play to resume
          </div>
        )}
      </div>

      {/* Before/After compare */}
      {compareResult && compareResult.generatedImage && (
        <div className="premium-surface rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[var(--color-text)]/70 uppercase tracking-wider">
              Before / After — {compareResult.roomType}
              <span
                className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold"
                style={{
                  backgroundColor: `${ACTION_LABELS[compareResult.action].color}20`,
                  color: ACTION_LABELS[compareResult.action].color,
                }}
              >
                {ACTION_LABELS[compareResult.action].icon} {ACTION_LABELS[compareResult.action].label}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setCompareId(null)}
              className="text-[var(--color-text)]/50 hover:text-white transition"
            >
              <X size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
              <img src={compareResult.originalImage} alt="Before" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 bg-black/70 text-[8px] font-bold text-white uppercase px-1.5 py-0.5 rounded">Before</span>
            </div>
            <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
              <img
                src={compareResult.generatedImage.startsWith('data:') ? compareResult.generatedImage : `data:image/jpeg;base64,${compareResult.generatedImage}`}
                alt="After"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 left-1 bg-[var(--color-primary)]/80 text-[8px] font-bold text-white uppercase px-1.5 py-0.5 rounded">After</span>
            </div>
          </div>
          {compareResult.action !== 'export' && (
            <button
              type="button"
              onClick={() => onLoadImage(compareResult.originalImage, compareResult.generatedImage!)}
              className="w-full rounded-lg px-3 py-2 text-[10px] font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/20 transition"
            >
              Open in Editor
            </button>
          )}
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {results.map((result) => {
          const actionInfo = ACTION_LABELS[result.action];
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
              style={result.status === 'done' ? { borderColor: `${actionInfo.color}60` } : undefined}
              onClick={() => {
                if (result.status === 'done' && result.generatedImage) {
                  setCompareId(prev => (prev === result.id ? null : result.id));
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
                  <span className="text-[8px] text-[#FF375F] text-center truncate w-full">{result.error}</span>
                </div>
              )}
              {result.status === 'pending' && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <span className="text-[9px] text-white/60 font-semibold">Queued</span>
                </div>
              )}

              {/* Action badge — top left */}
              <div
                className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-bold"
                style={{ backgroundColor: actionInfo.color, color: '#000' }}
              >
                {actionInfo.icon} {actionInfo.label}
              </div>

              {/* Bottom badge */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center justify-between">
                <span className="text-[8px] font-semibold text-white truncate">{result.roomType}</span>
                {result.status === 'done' && (
                  <div className="flex items-center gap-0.5">
                    {result.saved && <Heart size={10} className="fill-[var(--color-primary)] text-[var(--color-primary)]" />}
                    <Eye size={10} className="text-white/70" />
                  </div>
                )}
              </div>

              {compareId === result.id && (
                <div className="absolute inset-0 ring-2 ring-[var(--color-primary)] rounded-lg pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BatchProcessor;
