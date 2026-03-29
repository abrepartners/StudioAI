import React, { useState } from 'react';
import { FurnitureRoomType, StylePreset } from '../types';
import {
  Sparkles,
  Eraser,
  ShieldCheck,
  FilePenLine,
} from 'lucide-react';

interface RenovationControlsProps {
  activeMode: 'cleanup' | 'design';
  hasGenerated: boolean;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  hasMask: boolean;
  selectedRoom: FurnitureRoomType;
  feedbackRequired?: boolean;
  isMultiGen: boolean;
  onMultiGenChange: (multiGen: boolean) => void;
}

const presetChips: Array<{ id: StylePreset; prompt: string }> = [
  { id: 'Coastal Modern', prompt: 'Coastal Modern staging with light and airy flow' },
  { id: 'Urban Loft', prompt: 'Urban Loft staging with industrial edge' },
  { id: 'Farmhouse Chic', prompt: 'Farmhouse Chic staging with rustic warmth' },
  { id: 'Minimalist', prompt: 'Minimalist staging with quiet simplicity' },
  { id: 'Mid-Century Modern', prompt: 'Mid-Century Modern staging with retro balance' },
  { id: 'Scandinavian', prompt: 'Scandinavian staging with natural calm' },
  { id: 'Bohemian', prompt: 'Bohemian staging with textured eclectic layers' },
];

const RenovationControls: React.FC<RenovationControlsProps> = ({
  activeMode,
  hasGenerated,
  onGenerate,
  isGenerating,
  hasMask,
  selectedRoom,
  feedbackRequired = false,
  isMultiGen,
  onMultiGenChange,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');

  const handleApplyCleanup = () => {
    onGenerate(
      'Architectural Restoration: Precisely remove only the masked items. Keep all doors, ceiling lights, and structural openings exactly as they appear in the original. Reveal the floor or hallway behind the mask. DO NOT cover hallways with new walls.'
    );
  };

  const trimmedPrompt = customPrompt.trim();
  const canGenerate = !feedbackRequired && trimmedPrompt.length > 0;

  const buildPrompt = () => {
    let prompt = `Virtually stage this ${selectedRoom}. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal. Primary direction: ${trimmedPrompt}`;

    if (hasMask) {
      prompt += ' ONLY update the masked area, keeping the rest of the image identical.';
    }

    onGenerate(prompt);
  };

  if (activeMode === 'cleanup') {
    return (
      <div className="space-y-5">
        <div className="premium-surface rounded-2xl p-5">
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

        <div className="premium-surface-strong rounded-2xl p-5 sticky bottom-5">
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
      <div className="premium-surface rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <FilePenLine size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Design Direction</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Describe or pick a style</p>
          </div>
        </div>
        <p className="mb-3 text-sm text-[var(--color-text)]/80">
          {hasGenerated ? 'Update your direction, then re-generate for a fresh composition.' : 'Describe what you want, or pick a style preset below.'}
        </p>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g. warm oak flooring, sculptural lamp, linen drapes"
          rows={3}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-white/85 px-3 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/45"
        />

        {/* Preset chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presetChips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCustomPrompt(chip.prompt)}
              className={`preset-chip ${customPrompt === chip.prompt ? 'active' : ''}`}
            >
              {chip.id}
            </button>
          ))}
        </div>

        {/* Quick suggestion pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "Scandinavian minimalist with light oak wood",
            "Mid-century modern with warm walnut accents",
            "Coastal contemporary with natural textures",
            "Industrial loft with exposed brick"
          ].map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setCustomPrompt(suggestion)}
              className="text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-white/50 hover:bg-white hover:border-[var(--color-accent)] transition-all text-[var(--color-text)]/80 hover:text-[var(--color-primary)] shadow-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="premium-surface-strong rounded-2xl p-5 sticky bottom-2 space-y-3">
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
          className="cta-primary min-h-[46px] w-full rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Rendering Design...' : hasGenerated ? 'Re-generate Design' : 'Generate Design'}
        </button>
        <p className="text-center text-xs text-[var(--color-text)]/72">
          {feedbackRequired
            ? 'Feedback checkpoint required. Submit a thumbs rating to continue generating.'
            : 'Re-generate always starts from the original upload to keep results fresh.'}
        </p>
      </div>
    </div>
  );
};

export default RenovationControls;
