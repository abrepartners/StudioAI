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
}

const RenovationControls: React.FC<RenovationControlsProps> = ({
  activeMode,
  hasGenerated,
  onGenerate,
  onStageModeChange,
  isGenerating,
  hasMask,
  selectedRoom,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [stageMode, setStageMode] = useState<StageMode>('text');

  const presets: Array<{ id: StylePreset; icon: React.ReactNode; description: string }> = [
    { id: 'Coastal Modern', icon: <Palmtree size={16} />, description: 'Light and airy flow' },
    { id: 'Urban Loft', icon: <Factory size={16} />, description: 'Industrial edge' },
    { id: 'Farmhouse Chic', icon: <Wheat size={16} />, description: 'Rustic warmth' },
    { id: 'Minimalist', icon: <Sparkles size={16} />, description: 'Quiet simplicity' },
    { id: 'Traditional', icon: <Library size={16} />, description: 'Layered classic' },
    { id: 'Mid-Century Modern', icon: <Layers size={16} />, description: 'Retro balance' },
    { id: 'Scandinavian', icon: <Cloud size={16} />, description: 'Natural calm' },
    { id: 'Bohemian', icon: <Flower2 size={16} />, description: 'Textured eclectic' },
  ];

  useEffect(() => {
    onStageModeChange?.(stageMode);
  }, [onStageModeChange, stageMode]);

  const handleApplyCleanup = () => {
    onGenerate(
      'Architectural Restoration: Precisely remove only the masked items. Keep all doors, ceiling lights, and structural openings exactly as they appear in the original. Reveal the floor or hallway behind the mask. DO NOT cover hallways with new walls.'
    );
  };

  const trimmedPrompt = customPrompt.trim();
  const canGenerate =
    stageMode === 'text' ? trimmedPrompt.length > 0 : stageMode === 'packs' ? Boolean(selectedPreset) : false;

  const buildPrompt = () => {
    if (stageMode === 'furniture') return;

    let prompt = '';

    if (stageMode === 'text') {
      prompt = `Virtually stage this ${selectedRoom}. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal. Primary direction: ${trimmedPrompt}`;
    }

    if (stageMode === 'packs') {
      if (!selectedPreset) return;
      prompt = `Virtually stage this ${selectedRoom} in a ${selectedPreset} pack direction. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal.`;
    }

    if (hasMask) {
      prompt += ' ONLY update the masked area, keeping the rest of the image identical.';
    }

    onGenerate(prompt);
  };

  if (activeMode === 'cleanup') {
    return (
      <div className="space-y-5">
        <div className="premium-surface rounded-3xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
              <Eraser size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Architectural Cleanup</h3>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Masked precision edit</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-text)]/85">
            Paint over unwanted objects to remove them while preserving doors, windows, and lighting.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-300/45 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          <p className="flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Structural fixtures are protected unless specifically included in the selected mask.
          </p>
        </div>

        <div className="premium-surface-strong rounded-3xl p-5 sticky bottom-5">
          <button
            type="button"
            onClick={handleApplyCleanup}
            disabled={isGenerating || !hasMask}
            className="cta-primary w-full rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? 'Processing Mask...' : 'Remove and Reveal'}
          </button>
          <p className="mt-3 text-center text-xs text-[var(--color-text)]/70">
            {hasMask ? 'Mask detected. Ready to process.' : 'Draw over an area on the canvas to enable cleanup.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-3">
          <h3 className="font-display text-lg font-semibold">Mode</h3>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Pick one path for this render</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setStageMode('text')}
            className={`rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition-all ${
              stageMode === 'text'
                ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
                : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
            }`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setStageMode('packs')}
            className={`rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition-all ${
              stageMode === 'packs'
                ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
                : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
            }`}
          >
            Packs
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-2xl border border-[var(--color-border)] bg-slate-100/70 px-3 py-2 text-left text-sm font-semibold text-slate-500"
          >
            <span className="block">Furniture</span>
            <span className="mt-1 inline-flex rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
              Coming Soon
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text)]/72">
          Curated furniture staging is coming soon and is intentionally disabled in this beta.
        </p>
      </div>

      {stageMode === 'text' && (
        <div className="premium-surface rounded-3xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
              <FilePenLine size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Design Direction</h3>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Primary generation input</p>
            </div>
          </div>
          <p className="mb-3 text-sm text-[var(--color-text)]/80">
            {hasGenerated ? 'Update your direction, then re-generate for a fresh composition.' : 'Describe the first design you want to generate.'}
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g. warm oak flooring, sculptural lamp, linen drapes"
            rows={4}
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white/85 px-3 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/45"
          />
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
          <p className="mb-4 text-sm text-[var(--color-text)]/80">Choose one pack to generate a complete staging direction.</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`rounded-2xl border px-3 py-2 text-left transition-all ${
                    active
                      ? 'border-[var(--color-accent)] bg-sky-50 shadow-[0_8px_20px_rgba(3,105,161,0.14)]'
                      : 'border-[var(--color-border)] bg-white/80 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        active ? 'bg-[var(--color-accent)] text-white' : 'subtle-card text-[var(--color-text)]'
                      }`}
                    >
                      {preset.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-[var(--color-ink)]">{preset.id}</span>
                      <span className="block text-xs text-[var(--color-text)]/70">{preset.description}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="premium-surface-strong rounded-3xl p-5 sticky bottom-2 space-y-3">
        <button
          type="button"
          onClick={buildPrompt}
          disabled={isGenerating || !canGenerate}
          className="cta-primary min-h-[46px] w-full rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Rendering Design...' : hasGenerated ? 'Re-generate Design' : 'Generate Design'}
        </button>
        <p className="text-center text-xs text-[var(--color-text)]/72">
          Re-generate always starts from the original upload to keep results fresh.
        </p>
      </div>
    </div>
  );
};

export default RenovationControls;
