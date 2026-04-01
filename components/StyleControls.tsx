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
  Loader2,
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
}) => {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [stageMode, setStageMode] = useState<StageMode>('text');

  const presets: Array<{ id: StylePreset; icon: React.ReactNode; description: string }> = [
    { id: 'Coastal Modern', icon: <Palmtree size={16} />, description: 'Light and airy flow' },
    { id: 'Urban Loft', icon: <Factory size={16} />, description: 'Industrial edge' },
    { id: 'Farmhouse Chic', icon: <Wheat size={16} />, description: 'Rustic warmth' },
    { id: 'Minimalist', icon: <Sparkles size={16} />, description: 'Quiet simplicity' },
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
    !feedbackRequired &&
    (stageMode === 'text' ? trimmedPrompt.length > 0 : stageMode === 'packs' ? Boolean(selectedPreset) : false);

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
      {/* 1-Click Auto-Pilot (Bezos) */}
      <div className="premium-surface rounded-2xl p-1 shadow-md bg-gradient-to-r from-[var(--color-bg-deep)] to-black border border-[var(--color-primary-dark)]">
        <button
          type="button"
          onClick={() => {
            const roomFurniture: Record<string, string> = {
              'Living Room': 'sofa, coffee table, accent chairs, area rug, floor lamp, and decorative shelving',
              'Bedroom': 'bed with upholstered headboard, nightstands, dresser, accent chair, and soft area rug',
              'Primary Bedroom': 'king bed with upholstered headboard, nightstands, bench, dresser, and layered textiles',
              'Dining Room': 'dining table, upholstered chairs, sideboard, pendant lighting, and table setting',
              'Office': 'desk, ergonomic chair, bookshelf, task lamp, and storage credenza',
              'Kitchen': 'bar stools, pendant lights, countertop accessories, and fresh greenery',
              'Exterior': 'outdoor seating, planters, pathway lighting, and landscaping accents',
            };
            const furniture = roomFurniture[selectedRoom] || 'furniture appropriate for this room';
            const autoPilotPrompt = `Virtually stage this ${selectedRoom} with ${furniture}. Contemporary luxury style with high-end textures, warm layered lighting, and perfectly balanced composition. Preserve architecture, layout, windows, doors, and built-in fixtures. Do NOT add furniture from other room types. Keep proportions photorealistic.`;
            setStageMode('text');
            setCustomPrompt(autoPilotPrompt);
            // True 1-click: immediately trigger generation
            onGenerate(autoPilotPrompt);
          }}
          disabled={isGenerating}
          className="w-full rounded-xl bg-black border border-[rgba(10,132,255,0.4)] px-4 py-4 text-center group hover:bg-[rgba(10,132,255,0.05)] transition-all overflow-hidden relative"
        >
          <div className="absolute inset-0 hidden opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity"></div>
          <div className="flex items-center justify-center gap-2 mb-1 relative z-10">
            <Sparkles size={18} className="text-[var(--color-primary)] animate-pulse" />
            <span className="font-display font-black tracking-[0.15em] uppercase text-white drop-shadow-sm bg-clip-text">Auto-Pilot</span>
          </div>
          <p className="text-[10px] text-[var(--color-primary)] font-mono opacity-80 group-hover:opacity-100 uppercase tracking-widest relative z-10">One-click staging</p>
        </button>
      </div>

      <div className="premium-surface rounded-2xl p-5">
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold">Mode</h3>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Pick one path for this render</p>
        </div>
        
        {/* Apple-Style Segmented Control (Jobs) */}
        <div className="relative flex p-1.5 rounded-xl bg-black/60 border border-[var(--color-border-strong)] shadow-inner">
          <div
            className="absolute top-1.5 bottom-1.5 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 drop-shadow-md transition-all duration-300 ease-spring"
            style={{
              width: 'calc(33.333% - 6px)',
              left: `calc(${['text', 'packs', 'furniture'].indexOf(stageMode)} * 33.333% + 5px)`,
            }}
          />
          <button
            type="button"
            onClick={() => setStageMode('text')}
            className={`relative z-10 flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors ${stageMode === 'text' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/60 hover:text-white'}`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setStageMode('packs')}
            className={`relative z-10 flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors ${stageMode === 'packs' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/60 hover:text-white'}`}
          >
            Packs
          </button>
          <button
            type="button"
            disabled
            className="relative z-10 flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/30 cursor-not-allowed flex items-center justify-center gap-1"
          >
            Furnish <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1 rounded border border-amber-500/20 hidden sm:inline">SOON</span>
          </button>
        </div>
      </div>

      {stageMode === 'text' && (
        <div className="premium-surface rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
              <FilePenLine size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Design Direction</h3>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70">Describe the look you want</p>
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
            className="w-full rounded-2xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/40 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono"
          />
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
                className="text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full border border-[var(--color-border-strong)] bg-black/40 hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/50 transition-all text-[var(--color-text)]/70 hover:text-[var(--color-primary)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {stageMode === 'packs' && (
        <div className="premium-surface rounded-2xl p-5">
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

          <div className="max-h-[280px] overflow-y-auto pr-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-300 ${active
                    ? 'border-[var(--color-primary)] bg-[rgba(10,132,255,0.05)] shadow-md scale-[1.02]'
                    : 'border-[var(--color-border)] bg-black/40 hover:bg-black hover:border-[var(--color-border-strong)] hover:scale-[1.01]'
                    }`}
                >
                  {active && <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent pointer-events-none"></div>}
                  <div className="flex items-center gap-3 relative z-10">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? 'bg-[var(--color-primary)] text-black shadow-md' : 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border-strong)]'
                        }`}
                    >
                      {preset.icon}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-bold transition-colors ${active ? 'text-white' : 'text-[var(--color-ink)]'}`}>{preset.id}</span>
                      <span className={`block text-[10px] uppercase tracking-wider truncate transition-colors ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/60'}`}>{preset.description}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="premium-surface-strong rounded-2xl p-5 sticky bottom-2 space-y-3">
        <button
          type="button"
          onClick={buildPrompt}
          disabled={isGenerating || !canGenerate}
          className={`w-full rounded-2xl px-3 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm font-black uppercase tracking-widest disabled:cursor-not-allowed transition-all duration-300 relative overflow-hidden group ${
            isGenerating || !canGenerate 
            ? 'bg-black/40 text-[var(--color-text)]/30 border border-[var(--color-border-strong)] shadow-inner' 
            : 'bg-[var(--color-primary)] text-black border border-[#0A84FF] shadow-lg hover:shadow-xl hover:bg-[#00ffd5] scale-100 hover:scale-[1.02]'
          }`}
        >
          {(!isGenerating && canGenerate) && (
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
          )}
          <span className="relative z-10 flex items-center justify-center gap-2">
             {isGenerating ? <><Loader2 size={18} className="animate-spin text-[var(--color-primary)]" /> Generating...</> : hasGenerated ? <><Wand2 size={18} /> Re-Generate Design</> : <><Sparkles size={18} className="animate-pulse" /> Generate Design</>}
          </span>
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
