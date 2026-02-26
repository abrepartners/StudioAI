import React, { useEffect, useState } from 'react';
import { FurnitureRoomType, StylePreset } from '../types';
import {
  Wand2,
  Sofa,
  Sparkles,
  Palmtree,
  Factory,
  Wheat,
  Library,
  Layers,
  Cloud,
  Flower2,
  Eraser,
  ShieldCheck,
  FilePenLine,
} from 'lucide-react';

type StageMode = 'text' | 'packs' | 'furniture';

interface RenovationControlsProps {
  activeMode: 'cleanup' | 'design';
  hasGenerated: boolean;
  onGenerate: (prompt: string) => void;
  onStageModeChange?: (mode: StageMode) => void;
  isGenerating: boolean;
  hasMask: boolean;
  selectedRoom: FurnitureRoomType;
  feedbackRequired?: boolean;
  compactMobile?: boolean;
  isMultiGen: boolean;
  onMultiGenChange: (multiGen: boolean) => void;
}

const RenovationControls: React.FC<RenovationControlsProps> = ({
  activeMode,
  hasGenerated,
  onGenerate,
  onStageModeChange,
  isGenerating,
  hasMask,
  selectedRoom,
  feedbackRequired = false,
  compactMobile = false,
  isMultiGen,
  onMultiGenChange,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [stageMode, setStageMode] = useState<StageMode>('text');

  const presets: Array<{ id: StylePreset; icon: React.ReactNode; description: string }> = [
    { id: 'Coastal Modern', icon: <Palmtree size={16} />, description: 'Light and airy flow' },
    { id: 'Urban Loft', icon: <Factory size={16} />, description: 'Industrial edge' },
    { id: 'Scandi Boho', icon: <Flower2 size={16} />, description: 'Warm and eclectic' },
    { id: 'Modern Farmhouse', icon: <Wheat size={16} />, description: 'Rustic luxury' },
    { id: 'Japandi', icon: <Library size={16} />, description: 'Minimalist serenity' },
    { id: 'Dark Academia', icon: <Layers size={16} />, description: 'Moody and sophisticated' },
    { id: 'Luxe Art Deco', icon: <Sparkles size={16} />, description: 'Opulent gold accents' },
    { id: 'Organic Modern', icon: <Cloud size={16} />, description: 'Natural textures' },
  ];

  const buildPrompt = () => {
    if (activeMode === 'cleanup') {
      onGenerate('cleanup');
      return;
    }

    if (stageMode === 'text') {
      if (!customPrompt.trim()) return;
      onGenerate(customPrompt);
    } else if (stageMode === 'packs') {
      if (!selectedPreset) return;
      onGenerate(selectedPreset);
    }
  };

  const canGenerate = (stageMode === 'text' ? !!customPrompt.trim() : !!selectedPreset) || activeMode === 'cleanup';

  useEffect(() => {
    if (onStageModeChange) onStageModeChange(stageMode);
  }, [stageMode, onStageModeChange]);

  if (activeMode === 'cleanup') {
    return (
      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <Eraser size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Smart Cleanup</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Remove items or imperfections</p>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100">
          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            Use the brush to mask areas you want to remove. Our AI will seamlessly fill in the space based on the surrounding textures.
          </p>
        </div>

        <div className="mt-5 rounded-2xl bg-sky-50 p-4 border border-sky-100 flex items-start gap-3">
          <div className="text-[var(--color-primary)] mt-0.5">
            <ShieldCheck size={16} />
          </div>
          <p className="text-[11px] text-sky-900 leading-relaxed">
            <strong>Pro Tip:</strong> Smaller brush strokes for fine details like wires or debris work best.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={compactMobile ? 'space-y-3' : 'space-y-4'}>
      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-3">
          <h3 className="font-display text-lg font-semibold">Mode</h3>
          {!compactMobile && <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Pick one path for this render</p>}
        </div>
        <div className={`grid grid-cols-3 ${compactMobile ? 'gap-1.5' : 'gap-2'}`}>
          <button
            type="button"
            onClick={() => setStageMode('text')}
            className={`rounded-2xl border px-2.5 py-2 text-left text-sm font-semibold transition-all ${stageMode === 'text'
              ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
              : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
              }`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setStageMode('packs')}
            className={`rounded-2xl border px-2.5 py-2 text-left text-sm font-semibold transition-all ${stageMode === 'packs'
              ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
              : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
              }`}
          >
            Packs
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-2xl border border-[var(--color-border)] bg-slate-100/70 px-2.5 py-2 text-left text-sm font-semibold text-slate-500"
          >
            <span className="block">Furniture</span>
            <span className="mt-1 inline-flex rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
              Coming Soon
            </span>
          </button>
        </div>
        {!compactMobile && (
          <p className="mt-3 text-xs text-[var(--color-text)]/72">
            Curated furniture staging is coming soon and is intentionally disabled in this beta.
          </p>
        )}
      </div>

      {stageMode === 'text' && (
        <div className="premium-surface rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
              <FilePenLine size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Custom Design</h3>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Prompt your vision</p>
            </div>
          </div>
          <div className="group relative">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. A modern living room with a navy velvet sofa and gold accents..."
              className="h-32 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white/80 p-4 text-sm transition-all focus:border-[var(--color-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100"
            />
          </div>
          {!compactMobile && (
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text)]/60">
              Be specific about textures (velvet, oak, linen) and colors for the best results.
            </p>
          )}
        </div>
      )}

      {stageMode === 'packs' && (
        <div className="premium-surface rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
              <Wand2 size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Style Packs</h3>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Select a curated direction</p>
            </div>
          </div>
          {!compactMobile && <p className="mb-4 text-sm text-[var(--color-text)]/80">Choose one pack to generate a complete staging direction.</p>}

          <div className={`grid gap-2 ${compactMobile ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {presets.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`rounded-2xl border px-2.5 py-2 text-left transition-all hover-lift ${active
                    ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
                    : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-[var(--color-accent)] text-white' : 'subtle-card text-[var(--color-text)]'
                        }`}
                    >
                      {preset.icon}
                    </span>
                    <span>
                      <span className={`block font-semibold text-[var(--color-ink)] ${compactMobile ? 'text-[12px] leading-tight' : 'text-sm'}`}>
                        {preset.id}
                      </span>
                      {!compactMobile && <span className="block text-xs text-[var(--color-text)]/70">{preset.description}</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className={
          compactMobile
            ? 'sticky bottom-0 z-20 -mx-5 mt-2 border-t border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(247,255,253,0.9),rgba(247,255,253,0.98))] px-5 pb-[max(0.95rem,env(safe-area-inset-bottom))] pt-3 space-y-2'
            : 'premium-surface-strong rounded-3xl p-5 sticky bottom-2 space-y-3'
        }
      >
        <label className="flex items-center gap-3 p-1 cursor-pointer group">
          <div className={`flex w-9 h-5 items-center rounded-full p-1 transition-colors ${isMultiGen ? 'bg-[var(--color-accent)]' : 'bg-slate-300'}`}>
            <div className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${isMultiGen ? 'translate-x-3.5' : 'translate-x-0'}`} />
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--color-ink)]">Enable Multi-Gen</span>
            <span className="block text-[10px] text-[var(--color-text)]/70">Generate 2 variations at once (Uses more credits)</span>
          </div>
          <input
            type="checkbox"
            className="hidden"
            checked={isMultiGen}
            onChange={(e) => onMultiGenChange(e.target.checked)}
          />
        </label>

        <button
          type="button"
          onClick={buildPrompt}
          disabled={isGenerating || !canGenerate}
          className={`cta-primary w-full rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-50 ${compactMobile ? 'min-h-[52px]' : 'min-h-[46px]'
            }`}
        >
          {isGenerating ? 'Rendering Design...' : hasGenerated ? 'Re-generate Design' : 'Generate Design'}
        </button>
        <p className={`${compactMobile ? 'text-left' : 'text-center'} text-xs text-[var(--color-text)]/72`}>
          {feedbackRequired
            ? 'Feedback checkpoint required. Submit a thumbs rating to continue generating.'
            : 'Re-generate always starts from the original upload to keep results fresh.'}
        </p>
      </div>
    </div>
  );
};

export default RenovationControls;
