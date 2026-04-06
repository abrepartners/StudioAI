import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Heart,
  Eye,
  RotateCcw,
  Images,
  Pause,
  Play,
} from 'lucide-react';
import { generateRoomDesign, detectRoomType } from '../services/geminiService';
import { FurnitureRoomType, SavedStage } from '../types';
import { type BatchImage } from './BatchUploader';

export interface BatchResult {
  id: string;
  originalImage: string;
  generatedImage: string | null;
  roomType: FurnitureRoomType;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  saved: boolean;
}

interface BatchProcessorProps {
  images: BatchImage[];
  prompt: string;
  onComplete: (results: BatchResult[]) => void;
  onSaveStage: (stage: SavedStage) => void;
  onCancel: () => void;
  onLoadImage: (original: string, generated: string) => void;
  concurrency?: number;
}

const BatchProcessor: React.FC<BatchProcessorProps> = ({
  images,
  prompt,
  onComplete,
  onSaveStage,
  onCancel,
  onLoadImage,
  concurrency = 3,
}) => {
  const [results, setResults] = useState<BatchResult[]>(() =>
    images.map(img => ({
      id: img.id,
      originalImage: img.base64,
      generatedImage: null,
      roomType: img.roomType || 'Living Room',
      status: 'pending' as const,
      saved: false,
    }))
  );
  const [paused, setPaused] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const processingRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const pending = [...images];
    const activePromises: Promise<void>[] = [];

    const processOne = async (img: BatchImage) => {
      // Wait if paused
      while (pausedRef.current) {
        await new Promise(r => setTimeout(r, 300));
      }

      setResults(prev =>
        prev.map(r => (r.id === img.id ? { ...r, status: 'processing' } : r))
      );

      try {
        const roomType = img.roomType || 'Living Room';
        const fullPrompt = prompt.replace('{room}', roomType);
        const resultImages = await generateRoomDesign(img.base64, fullPrompt, null, false, 1);
        const generated = resultImages[0];

        setResults(prev =>
          prev.map(r =>
            r.id === img.id
              ? { ...r, generatedImage: generated, status: 'done' }
              : r
          )
        );

        // Auto-save as a SavedStage
        const stage: SavedStage = {
          id: crypto.randomUUID(),
          name: `Batch ${roomType} ${new Date().toLocaleDateString()}`,
          originalImage: img.base64,
          generatedImage: generated,
          timestamp: Date.now(),
        };
        onSaveStage(stage);

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

    // Process with concurrency limit
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
    processingRef.current = false;
  }, [images, prompt, concurrency, onSaveStage]);

  // Start processing on mount
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

      {/* Before/After compare modal */}
      {compareResult && compareResult.generatedImage && (
        <div className="premium-surface rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[var(--color-text)]/70 uppercase tracking-wider">
              Before / After — {compareResult.roomType}
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
          <button
            type="button"
            onClick={() => onLoadImage(compareResult.originalImage, compareResult.generatedImage!)}
            className="w-full rounded-lg px-3 py-2 text-[10px] font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/20 transition"
          >
            Open in Editor
          </button>
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {results.map((result) => (
          <div
            key={result.id}
            className={`relative rounded-lg overflow-hidden aspect-[4/3] border-2 transition-all ${
              result.status === 'done'
                ? 'border-[#30D158]/40 cursor-pointer hover:border-[var(--color-primary)]'
                : result.status === 'error'
                ? 'border-[#FF375F]/40'
                : result.status === 'processing'
                ? 'border-[var(--color-primary)]/40'
                : 'border-transparent opacity-60'
            }`}
            onClick={() => {
              if (result.status === 'done' && result.generatedImage) {
                setCompareId(prev => prev === result.id ? null : result.id);
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

            {/* Compare highlight */}
            {compareId === result.id && (
              <div className="absolute inset-0 ring-2 ring-[var(--color-primary)] rounded-lg pointer-events-none" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BatchProcessor;
