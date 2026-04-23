import React, { useEffect, useRef, useState } from 'react';
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
  AlertTriangle,
  Lock,
  Image as ImageIcon,
  X,
  Zap,
} from 'lucide-react';
import PanelHeader from './PanelHeader';
import { Pill, Badge } from './ui';

type StageMode = 'text' | 'packs' | 'furniture';

interface RenovationControlsProps {
  activeMode: 'cleanup' | 'design';
  hasGenerated: boolean;
  onGenerate: (prompt: string, opts?: { fromPack?: boolean; useFlux?: boolean }) => void;
  onStageModeChange?: (mode: StageMode) => void;
  isGenerating: boolean;
  hasMask: boolean;
  selectedRoom: FurnitureRoomType;
  feedbackRequired?: boolean;
  initialPrompt?: string;
  onPromptChange?: (prompt: string) => void;
  initialStageMode?: 'text' | 'packs' | 'furniture';
  initialPreset?: string | null;
  onStageModeChanged?: (mode: 'text' | 'packs' | 'furniture') => void;
  onPresetChanged?: (preset: string | null) => void;
  /**
   * X3: Source image (data URL or base64) used only to read naturalWidth /
   * naturalHeight so we can flag narrow/awkward room geometry before packs
   * fire. Packs extend/reframe narrow rooms (width:height > 2.2 or < 0.6) to
   * fit bedroom furniture — adversarial fail from Phase 2 real-world QA.
   */
  sourceImage?: string | null;
  // D2: Structural Lock toggle — ON preserves architecture (default),
  // OFF lets Gemini modify walls/floors/fixtures for renovation mockups.
  structuralLock?: boolean;
  onStructuralLockChange?: (value: boolean) => void;
  // D3: Reference image (base64 data URL) for "use this sofa" style prompts.
  referenceImage?: string | null;
  onReferenceImageChange?: (value: string | null) => void;
}

/**
 * X3: Narrow-room detection. Returns true if the room aspect ratio (w:h)
 * is > 2.2 (very wide panoramic kitchen, short hallway) or < 0.6 (unusually
 * tall/pinched frame). Packs reframe these to shoehorn furniture.
 */
const NARROW_ASPECT_MAX = 2.2;
const NARROW_ASPECT_MIN = 0.6;

/**
 * Pack Matrix Fix 2 (2026-04-18): Room-type-aware pack prompts.
 *
 * Packs were built around the assumption that every room has a "furniture
 * zone" the pack can fill. That assumption only holds for the `FURNITURE`
 * tier. For `DECOR_ONLY` rooms (Kitchen / Bathroom / Laundry) the pack is
 * expressed entirely through accessories — cabinets/appliances/fixtures
 * must stay pixel-identical. For `PACK_DISABLED` rooms (Exterior / Patio /
 * Garage / Basement / Closet) packs don't make sense at all and we gate
 * them in the UI similar to the narrow-room geometry guard (X3).
 */
const FURNITURE_PACK_ROOMS: ReadonlyArray<FurnitureRoomType> = [
  'Living Room',
  'Bedroom',
  'Primary Bedroom',
  'Dining Room',
  'Office',
  'Nursery',
];
const DECOR_ONLY_PACK_ROOMS: ReadonlyArray<FurnitureRoomType> = [
  'Kitchen',
  'Bathroom',
  'Laundry Room',
];
const PACK_DISABLED_ROOMS: ReadonlyArray<FurnitureRoomType> = [
  'Exterior',
  'Patio',
  'Garage',
  'Basement',
  'Closet',
];
type PackTier = 'furniture' | 'decor-only' | 'disabled';
const packTierFor = (room: FurnitureRoomType): PackTier => {
  if (DECOR_ONLY_PACK_ROOMS.includes(room)) return 'decor-only';
  if (PACK_DISABLED_ROOMS.includes(room)) return 'disabled';
  // Default to full furniture pack for anything listed in FURNITURE_PACK_ROOMS
  // or unknown types (safer: err toward the tested default).
  return 'furniture';
};

const RenovationControls: React.FC<RenovationControlsProps> = ({
  activeMode,
  hasGenerated,
  onGenerate,
  onStageModeChange,
  isGenerating,
  hasMask,
  selectedRoom,
  feedbackRequired = false,
  initialPrompt = '',
  onPromptChange,
  initialStageMode = 'text',
  initialPreset = null,
  onStageModeChanged,
  onPresetChanged,
  sourceImage,
  structuralLock = true,
  onStructuralLockChange,
  referenceImage = null,
  onReferenceImageChange,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(initialPreset as StylePreset | null);
  const [customPrompt, setCustomPrompt] = useState(initialPrompt);
  const [stageMode, setStageMode] = useState<StageMode>(initialStageMode);
  const [useFlux, setUseFlux] = useState(false);

  // X3: Narrow-room detection for pack mode. Kick a hidden Image load and
  // cache whether the source ratio is "awkward" (too wide or too tall). Packs
  // on these frames tend to extend walls or reframe the room to fit standard
  // bedroom/living-room furniture — adversarial fail from Phase 2 QA.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!sourceImage) { setAspectRatio(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    };
    img.onerror = () => { if (!cancelled) setAspectRatio(null); };
    img.src = sourceImage.startsWith('data:') ? sourceImage : `data:image/jpeg;base64,${sourceImage}`;
    return () => { cancelled = true; };
  }, [sourceImage]);
  const isNarrowGeometry =
    aspectRatio !== null && (aspectRatio > NARROW_ASPECT_MAX || aspectRatio < NARROW_ASPECT_MIN);

  // D3: Reference-image drop zone state + helpers. FileReader → data URL;
  // surfaces to parent via onReferenceImageChange. Cleared via the Clear
  // button on the thumbnail.
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [isReferenceDragging, setIsReferenceDragging] = useState(false);
  const loadReferenceFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) onReferenceImageChange?.(result);
    };
    reader.readAsDataURL(file);
  };

  // Keep stable refs to avoid re-render loops when parent passes inline callbacks
  const onPromptChangeRef = useRef(onPromptChange);
  onPromptChangeRef.current = onPromptChange;
  const onStageModeChangedRef = useRef(onStageModeChanged);
  onStageModeChangedRef.current = onStageModeChanged;
  const onPresetChangedRef = useRef(onPresetChanged);
  onPresetChangedRef.current = onPresetChanged;

  // Notify parent when prompt/mode/preset changes so it can persist per-image
  useEffect(() => {
    onPromptChangeRef.current?.(customPrompt);
  }, [customPrompt]);

  useEffect(() => {
    onStageModeChangedRef.current?.(stageMode);
  }, [stageMode]);

  useEffect(() => {
    onPresetChangedRef.current?.(selectedPreset);
  }, [selectedPreset]);

  const presets: Array<{ id: StylePreset; icon: React.ReactNode; description: string; slug: string }> = [
    { id: 'Coastal Modern', icon: <Palmtree size={16} />, description: 'Light and airy flow', slug: 'coastal-modern' },
    { id: 'Urban Loft', icon: <Factory size={16} />, description: 'Industrial edge', slug: 'urban-loft' },
    { id: 'Farmhouse Chic', icon: <Wheat size={16} />, description: 'Rustic warmth', slug: 'farmhouse-chic' },
    { id: 'Minimalist', icon: <Sparkles size={16} />, description: 'Quiet simplicity', slug: 'minimalist' },
    { id: 'Mid-Century Modern', icon: <Layers size={16} />, description: 'Retro balance', slug: 'mid-century-modern' },
    { id: 'Scandinavian', icon: <Cloud size={16} />, description: 'Natural calm', slug: 'scandinavian' },
    { id: 'Bohemian', icon: <Flower2 size={16} />, description: 'Textured eclectic', slug: 'bohemian' },
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
  // X3: Block pack generation on narrow geometry — packs reframe these rooms.
  const packsBlockedByGeometry = stageMode === 'packs' && isNarrowGeometry;
  // Fix 2: Block pack generation for rooms where packs don't apply at all
  // (Exterior / Patio / Garage / Basement / Closet).
  const currentPackTier = packTierFor(selectedRoom);
  const packsBlockedByRoomType = stageMode === 'packs' && currentPackTier === 'disabled';
  const canGenerate =
    !feedbackRequired &&
    !packsBlockedByGeometry &&
    !packsBlockedByRoomType &&
    (stageMode === 'text' ? trimmedPrompt.length > 0 : stageMode === 'packs' ? Boolean(selectedPreset) : false);

  const PACK_DETAILS: Record<string, string> = {
    'Coastal Modern': 'light wood tones, white and sand-colored upholstery, rattan or woven accents, linen textures, soft blue and seafoam accents only in decor items',
    'Urban Loft': 'dark leather seating, metal and reclaimed wood, concrete-toned accents, warm Edison-style lighting, muted earth tones in decor',
    'Farmhouse Chic': 'distressed white wood, warm neutral fabrics, shiplap-compatible pieces, antique brass hardware accents, soft cream and sage decor',
    'Minimalist': 'clean-lined low-profile furniture, neutral whites and warm grays, no clutter, one or two simple accent pieces maximum',
    'Mid-Century Modern': 'tapered wood legs, warm walnut tones, mustard or teal accent pillows only, organic curved shapes, clean geometry',
    'Scandinavian': 'pale birch wood, white and light gray upholstery, simple wool throws, minimal greenery, airy and uncluttered',
    'Bohemian': 'layered textiles, warm terracotta and cream tones, woven rugs, macrame or rattan accents, natural materials',
  };

  const buildPrompt = () => {
    if (stageMode === 'furniture') return;

    let prompt = '';

    if (stageMode === 'text') {
      // Detect removal/cleanup intent so we don't wrap it in a "stage this room" prompt
      const lowerPrompt = trimmedPrompt.toLowerCase();
      const isRemovalIntent = /\b(remove|take out|get rid of|clear|empty|no furniture|declutter|strip|clean up|clean out|unstage|delete|erase)\b/.test(lowerPrompt);

      if (isRemovalIntent) {
        prompt = `Edit this ${selectedRoom}. Direction: ${trimmedPrompt}`;
      } else {
        prompt = `Virtually stage this ${selectedRoom}. Direction: ${trimmedPrompt}`;
      }
    }

    if (stageMode === 'packs') {
      if (!selectedPreset) return;
      // Fix 2: room-type-aware pack prompt. Packs are gated in the UI for
      // PACK_DISABLED_ROOMS; this branch handles the remaining two tiers.
      if (currentPackTier === 'disabled') return;
      const details = PACK_DETAILS[selectedPreset] || '';

      if (currentPackTier === 'decor-only') {
        // Kitchen / Bathroom / Laundry Room: pack is expressed through
        // accessories only. No furniture placement, no cabinet restyling.
        prompt = `Add ${selectedPreset}-style decor accents to this ${selectedRoom}. The pack is expressed through accessories ONLY — not furniture. Style DNA: ${details}.

HARD PRESERVATION RULES — these override any instinct to "improve" the room:
- DO NOT replace, restyle, recolor, or modify any cabinets, vanities, built-ins, countertops, backsplashes, islands, or millwork — they stay pixel-identical.
- DO NOT modify any appliances (refrigerator, range, dishwasher, washer, dryer, microwave, hood). Every appliance stays pixel-identical.
- DO NOT modify plumbing fixtures (toilets, sinks, tubs, showers, faucets). Every fixture stays pixel-identical.
- DO NOT modify windows, doors, door trim, baseboards, crown molding, flooring, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view.
- Add ONLY decor accents matching the pack DNA — for example: pendant-light styling, barstool cushions, dish towels, fruit bowls, potted herbs, window treatments, soap dispensers, towel sets, framed art, small plants.
- Do NOT place sofas, beds, dining tables, chairs, rugs larger than a runner, or any other primary furniture.
- Stage based on what the image actually shows, not what the room label suggests.`;
      } else {
        // Furniture tier: Living Room / Bedroom / Primary Bedroom / Dining
        // Room / Office / Nursery. Full furniture staging.
        prompt = `Virtually stage this ${selectedRoom} in ${selectedPreset} style. Add only furniture and decor. Style DNA: ${details}.

HARD PRESERVATION RULES — these override any instinct to "improve" the room:
- DO NOT modify, replace, or restyle any cabinets, vanities, built-ins, or millwork. Existing cabinet color, wood tone, and door style stay identical.
- DO NOT modify any appliances (refrigerator, range, dishwasher, washer, dryer, microwave, hood). If an appliance is present in the photo, it stays pixel-identical in the output.
- DO NOT change plumbing fixtures (toilets, sinks, tubs, showers, faucets). Bathrooms keep their existing fixtures — add only accessories (towels, soap, decor).
- DO NOT modify windows, doors, door trim, baseboards, crown molding, flooring, floor color, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view. Room dimensions stay the same.
- If the room is narrow, awkward, or small, stage within its actual footprint — do NOT extend walls or rearrange architecture to accommodate new furniture.
- Stage based on what the image actually shows, not what the room label suggests.`;
      }
    }

    if (hasMask) {
      prompt += ' ONLY update the masked area, keeping the rest of the image identical.';
    }

    onGenerate(prompt, { fromPack: stageMode === 'packs', useFlux: stageMode === 'text' && useFlux });
  };

  if (activeMode === 'cleanup') {
    return (
      <div className="space-y-5">
        <div className="premium-surface rounded-2xl p-5">
          <PanelHeader
            icon={<Eraser size={18} />}
            title="Architectural Cleanup"
            subtitle="Masked precision edit"
            className="mb-3"
          />
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
        <PanelHeader
          title="Mode"
          subtitle="Pick one path for this render"
          className="mb-4"
        />
        
        {/* Apple-Style Segmented Control (Jobs) */}
        <div className="relative flex p-1.5 rounded-xl bg-black/60 border border-[var(--color-border-strong)] shadow-inner">
          <div
            className="absolute top-1.5 bottom-1.5 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 drop-shadow-md transition-all duration-300 ease-spring"
            style={{
              // Container has p-1.5 (6px) padding. The 3 flex-1 buttons share
              // the content area (100% - 12px), so each button is
              // (100% - 12px) / 3 wide, starting at 6px + idx * that width.
              width: 'calc((100% - 12px) / 3)',
              left: `calc(6px + ${['text', 'packs', 'furniture'].indexOf(stageMode)} * ((100% - 12px) / 3))`,
            }}
          />
          <button
            type="button"
            onClick={() => setStageMode('text')}
            className={`relative z-10 flex-1 py-2 text-xs sm:text-xs font-bold uppercase tracking-wider transition-colors ${stageMode === 'text' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/60 hover:text-white'}`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setStageMode('packs')}
            className={`relative z-10 flex-1 py-2 text-xs sm:text-xs font-bold uppercase tracking-wider transition-colors ${stageMode === 'packs' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/60 hover:text-white'}`}
          >
            Packs
          </button>
          <button
            type="button"
            disabled
            className="relative z-10 flex-1 py-2 text-xs sm:text-xs font-bold uppercase tracking-wider text-[var(--color-text)]/30 cursor-not-allowed flex items-center justify-center gap-1"
          >
            Furnish <Badge tone="warn" className="hidden sm:inline-flex ml-1">SOON</Badge>
          </button>
        </div>

        {/* D2: Structural Lock toggle. Default ON preserves walls/floors/fixtures
            (matches current production rules). Flip OFF for gutted-renovation
            scenarios where Gemini has more architectural freedom. */}
        {onStructuralLockChange && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-black/40 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Lock size={13} className={structuralLock ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/50'} />
                <span className="text-xs font-semibold text-[var(--color-ink)]">Preserve architecture</span>
              </div>
              <p
                className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-text)]/60"
                title="ON: walls, floors, ceilings, windows, doors, and fixtures stay pixel-identical — ideal for staging. OFF: Gemini can repaint, re-floor, and restyle architecture — use for gutted renovation mockups."
              >
                {structuralLock
                  ? 'Walls, floors, fixtures stay locked (staging mode).'
                  : 'Renovation mode — walls/floors/fixtures can change.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={structuralLock}
              onClick={() => onStructuralLockChange(!structuralLock)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                structuralLock ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  structuralLock ? 'translate-x-[18px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {stageMode === 'text' && (
        <div className="premium-surface rounded-2xl p-5">
          <PanelHeader
            icon={<FilePenLine size={18} />}
            title="Design Direction"
            subtitle="Describe the look you want"
            className="mb-3"
          />
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
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              "Scandinavian minimalist with light oak wood",
              "Mid-century modern with warm walnut accents",
              "Coastal contemporary with natural textures",
              "Industrial loft with exposed brick"
            ].map(suggestion => (
              <Pill
                key={suggestion}
                onClick={() => setCustomPrompt(suggestion)}
              >
                {suggestion}
              </Pill>
            ))}
          </div>

          {/* Engine toggle: Gemini (staging) vs Flux 2 Pro (removal/editing) */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--color-text)]/50">Engine</span>
            <button
              type="button"
              onClick={() => setUseFlux(false)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                !useFlux
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/40'
                  : 'bg-white/[0.03] text-[var(--color-text)]/50 border border-transparent hover:bg-white/[0.06]'
              }`}
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => setUseFlux(true)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                useFlux
                  ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/40'
                  : 'bg-white/[0.03] text-[var(--color-text)]/50 border border-transparent hover:bg-white/[0.06]'
              }`}
            >
              <Zap size={10} />
              Flux
            </button>
            <span className="text-[10px] text-[var(--color-text)]/40 ml-1">
              {useFlux ? 'Best for removal — no ghosting' : 'Best for staging — adds furniture'}
            </span>
          </div>

          {/* D3: Reference-image drop zone. Text mode only. Packs skip —
              pack style-DNA shouldn't be diluted by ad-hoc references. */}
          {onReferenceImageChange && (
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-[var(--color-text)]/60">
                  <ImageIcon size={12} />
                  Reference element
                  <span className="normal-case tracking-normal font-normal text-[var(--color-text)]/50">(optional)</span>
                </div>
                {referenceImage && (
                  <button
                    type="button"
                    onClick={() => onReferenceImageChange(null)}
                    className="text-xs uppercase tracking-wider text-[var(--color-text)]/50 hover:text-[#FF375F] transition-colors flex items-center gap-1"
                    aria-label="Clear reference image"
                  >
                    <X size={11} />
                    Clear
                  </button>
                )}
              </div>
              <input
                ref={referenceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  loadReferenceFile(e.target.files?.[0]);
                  // Reset so selecting the same file again still fires onChange.
                  if (e.target) e.target.value = '';
                }}
              />
              {referenceImage ? (
                <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-black/40 p-2.5">
                  <img
                    src={referenceImage}
                    alt="Reference element"
                    className="h-16 w-16 rounded-lg object-cover border border-[var(--color-border-strong)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--color-ink)]">Reference attached</p>
                    <p className="text-[10.5px] leading-snug text-[var(--color-text)]/60 mt-0.5">
                      Name the piece in your prompt — e.g. "use this sofa" — so Gemini applies only this element's style.
                    </p>
                    <button
                      type="button"
                      onClick={() => referenceInputRef.current?.click()}
                      className="mt-1.5 text-xs uppercase tracking-wider font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsReferenceDragging(true); }}
                  onDragLeave={() => setIsReferenceDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsReferenceDragging(false);
                    loadReferenceFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`w-full rounded-xl border border-dashed px-3 py-3 text-left transition-all flex items-center gap-3 ${
                    isReferenceDragging
                      ? 'border-[var(--color-primary)] bg-[rgba(10,132,255,0.08)]'
                      : 'border-[var(--color-border-strong)] bg-black/30 hover:border-[var(--color-primary)]/60 hover:bg-black/50'
                  }`}
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--color-border-strong)] flex items-center justify-center">
                    <ImageIcon size={16} className="text-[var(--color-text)]/60" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--color-ink)]">Add reference</p>
                    <p className="text-[10.5px] leading-snug text-[var(--color-text)]/60">
                      Drop an image of a sofa, lamp, rug — Gemini will use it as a style guide for the piece you name.
                    </p>
                  </div>
                </button>
              )}
            </div>
          )}

        </div>
      )}

      {stageMode === 'packs' && (
        <div className="premium-surface rounded-2xl p-5">
          <PanelHeader
            icon={<Wand2 size={18} />}
            title="Style Packs"
            subtitle="Select a curated direction"
            className="mb-4"
          />
          <p className="mb-4 text-sm text-[var(--color-text)]/80">Choose one pack to generate a complete staging direction.</p>
          {/* Fix 2: Room-type guard. Packs are interior-furniture-focused —
              exterior/patio/garage/basement/closet don't have a pack equivalent.
              Mirrors the narrow-room guard pattern so the UX is consistent. */}
          {currentPackTier === 'disabled' && (
            <div className="mb-4 rounded-xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/5 px-3 py-2.5 text-sm leading-relaxed text-[#FFC15C] flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Packs are for interior rooms — <strong>{selectedRoom}</strong> isn't
                supported for packs. Use <strong>Text</strong> mode with a custom
                direction, or the Pro AI Tools for exterior / outdoor scenes.
              </span>
            </div>
          )}
          {/* Fix 2: Decor-only hint for Kitchen / Bathroom / Laundry Room —
              pack fires, but only through accessories. Tells the user what
              to expect so they don't file a "why didn't my cabinets change"
              bug. */}
          {currentPackTier === 'decor-only' && (
            <div className="mb-4 rounded-xl border border-[#0A84FF]/40 bg-[#0A84FF]/5 px-3 py-2.5 text-sm leading-relaxed text-[#7FB8FF] flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                In a <strong>{selectedRoom}</strong>, packs are applied through
                <em> decor accents only</em> (pendant styling, towels, window
                treatments, fruit bowls). Cabinets, appliances, and fixtures stay
                pixel-identical.
              </span>
            </div>
          )}
          {/* X3: Narrow-room guard. Prevents pack-mode from being fired on
              frames Gemini can't stage without reframing walls. */}
          {isNarrowGeometry && aspectRatio !== null && (
            <div className="mb-4 rounded-xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/5 px-3 py-2.5 text-sm leading-relaxed text-[#FFC15C] flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                This pack may not fit this room shape ({aspectRatio.toFixed(2)}:1 aspect).
                Packs can reframe narrow or unusually tall rooms to fit furniture.
                Try <strong>Text</strong> mode for a tailored direction, or crop the photo tighter.
              </span>
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto pr-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  // R34: 2-click pattern. First click on an unselected tile just
                  // shows the selection ring.  Second click on the SAME
                  // already-selected tile fires the Generate flow — skipping a
                  // trip to the sticky Generate button below.
                  onClick={() => {
                    if (active) {
                      // Second click on already-selected tile → pre-fire.
                      // X3: Suppress pre-fire on narrow rooms; user must bail
                      // via the warning banner or switch to Text mode first.
                      if (!isGenerating && !feedbackRequired && !isNarrowGeometry) {
                        buildPrompt();
                      }
                      return;
                    }
                    setSelectedPreset(preset.id);
                  }}
                  aria-pressed={active}
                  className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 aspect-[3/2] ${active
                    ? 'border-[var(--color-primary)] shadow-lg scale-[1.02] ring-2 ring-[var(--color-primary)]/50'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:scale-[1.01]'
                    }`}
                >
                  {/* D7: per-pack static preview render (see public/pack-previews/) */}
                  <img
                    src={`/pack-previews/${preset.slug}.jpg`}
                    alt={`${preset.id} staged preview`}
                    loading="lazy"
                    decoding="async"
                    className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 ${active ? 'scale-105' : 'group-hover:scale-105'}`}
                  />
                  {/* Bottom-anchored dark gradient so icon+label read against any preview */}
                  <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none" />
                  {active && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/20 to-transparent pointer-events-none" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-3 z-10">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active
                        ? 'bg-[var(--color-primary)] text-black shadow-md'
                        : 'bg-black/70 text-white border border-white/20 backdrop-blur-sm'
                        }`}
                    >
                      {preset.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white drop-shadow">{preset.id}</span>
                      <span className={`block text-xs uppercase tracking-wider truncate drop-shadow ${active ? 'text-[var(--color-primary)]' : 'text-white/75'}`}>{preset.description}</span>
                    </span>
                  </div>
                  {active && (
                    <span className="absolute top-2 right-2 text-xs uppercase tracking-wider text-white font-semibold bg-[var(--color-primary)]/90 px-2 py-1 rounded-md shadow pointer-events-none">
                      Click again to generate
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="premium-surface-strong rounded-2xl p-3 sm:p-5 sticky bottom-0 sm:bottom-2 space-y-2 sm:space-y-3 z-10">
        <button
          type="button"
          onClick={buildPrompt}
          disabled={isGenerating || !canGenerate}
          className={`w-full rounded-2xl px-3 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm font-black uppercase tracking-widest disabled:cursor-not-allowed transition-all duration-300 relative overflow-hidden group ${
            isGenerating || !canGenerate 
            ? 'bg-black/40 text-[var(--color-text)]/30 border border-[var(--color-border-strong)] shadow-inner' 
            : 'bg-[var(--color-primary)] text-white border border-[#0A84FF]/60 shadow-lg hover:shadow-xl hover:bg-[#409CFF]'
          }`}
        >
          {(!isGenerating && canGenerate) && (
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
          )}
          <span className="relative z-10 flex items-center justify-center gap-2">
             {isGenerating ? (
               <><Loader2 size={18} className="animate-spin text-[var(--color-primary)]" /> Staging...</>
             ) : hasGenerated ? (
               <><Wand2 size={18} /> {stageMode === 'packs' ? 'Restage in this style' : 'Apply this tweak'}</>
             ) : (
               <><Sparkles size={18} className="animate-pulse" /> Stage this room</>
             )}
          </span>
        </button>
        <p className="text-center text-xs text-[var(--color-text)]/72">
          {feedbackRequired
            ? 'Feedback checkpoint required. Submit a thumbs rating to continue staging.'
            : !hasGenerated
              ? 'First staging starts from your uploaded photo.'
              : stageMode === 'packs'
                ? 'Packs replace your current result with a fresh staging.'
                : 'We keep everything already in the room and change only what you ask for.'}
        </p>
      </div>
    </div>
  );
};

export default RenovationControls;
