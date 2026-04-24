import React, { useRef, useState, useCallback } from 'react';
import {
  Upload,
  Camera,
  X,
  Loader2,
  CheckCircle2,
  Images,
  Wand2,
  Trash2,
  Sunset,
  Cloud,
  Download,
} from 'lucide-react';
import { detectRoomType } from '../services/geminiService';
import { FurnitureRoomType } from '../types';
import Tooltip from './Tooltip';

export type BatchAction = 'stage' | 'cleanup' | 'twilight' | 'sky' | 'export';

const ACTION_CONFIG: Record<BatchAction, { label: string; icon: React.ReactNode; color: string; short: string }> = {
  stage:   { label: 'Stage',    icon: <Wand2 size={12} />,    color: '#0A84FF', short: 'STG' },
  cleanup: { label: 'Cleanup',  icon: <Trash2 size={12} />,   color: '#30D158', short: 'CLN' },
  twilight:{ label: 'Twilight', icon: <Sunset size={12} />,   color: '#FF9F0A', short: 'TWI' },
  sky:     { label: 'Sky',      icon: <Cloud size={12} />,    color: '#64D2FF', short: 'SKY' },
  export:  { label: 'Export Only', icon: <Download size={12} />, color: '#BF5AF2', short: 'EXP' },
};

export interface BatchImage {
  id: string;
  file: File;
  base64: string;
  roomType: FurnitureRoomType | null;
  detecting: boolean;
  selected: boolean;
  action: BatchAction;
}

interface BatchUploaderProps {
  onBatchReady: (images: BatchImage[]) => void;
  onSingleUpload: (base64: string) => void;
  onSkipToEditor?: (images: BatchImage[]) => void;
  isAnalyzing?: boolean;
  maxFiles?: number;
}

const BatchUploader: React.FC<BatchUploaderProps> = ({
  onBatchReady,
  onSingleUpload,
  onSkipToEditor,
  isAnalyzing,
  maxFiles = 50,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [batchImages, setBatchImages] = useState<BatchImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  // No bulk action state needed — actions apply immediately on tap

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files
      .filter(f => f.type.startsWith('image/'))
      .slice(0, maxFiles);

    if (imageFiles.length === 0) return;

    // Single file -> go straight to existing single-upload flow
    if (imageFiles.length === 1 && batchImages.length === 0) {
      const base64 = await readFileAsBase64(imageFiles[0]);
      onSingleUpload(base64);
      return;
    }

    // Multiple files -> batch mode
    const newImages: BatchImage[] = await Promise.all(
      imageFiles.map(async (file) => {
        const base64 = await readFileAsBase64(file);
        return {
          id: crypto.randomUUID(),
          file,
          base64,
          roomType: null,
          detecting: true,
          selected: true,
          action: 'stage' as BatchAction,
        };
      })
    );

    setBatchImages(prev => {
      const combined = [...prev, ...newImages].slice(0, maxFiles);
      return combined;
    });

    // Auto-detect room types concurrently (3 at a time)
    const CONCURRENCY = 3;
    for (let i = 0; i < newImages.length; i += CONCURRENCY) {
      const chunk = newImages.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (img) => {
          const roomType = await detectRoomType(img.base64);
          return { id: img.id, roomType };
        })
      );

      setBatchImages(prev =>
        prev.map(img => {
          const result = results.find(
            r => r.status === 'fulfilled' && r.value.id === img.id
          );
          if (result && result.status === 'fulfilled') {
            // Auto-assign action based on room type
            const isExterior = result.value.roomType === 'Exterior';
            const autoAction: BatchAction = isExterior ? 'twilight' : 'stage';
            return { ...img, roomType: result.value.roomType, detecting: false, action: autoAction };
          }
          if (chunk.some(c => c.id === img.id) && img.detecting) {
            return { ...img, roomType: 'Living Room' as FurnitureRoomType, detecting: false };
          }
          return img;
        })
      );
    }
  }, [batchImages.length, maxFiles, onSingleUpload]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) processFiles(files);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (isAnalyzing) return;
    const files = Array.from(event.dataTransfer.files);
    processFiles(files);
  };

  const toggleSelect = (id: string) => {
    setBatchImages(prev =>
      prev.map(img => (img.id === id ? { ...img, selected: !img.selected } : img))
    );
  };

  const setImageAction = (id: string, action: BatchAction) => {
    setBatchImages(prev =>
      prev.map(img => (img.id === id ? { ...img, action } : img))
    );
  };

  const applyActionToSelected = (action: BatchAction) => {
    setBatchImages(prev =>
      prev.map(img => (img.selected ? { ...img, action } : img))
    );
  };

  const removeImage = (id: string) => {
    setBatchImages(prev => prev.filter(img => img.id !== id));
  };

  const selectAll = () => {
    setBatchImages(prev => prev.map(img => ({ ...img, selected: true })));
  };

  const clearAll = () => {
    setBatchImages([]);
  };

  const handleStartBatch = () => {
    const selected = batchImages
      .filter(img => img.selected)
      .map(img => img.detecting ? { ...img, detecting: false, roomType: img.roomType || 'Living Room' as FurnitureRoomType } : img);
    if (selected.length > 0) {
      onBatchReady(selected);
    }
  };

  const selectedCount = batchImages.filter(img => img.selected).length;
  const detectingCount = batchImages.filter(img => img.detecting).length;

  // Action summary for selected images
  const actionCounts = batchImages
    .filter(img => img.selected)
    .reduce((acc, img) => {
      acc[img.action] = (acc[img.action] || 0) + 1;
      return acc;
    }, {} as Record<BatchAction, number>);

  // No images queued yet — show upload prompt
  if (batchImages.length === 0) {
    return (
      <div
        className={`premium-surface rounded-2xl p-6 text-center transition-all duration-200 ${
          isDragging
            ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : isAnalyzing
            ? 'opacity-75 cursor-not-allowed'
            : 'hover:-translate-y-0.5 hover:shadow-md'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isAnalyzing ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
            <div>
              <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Analyzing Space</h3>
              <p className="mt-1 text-xs text-[var(--color-text)]">Extracting room type and palette...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-bg-deep)] text-[var(--color-primary)]">
              <Images size={20} />
            </div>
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              {isDragging ? 'Drop photos here' : 'Drop room photos'}
            </h3>
            <p className="mx-auto mt-1 text-sm text-[var(--color-text)]">
              Single photo or multiple for batch editing
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cta-primary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Upload size={14} /> Upload
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="cta-secondary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Camera size={14} /> Camera
              </button>
            </div>
          </>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />
        <input
          type="file"
          ref={cameraInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          capture="environment"
        />
      </div>
    );
  }

  // Batch queue view
  return (
    <div className="premium-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">
            Batch Queue
          </h3>
          <p className="text-xs text-[var(--color-text)]/70">
            {selectedCount} of {batchImages.length} selected
            {detectingCount > 0 && ` · Detecting ${detectingCount} rooms...`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            Select All
          </button>
          <span className="text-[var(--color-text)]/30 text-xs">|</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-[#FF375F] hover:underline"
          >
            Clear
          </button>
          <Tooltip label="Add more photos">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ml-2 rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              aria-label="Add more photos"
            >
              <Upload size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Action toolbar — tap to assign to selected images instantly */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-[var(--color-text)]/50 font-semibold mr-1">
            Set {selectedCount} to:
          </span>
          {(Object.keys(ACTION_CONFIG) as BatchAction[]).map((action) => {
            const cfg = ACTION_CONFIG[action];
            // Highlight if all selected images have this action
            const allSelectedHaveThis = batchImages
              .filter(img => img.selected)
              .every(img => img.action === action);
            return (
              <button
                key={action}
                type="button"
                onClick={() => applyActionToSelected(action)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-all border ${
                  allSelectedHaveThis
                    ? 'border-current bg-current/15 ring-1 ring-current/30'
                    : 'border-[var(--color-border-strong)] bg-black/40 hover:border-current hover:bg-current/5'
                }`}
                style={{ color: cfg.color }}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Thumbnail grid */}
      <div className="grid grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto">
        {batchImages.map((img) => {
          const actionCfg = ACTION_CONFIG[img.action];
          return (
            <div
              key={img.id}
              className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer aspect-[4/3] ${
                img.selected
                  ? 'shadow-md'
                  : 'border-transparent opacity-50'
              }`}
              style={img.selected ? { borderColor: actionCfg.color } : undefined}
              onClick={() => toggleSelect(img.id)}
            >
              <img
                src={img.base64}
                alt="Queued"
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />

              {/* Action badge + remove — top right */}
              <div className="absolute top-1 right-1 flex items-center gap-0.5">
                {!img.detecting && (
                  <span
                    className="rounded px-1.5 py-0.5 text-2xs font-bold"
                    style={{ backgroundColor: actionCfg.color, color: '#000' }}
                  >
                    {actionCfg.short}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                  className="rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white transition"
                >
                  <X size={10} />
                </button>
              </div>

              {/* Room type badge — bottom */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                {img.detecting ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                    <Loader2 size={10} className="animate-spin" /> Detecting...
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-white truncate block">
                    {img.roomType}
                  </span>
                )}
              </div>

              {/* Selection indicator */}
              {img.selected && (
                <div className="absolute top-1 left-1">
                  <CheckCircle2 size={14} className="drop-shadow-md" style={{ color: actionCfg.color }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action summary */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(actionCounts) as [BatchAction, number][]).map(([action, count]) => {
            const cfg = ACTION_CONFIG[action];
            return (
              <span
                key={action}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
              >
                {cfg.icon} {count} {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {onSkipToEditor && (
          <button
            type="button"
            onClick={() => {
              const all = batchImages.map(img =>
                img.detecting ? { ...img, detecting: false, roomType: img.roomType || 'Living Room' as FurnitureRoomType } : img
              );
              onSkipToEditor(all);
            }}
            disabled={batchImages.length === 0}
            className="rounded-xl px-4 py-3 text-sm font-semibold border border-[var(--color-border-strong)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-white/5 inline-flex items-center justify-center gap-2"
          >
            Edit Individually
          </button>
        )}
        <button
          type="button"
          onClick={handleStartBatch}
          disabled={selectedCount === 0}
          className={`rounded-xl px-4 py-3 text-sm font-bold bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 inline-flex items-center justify-center gap-2 ${onSkipToEditor ? '' : 'col-span-2'}`}
        >
          <Images size={16} />
          Batch Process {selectedCount}
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        className="hidden"
      />
    </div>
  );
};

export default BatchUploader;
