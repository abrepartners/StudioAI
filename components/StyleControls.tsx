import React, { useState } from 'react';
import { FurnitureRoomType, StylePreset, StagedFurniture, SavedLayout } from '../types';
import {
  Wand2,
  Sofa,
  Sparkles,
  Palmtree,
  Factory,
  Wheat,
  RotateCw,
  Plus,
  Library,
  Layers,
  Cloud,
  Flower2,
  Eraser,
  ShieldCheck,
  Dices,
  X,
  FilePenLine,
  Home,
} from 'lucide-react';

interface RenovationControlsProps {
  activeMode: 'cleanup' | 'design';
  hasGenerated: boolean;
  onGenerate: (prompt: string) => void;
  onReroll: () => void;
  isGenerating: boolean;
  hasMask: boolean;
  stagedFurniture: StagedFurniture[];
  addFurniture: (name: string) => void;
  removeFurniture: (id: string) => void;
  rotateFurniture: (id: string) => void;
  onAutoArrange: () => void;
  isAutoArranging: boolean;
  savedLayouts: SavedLayout[];
  saveCurrentLayout: (name: string) => void;
  loadLayout: (layout: SavedLayout) => void;
  selectedRoom: FurnitureRoomType;
  setSelectedRoom: (room: FurnitureRoomType) => void;
}

const RenovationControls: React.FC<RenovationControlsProps> = ({
  activeMode,
  hasGenerated,
  onGenerate,
  onReroll,
  isGenerating,
  hasMask,
  stagedFurniture,
  addFurniture,
  removeFurniture,
  rotateFurniture,
  selectedRoom,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

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

  const furnitureSuggestions: Record<FurnitureRoomType, string[]> = {
    'Living Room': ['Sectional Sofa', 'Coffee Table', 'TV Stand', 'Armchair', 'Area Rug', 'Wall Art'],
    Bedroom: ['King Bed', 'Nightstands', 'Dresser', 'Lamps', 'Bench'],
    'Dining Room': ['Dining Table', 'Chairs', 'Sideboard', 'Chandelier'],
    Office: ['Executive Desk', 'Chair', 'Bookshelf', 'Floor Lamp'],
    Kitchen: ['Bar Stools', 'Fruit Bowl', 'Pendant Lights'],
    'Primary Bedroom': ['Cal King Bed', 'Chaise Lounge', 'Vanity', 'Mirror'],
    Exterior: ['Patio Set', 'Outdoor Grill', 'Sun Loungers', 'Fire Pit', 'Potted Palms'],
  };

  const handleApplyCleanup = () => {
    onGenerate(
      'Architectural Restoration: Precisely remove only the masked items. Keep all doors, ceiling lights, and structural openings exactly as they appear in the original. Reveal the floor or hallway behind the mask. DO NOT cover hallways with new walls.'
    );
  };

  const buildPrompt = () => {
    const itemsDesc = stagedFurniture.map((f) => `${f.name} (${f.orientation})`).join(', ');
    let prompt = `Virtually stage as a ${selectedRoom} in ${selectedPreset || 'Modern'} style. IMPORTANT: Do not change any of the original items of the room like the curtains. Preserving architecture.`;

    if (itemsDesc) {
      prompt += ` Add: ${itemsDesc}.`;
    }

    if (customPrompt) {
      prompt += ` ${customPrompt}`;
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
    <div className="space-y-5">
      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <Home size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Room Profile</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Detected context</p>
          </div>
        </div>
        <div className="pill-chip inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold">
          {selectedRoom}
        </div>
      </div>

      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <FilePenLine size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Design Notes</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Prompt refinement</p>
          </div>
        </div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g. warm oak flooring, sculptural lamp, linen drapes"
          rows={3}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-white/85 px-3 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/45"
        />
      </div>

      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <Sofa size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Furniture Staging</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Curated suggestions</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {furnitureSuggestions[selectedRoom]?.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addFurniture(item)}
              className="pill-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all hover:bg-white"
            >
              <Plus size={12} />
              {item}
            </button>
          ))}
        </div>

        {stagedFurniture.length > 0 && (
          <div className="space-y-2 border-t panel-divider pt-3">
            {stagedFurniture.map((f) => (
              <div key={f.id} className="subtle-card flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm">
                <span className="font-medium text-[var(--color-ink)]">{f.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => rotateFurniture(f.id)}
                    className="rounded-lg p-1.5 text-[var(--color-text)] transition-all hover:bg-white"
                    title="Rotate"
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFurniture(f.id)}
                    className="rounded-lg p-1.5 text-[var(--color-text)] transition-all hover:bg-rose-100 hover:text-rose-700"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
            <Wand2 size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Style Palette</h3>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Select an aesthetic</p>
          </div>
        </div>

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

      <div className="premium-surface-strong rounded-3xl p-5 sticky bottom-5 space-y-3">
        <button
          type="button"
          onClick={buildPrompt}
          disabled={isGenerating}
          className="cta-primary w-full rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Rendering Design...' : hasGenerated ? 'Re-generate Design' : 'Generate Design'}
        </button>

        <button
          type="button"
          onClick={onReroll}
          disabled={isGenerating || (!selectedPreset && !stagedFurniture.length && !customPrompt)}
          className="cta-secondary w-full rounded-2xl px-4 py-3 text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="inline-flex items-center gap-2">
            <Dices size={14} /> Explore Variation
          </span>
        </button>
      </div>
    </div>
  );
};

export default RenovationControls;
