import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import { fluxCleanup } from '../../services/fluxService';
import { fluxTwilight, TwilightColorStyle, TwilightTime } from '../../services/twilightService';
import { nanoSky, SkyStyle } from '../../services/skyService';
import { upscaleImage } from '../../services/upscaleService';
import { isExteriorRoom } from '../../services/fluxService';
import { fluxStaging } from '../../services/stagingService';
import { reveEdit } from '../../services/reveEditService';
import { STYLE_PACKS, buildStagingAssignment } from '../prompts/stylePacks';
import { detectClutterMasks, combineSelectedMasks } from '../../services/samService';
import ClutterMaskSelector from '../../components/ClutterMaskSelector';
import JSZip from 'jszip';
import { savePhoto as idbSavePhoto, saveResult as idbSaveResult, loadPhotos as idbLoadPhotos, loadResults as idbLoadResults } from './imageStore';

interface UploadedPhoto {
  id: number;
  file: File;
  dataUrl: string;
  label: string;
  detecting: boolean;
}

interface HistoryEntry {
  tool: string;
  preset: string;
  image: string;
}

interface PhotoGenState {
  tool: string;
  preset: string;
  step: number;
  progress: number;
  abort: AbortController;
  timerRef: ReturnType<typeof setTimeout> | null;
}

const TOOLS = [
  { section: 'Refine' },
  { id: 'staging', icon: 'armchair', name: 'Virtual staging', desc: 'Add furniture in context', cost: '2 cr' },
  { id: 'declutter', icon: 'sparkles', name: 'Declutter & cleanup', desc: 'Remove personal items', cost: '1 cr' },
  { id: 'whiten', icon: 'sun', name: 'Daylight & white balance', desc: 'Even, warm exposure', cost: '0.5 cr' },
  { section: 'Atmosphere' },
  { id: 'twilight', icon: 'moon', name: 'Twilight conversion', desc: 'Day to dusk', cost: '2 cr' },
  { id: 'sky', icon: 'cloud', name: 'Sky replacement', desc: 'Clear blue or golden hour', cost: '1 cr' },
  { id: 'lawn', icon: 'cloud', name: 'Lawn & landscape', desc: 'Greener, polished exteriors', cost: '1 cr' },
];

const PRESETS: Record<string, string[]> = {
  staging: ['Contemporary', 'Mid-century', 'Coastal', 'Farmhouse', 'Scandinavian', 'Minimalist', 'Urban loft', 'Bohemian'],
  declutter: ['Full clean', 'Personal items only', 'Surface clutter only', 'Precision select'],
  declutter_ext: ['Yard clutter', 'Vehicles & bins', 'Signs & temp items'],
  whiten: ['Bright & airy', 'Warm editorial', 'Neutral'],
  twilight_style: ['Pink', 'Golden', 'Purple', 'Natural'],
  twilight_time: ['Early evening', 'Sunset', 'Twilight'],
  sky: ['Clear blue', 'Golden hour', 'Soft overcast', 'Dramatic'],
  lawn: ['Manicured', 'Natural', 'Drought-resistant'],
};

const DECLUTTER_FILTER_MAP: Record<string, string | undefined> = {
  'full clean': 'fullclean',
  'personal items only': 'personal',
  'surface clutter only': 'surfaces',
  'yard clutter': 'yard',
  'vehicles & bins': 'vehicles',
  'signs & temp items': 'signs',
};

const TOOL_STEPS: Record<string, string[]> = {
  staging:   ['Analyzing room geometry…', 'Selecting furniture for style…', 'Rendering surfaces + shadows…', 'Finalizing…'],
  declutter: ['Detecting personal items…', 'Mapping inpaint regions…', 'Reconstructing surfaces…', 'Finalizing…'],
  whiten:    ['Sampling light sources…', 'Adjusting white balance…', 'Harmonizing exposure…', 'Finalizing…'],
  twilight:  ['Analyzing exterior lighting…', 'Compositing golden hour sky…', 'Blending window glow…', 'Finalizing…'],
  sky:       ['Masking roofline…', 'Matching perspective…', 'Compositing sky layer…', 'Finalizing…'],
  lawn:      ['Detecting lawn area…', 'Applying seasonal correction…', 'Blending edges…', 'Finalizing…'],
};

const TOOL_COST: Record<string, number> = { staging: 2, declutter: 1, whiten: 0.5, twilight: 2, sky: 1, lawn: 1 };

const ROOM_TYPES = [
  'Living Room', 'Dining Room', 'Kitchen', 'Bedroom', 'Bathroom',
  'Office', 'Laundry Room', 'Garage', 'Bonus Room', 'Nursery',
  'Basement', 'Foyer', 'Hallway', 'Closet', 'Sunroom',
  'Exterior', 'Patio', 'Pool', 'Backyard', 'Front Yard',
];

const BATCH_CONCURRENCY = 3;

interface PhotoEditorProps {
  setPage: (p: string) => void;
  credits: number;
  requestSpend: (amount: number, after?: (res: any) => void) => boolean;
  refundCredits: (amount: number) => void;
  activeProject?: { id: string; address: string; city: string; propertyType: string; beds: number | null; baths: number | null } | null;
  updateProject?: (id: string, partial: Record<string, any>) => void;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, b64] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
};

type SamModalController = (image: string, masks: string[]) => Promise<number[] | null>;

const callApiDirect = async (
  imageBase64: string,
  roomLabel: string,
  tool: string,
  preset: string,
  customRemovalVal: string,
  signal: AbortSignal,
  requestSamMaskSelection?: SamModalController,
): Promise<string> => {
  const presetMap: Record<string, Record<string, string>> = {
    sky: { 'clear blue': 'blue', 'golden hour': 'golden', 'soft overcast': 'overcast', 'dramatic': 'dramatic' },
  };

  switch (tool) {
    case 'staging': {
      const packKey = preset.replace(/ /g, '-');
      const pack = STYLE_PACKS[packKey] || STYLE_PACKS[preset];
      const prompt = pack
        ? buildStagingAssignment(pack, roomLabel)
        : `Virtually stage this ${roomLabel.toLowerCase()} with ${preset} style furnishings. Use premium furniture materials. Match the room's existing lighting on all new pieces. Professional real estate photography composition.`;
      const result = await fluxStaging(imageBase64, prompt, signal);
      return result.resultBase64;
    }
    case 'declutter': {
      const isPrecision = preset.toLowerCase() === 'precision select';
      const filter = isPrecision ? undefined : (DECLUTTER_FILTER_MAP[preset] || undefined);
      const custom = customRemovalVal || undefined;

      let maskBase64: string | undefined;
      let customPrompt: string | undefined;

      if (isPrecision) {
        if (!requestSamMaskSelection) {
          throw new Error('Precision select requires the mask picker — internal wiring error.');
        }
        const samResult = await detectClutterMasks(imageBase64);
        if (!samResult || samResult.individualMasksBase64.length === 0) {
          throw new Error('Could not detect any objects. Try a different preset.');
        }
        const selectedIndices = await requestSamMaskSelection(imageBase64, samResult.individualMasksBase64);
        if (!selectedIndices || selectedIndices.length === 0) {
          throw new Error('Cleanup cancelled');
        }
        const selectedMasks = selectedIndices.map((i) => samResult.individualMasksBase64[i]);
        maskBase64 = await combineSelectedMasks(selectedMasks);
        customPrompt = `Remove all objects in the masked area from this ${roomLabel.toLowerCase()}. Reconstruct the revealed surfaces by matching the surrounding texture, color, and lighting exactly. Do not add any new items. Leave all unmasked pixels identical to the input.`;
      }

      const result = await fluxCleanup(imageBase64, roomLabel, signal, {
        filter, customRemoval: custom, skipUpscale: true,
        maskBase64, customPrompt,
      });
      return result.resultBase64;
    }
    case 'whiten': {
      const whitenSpecs: Record<string, string> = {
        'bright & airy': `TARGET: Bright, high-key real estate photography.
- Color temperature: 5500K neutral to slightly cool (5800K max).
- Exposure: lift +0.3 to +0.5 EV from current level. Aim for bright without blowout — highlights should clip at 250/255 max, not 255/255.
- Shadows: open to 20-30% — detail visible in every corner and under furniture. No crushed blacks.
- Whites: clean and bright without blue or yellow cast. White walls should read as true white, not warm cream or cool blue.
- Saturation: natural — do not boost. Wood tones and fabric colors should remain accurate to life.`,
        'warm editorial': `TARGET: Warm, editorial interior photography — Architectural Digest feel.
- Color temperature: 4200-4500K warm. Golden window light enhanced but not orange. Think "late afternoon sun through a west window."
- Exposure: +0.2 to +0.3 EV — slightly lifted but not high-key. Rich midtones are more important than bright highlights.
- Shadows: warm and soft, 15-25% density. Shadow areas should feel inviting, not dark.
- Whites: warm cream, not stark white. Warm but not yellow.
- Saturation: natural with very slight warmth boost in wood tones and fabrics. Do not oversaturate.`,
        'neutral': `TARGET: Perfectly neutral white balance — WYSIWYG accuracy.
- Color temperature: 5000K daylight neutral. Zero color cast of any kind.
- Exposure: match metered value — 0 EV correction. If the photo is slightly dark, keep it slightly dark. If bright, keep bright.
- Whites: true neutral white. Use a white wall or ceiling as reference — it should appear as pure white with no warmth or coolness.
- Saturation: accurate to life. No enhancement, no reduction.
- This is a correction, not a look. The goal is "what your eyes saw when standing in the room."`,
      };
      const spec = whitenSpecs[preset] || whitenSpecs['neutral'];
      const prompt = `PHOTO EDITING TASK — WHITE BALANCE AND EXPOSURE CORRECTION ONLY.

${spec}

PRESERVE EXACTLY (pixel-identical):
- All furniture, objects, decor, and architecture — geometry unchanged.
- All surface textures: carpet pile, wood grain, tile grout, fabric weave, wall texture. Do NOT smooth or denoise any surface.
- Camera framing, perspective, lens distortion, depth of field.
- All objects in the scene — do not add, remove, or reposition anything.

DO NOT:
- Smooth, denoise, sharpen, or HDR-process any surface.
- Add or remove any object, shadow, reflection, or highlight.
- Change the color of any object — only ambient light temperature changes.
- Apply any tonal curve, LUT, or color grade beyond the specified target.
- Make the photo "better" in any way not specified. This is a surgical white balance correction, not a retouch.`;
      const result = await reveEdit(imageBase64, prompt, false, signal);
      return result.resultBase64;
    }
    case 'twilight': {
      const [colorStyle, timeOfDay] = preset.split('|') as [TwilightColorStyle, TwilightTime];
      const result = await fluxTwilight(imageBase64, colorStyle || 'golden', timeOfDay || 'sunset', signal);
      return result.resultBase64;
    }
    case 'sky': {
      const mapped = presetMap.sky[preset] || 'blue';
      const result = await nanoSky(imageBase64, mapped as SkyStyle, signal);
      return result.resultBase64;
    }
    case 'lawn': {
      const lawnSpecs: Record<string, string> = {
        'manicured': `TARGET: Professionally maintained residential lawn — the "just mowed for the listing shoot" look.
- Grass color: rich, consistent green with natural micro-variation — NOT flat neon green. Real grass has 3-4 shades from light yellow-green (sun exposed) to deep green (shaded). Include this variation.
- Grass texture: visible individual blade definition at close range. Slight height variation (0.5-1 inch). Natural thatch layer at base visible in foreground. Blade direction consistent with a mow pattern.
- Edges: crisp, clean borders where grass meets concrete, mulch, or garden beds. Natural feathering — not a hard pixel line.
- Shadows: micro-shadows between blades matching the scene's sun angle and direction. Shadow density consistent with the rest of the photo.
- Bare spots or brown patches: fill with matching green grass at the same texture density as surrounding areas.`,
        'natural': `TARGET: Healthy, lived-in lawn — lush and organic, not manicured.
- Grass color: multi-tonal green with natural variation. Some areas slightly longer, some slightly shorter. Clover or ground cover patches acceptable.
- Grass texture: mixed heights (1-3 inches), natural growth patterns, some seed heads in taller areas. Organic and realistic, not uniform.
- Edges: soft, natural borders. Grass creeping slightly over concrete or mulch edges is fine — this is a natural yard.
- Keep existing weeds that aren't distracting. Remove only obvious dead patches or bare dirt.`,
        'drought-resistant': `TARGET: Drought-tolerant xeriscaping — intentionally sparse, landscaped.
- Replace bare/dead lawn areas with: decorative gravel or decomposed granite, mulch beds with drought-resistant plants (succulents, agave, lavender, rosemary, ornamental grasses), and sparse drought-resistant ground cover.
- Keep existing trees, large shrubs, and hardscape exactly as-is.
- Natural, intentional spacing between plants. Not overgrown, not barren.
- Gravel/stone should have natural color variation and shadow detail.`,
      };
      const spec = lawnSpecs[preset] || lawnSpecs['manicured'];
      const prompt = `LANDSCAPING ENHANCEMENT — EXTERIOR PHOTO EDIT.

${spec}

PHOTOGRAPHY DNA:
- The enhanced lawn/landscaping must have the SAME photographic noise, grain, and compression texture as the rest of the image. If the photo is grainy, the grass is grainy. If clean, the grass is clean.
- Shadows on grass must match the scene's sun position, angle, and softness.
- Color temperature of the lawn must match the rest of the scene exactly.

PRESERVE EXACTLY (pixel-identical):
- House: every architectural element, siding, windows, doors, roof, trim.
- Hardscape: driveway, walkways, retaining walls, fences, mailbox.
- Sky, clouds, lighting conditions — no changes.
- Existing mature trees and large shrubs — no additions or removals.
- Camera framing and perspective.

DO NOT:
- Add new trees, structures, or landscape features not specified.
- Change the season or time of day.
- Smooth or denoise any non-lawn area.
- Modify the house, driveway, or any built structure.`;
      const result = await reveEdit(imageBase64, prompt, true, signal);
      return result.resultBase64;
    }
    default:
      return imageBase64;
  }
};

const VellumPhotoEditor: React.FC<PhotoEditorProps> = ({ setPage, credits, requestSpend, refundCredits, activeProject, updateProject }) => {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [activity, setActivity] = useState<{ who: string; what: string; cost: number; when: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const nextId = useRef(0);
  const restoredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeProject?.id || restoredRef.current === activeProject.id) return;
    restoredRef.current = activeProject.id;

    setPhotos([]);
    setProcessedResults({});
    setProcessedSet(new Set());
    setPhotoHistory({});
    nextId.current = 0;

    (async () => {
      const [savedPhotos, savedResults] = await Promise.all([
        idbLoadPhotos(activeProject.id),
        idbLoadResults(activeProject.id),
      ]);
      if (!savedPhotos.length) return;
      const maxId = Math.max(...savedPhotos.map(p => p.photoId));
      nextId.current = maxId + 1;
      const restored: UploadedPhoto[] = savedPhotos.map(p => ({
        id: p.photoId,
        file: new File([], p.fileName),
        dataUrl: p.dataUrl,
        label: p.label,
        detecting: false,
      }));
      setPhotos(restored);
      if (Object.keys(savedResults).length) {
        setProcessedResults(savedResults);
        setProcessedSet(new Set(Object.keys(savedResults).map(Number)));
      }
    })().catch(() => {});
  }, [activeProject?.id]);

  const processFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const newPhotos: UploadedPhoto[] = [];
    for (const file of imageFiles) {
      let dataUrl: string;
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch {
        console.warn(`[Vellum] Skipped unreadable file: ${file.name}`);
        continue;
      }
      const id = nextId.current++;
      newPhotos.push({ id, file, dataUrl, label: 'Living Room', detecting: false });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    setActivity(a => [{ who: 'You', what: `Uploaded ${newPhotos.length} photo${newPhotos.length > 1 ? 's' : ''}`, cost: 0, when: 'just now' }, ...a]);

    for (const p of newPhotos) {
      if (activeProject?.id) idbSavePhoto(activeProject.id, p.id, p.dataUrl, p.label, p.file.name).catch(() => {});
    }

    // Show room type picker so user can tag each photo
    if (newPhotos.length > 0) setShowRoomPicker(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const [activeTool, setActiveToolRaw] = useState('staging');
  const [stylePreset, setStylePreset] = useState('contemporary');
  const [twilightTime, setTwilightTime] = useState<TwilightTime>('sunset');
  const [customRemoval, setCustomRemoval] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const setActiveTool = (tool: string) => {
    setActiveToolRaw(tool);
    if (tool === 'twilight') {
      setStylePreset('golden');
      setTwilightTime('sunset');
    } else {
      const firstPreset = (PRESETS[tool] || [])[0];
      if (firstPreset) setStylePreset(firstPreset.toLowerCase());
    }
    setCustomRemoval('');
  };
  const [view, setView] = useState<'compare' | 'grid' | 'single'>('compare');
  const [singlePhoto, setSinglePhoto] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [samModal, setSamModal] = useState<{
    image: string;
    masks: string[];
    resolver: (indices: number[] | null) => void;
  } | null>(null);

  const [splitPos, setSplitPos] = useState(50);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    draggingRef.current = true;
    onMoveRaw(e.nativeEvent);
    document.body.style.cursor = 'ew-resize';
  };

  const onMoveRaw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!draggingRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(2, Math.min(98, x)));
  }, []);

  const onUp = useCallback(() => { draggingRef.current = false; document.body.style.cursor = ''; }, []);

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => onMoveRaw(e);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', onUp);
    };
  }, [onMoveRaw, onUp]);

  useEffect(() => {
    const onUploadEvent = () => fileInputRef.current?.click();
    window.addEventListener('vellum:upload-files', onUploadEvent);
    return () => window.removeEventListener('vellum:upload-files', onUploadEvent);
  }, []);

  // --- Per-photo generation state ---
  const [genMap, setGenMap] = useState<Record<number, PhotoGenState>>({});
  const [processedSet, setProcessedSet] = useState<Set<number>>(new Set());
  const [processedResults, setProcessedResults] = useState<Record<number, string>>({});
  const [justUpdated, setJustUpdated] = useState<Set<number>>(new Set());

  const [photoHistory, setPhotoHistory] = useState<Record<number, HistoryEntry[]>>({});

  const photoCount = photos.length;

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const processedResultsRef = useRef(processedResults);
  processedResultsRef.current = processedResults;
  const genMapRef = useRef(genMap);
  genMapRef.current = genMap;

  const isPhotoGenerating = (id: number) => id in genMap;
  const anyGenerating = Object.keys(genMap).length > 0;
  const generatingCount = Object.keys(genMap).length;

  // Batch tracking (for the right panel progress bar)
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const batchMode = batchTotal > 0 && batchDone < batchTotal;

  const startProgressForPhoto = (photoId: number, tool: string): { timer: ReturnType<typeof setTimeout> } => {
    const steps = TOOL_STEPS[tool] || TOOL_STEPS.staging;
    let prog = 0;
    let step = 0;
    const tick = () => {
      prog += 1.5 + Math.random() * 2;
      const capped = Math.min(prog, 90);
      const expectedStep = Math.floor((capped / 100) * (steps.length - 1));
      if (expectedStep !== step) step = expectedStep;
      setGenMap(prev => {
        if (!(photoId in prev)) return prev;
        return { ...prev, [photoId]: { ...prev[photoId], progress: capped, step } };
      });
      if (prog < 90) {
        timer = setTimeout(tick, 200 + Math.random() * 300);
        setGenMap(prev => {
          if (!(photoId in prev)) return prev;
          return { ...prev, [photoId]: { ...prev[photoId], timerRef: timer } };
        });
      }
    };
    let timer = setTimeout(tick, 200);
    return { timer };
  };

  const processOnePhoto = async (
    photoId: number,
    tool: string,
    preset: string,
    customRemovalVal: string,
  ): Promise<boolean> => {
    let photo = photosRef.current.find(p => p.id === photoId);
    if (!photo) return false;

    if (photo.detecting) {
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 200));
        photo = photosRef.current.find(p => p.id === photoId);
        if (!photo) return false;
        if (!photo.detecting) break;
      }
    }

    const controller = new AbortController();
    const { timer } = startProgressForPhoto(photoId, tool);

    setGenMap(prev => ({
      ...prev,
      [photoId]: { tool, preset, step: 0, progress: 0, abort: controller, timerRef: timer },
    }));

    try {
      const inputImage = processedResultsRef.current[photo.id] || photo.dataUrl;
      const resultDataUrl = await callApiDirect(
        inputImage, photo.label, tool, preset, customRemovalVal, controller.signal,
        (image, masks) => new Promise<number[] | null>((resolve) => {
          setSamModal({ image, masks, resolver: resolve });
        }),
      );

      setGenMap(prev => {
        const entry = prev[photoId];
        if (entry?.timerRef) clearTimeout(entry.timerRef);
        const next = { ...prev };
        delete next[photoId];
        return next;
      });

      setProcessedResults(prev => ({ ...prev, [photo!.id]: resultDataUrl }));
      setProcessedSet(prev => new Set([...prev, photo!.id]));
      if (activeProject?.id) idbSaveResult(activeProject.id, photo.id, resultDataUrl).catch(() => {});

      // Flash "Updated" indicator
      setJustUpdated(prev => new Set([...prev, photo!.id]));
      setTimeout(() => setJustUpdated(prev => { const n = new Set(prev); n.delete(photo!.id); return n; }), 1500);

      setPhotoHistory(prev => ({
        ...prev,
        [photo!.id]: [...(prev[photo!.id] || []), { tool, preset, image: resultDataUrl }],
      }));

      const toolInfo = TOOLS.find(t => 'id' in t && t.id === tool);
      setActivity(a => [{
        who: 'Vellum',
        what: `${(toolInfo as any)?.name} applied to ${photo!.label} · ${preset}`,
        cost: TOOL_COST[tool],
        when: 'just now',
      }, ...a]);

      return true;
    } catch (err: any) {
      setGenMap(prev => {
        const entry = prev[photoId];
        if (entry?.timerRef) clearTimeout(entry.timerRef);
        const next = { ...prev };
        delete next[photoId];
        return next;
      });

      refundCredits(TOOL_COST[tool]);

      if (err.name === 'AbortError') {
        setActivity(a => [{
          who: 'Vellum',
          what: `Cancelled ${photo.label} — ${TOOL_COST[tool]} cr refunded`,
          cost: 0,
          when: 'just now',
        }, ...a]);
        return false;
      }
      console.error('[Vellum] Generation failed:', err);
      setActivity(a => [{
        who: 'Vellum',
        what: `Failed on ${photo.label} — ${TOOL_COST[tool]} cr refunded`,
        cost: 0,
        when: 'just now',
      }, ...a]);
      return false;
    }
  };

  const handleApply = () => {
    if (!photos.length) return;
    const photoIdx = view === 'single' ? (singlePhoto ?? selectedPhoto) : selectedPhoto;
    const photo = photos[photoIdx];
    if (!photo || isPhotoGenerating(photo.id)) return;

    const frozenTool = activeTool;
    const frozenPreset = activeTool === 'twilight' ? `${stylePreset}|${twilightTime}` : stylePreset;
    const frozenCustom = customRemoval;

    requestSpend(TOOL_COST[activeTool], () => {
      processOnePhoto(photo.id, frozenTool, frozenPreset, frozenCustom);
    });
  };

  const handleApplyAll = () => {
    if (!photos.length) return;
    const targets = photos.filter(p => !isPhotoGenerating(p.id));
    if (!targets.length) return;
    const totalCost = TOOL_COST[activeTool] * targets.length;

    const frozenTool = activeTool;
    const frozenPreset = activeTool === 'twilight' ? `${stylePreset}|${twilightTime}` : stylePreset;
    const frozenCustom = customRemoval;

    requestSpend(totalCost, async () => {
      setBatchTotal(targets.length);
      setBatchDone(0);

      const queue = [...targets];
      const runBatch = async () => {
        const chunk = queue.splice(0, BATCH_CONCURRENCY);
        if (!chunk.length) return;

        await Promise.all(chunk.map(async (p) => {
          await processOnePhoto(p.id, frozenTool, frozenPreset, frozenCustom);
          setBatchDone(d => d + 1);
        }));

        if (queue.length > 0) await runBatch();
      };

      await runBatch();
      setBatchTotal(0);
      setBatchDone(0);
      setActivity(a => [{
        who: 'Vellum',
        what: `Batch complete — ${targets.length} photos processed`,
        cost: 0,
        when: 'just now',
      }, ...a]);
    });
  };

  const handleSelectPhoto = (idx: number) => {
    setSelectedPhoto(idx);
  };

  const handleUndo = () => {
    const photo = currentPhotoRef.current;
    if (!photo) return;
    const stack = photoHistory[photo.id];
    if (!stack || stack.length === 0) return;

    const newStack = stack.slice(0, -1);
    if (newStack.length === 0) {
      setPhotoHistory(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
      setProcessedResults(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
      setProcessedSet(prev => { const n = new Set(prev); n.delete(photo.id); return n; });
    } else {
      setPhotoHistory(prev => ({ ...prev, [photo.id]: newStack }));
      setProcessedResults(prev => ({ ...prev, [photo.id]: newStack[newStack.length - 1].image }));
    }
    setActivity(a => [{ who: 'Vellum', what: `Undo on ${photo.label}`, cost: 0, when: 'just now' }, ...a]);
  };

  const handleReset = () => {
    const photo = currentPhotoRef.current;
    if (!photo) return;
    setPhotoHistory(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
    setProcessedResults(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
    setProcessedSet(prev => { const n = new Set(prev); n.delete(photo.id); return n; });
    setActivity(a => [{ who: 'Vellum', what: `Reset ${photo.label} to original`, cost: 0, when: 'just now' }, ...a]);
  };

  useEffect(() => () => {
    (Object.values(genMapRef.current) as PhotoGenState[]).forEach(gs => {
      if (gs.timerRef) clearTimeout(gs.timerRef);
      gs.abort.abort();
    });
  }, []);

  const getAfterImage = (photo: UploadedPhoto) => processedResults[photo.id] || null;
  const isRefined = (photo: UploadedPhoto) => processedSet.has(photo.id);
  const refinedCount = photos.filter(p => processedSet.has(p.id)).length;

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportLabel, setExportLabel] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportConfirm, setExportConfirm] = useState<null | 'single' | 'batch'>(null);
  const [exportProgress, setExportProgress] = useState<{
    done: number;
    total: number;
    startedAt: number;
    items: { id: number; label: string; status: 'queued' | 'upscaling' | 'done' | 'failed' }[];
  } | null>(null);

  const currentPhotoIdx = view === 'single' ? (singlePhoto ?? selectedPhoto) : selectedPhoto;
  const currentPhoto = photos[currentPhotoIdx] || photos[0] || null;
  const currentPhotoRef = useRef(currentPhoto);
  currentPhotoRef.current = currentPhoto;

  const upscaleForExport = async (base64: string, label: string): Promise<string> => {
    try {
      const result = await upscaleImage(base64, isExteriorRoom(label));
      return result.resultBase64;
    } catch (err: any) {
      console.warn(`[Vellum] Upscale failed for ${label}, exporting preview quality:`, err?.message);
      return base64;
    }
  };

  const doDownloadAll = async () => {
    const refined = photos.filter(p => processedResults[p.id]);
    if (!refined.length) return;
    setExporting(true);
    const items = refined.map(p => ({ id: p.id, label: p.label, status: 'queued' as const }));
    setExportProgress({ done: 0, total: refined.length, startedAt: Date.now(), items });
    try {
      if (refined.length === 1) {
        setExportProgress(prev => prev && ({ ...prev, items: prev.items.map(it => it.id === refined[0].id ? { ...it, status: 'upscaling' } : it) }));
        setExportLabel(`Upscaling ${refined[0].label}…`);
        const upscaled = await upscaleForExport(processedResults[refined[0].id], refined[0].label);
        const blob = dataUrlToBlob(upscaled);
        setExportProgress(prev => prev && ({ ...prev, done: 1, items: prev.items.map(it => it.id === refined[0].id ? { ...it, status: 'done' } : it) }));
        triggerDownload(blob, `${refined[0].label.replace(/\s+/g, '_')}_refined.jpg`);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < refined.length; i++) {
          const p = refined[i];
          setExportProgress(prev => prev && ({ ...prev, items: prev.items.map(it => it.id === p.id ? { ...it, status: 'upscaling' } : it) }));
          setExportLabel(`Upscaling ${i + 1} of ${refined.length}… ${p.label}`);
          const upscaled = await upscaleForExport(processedResults[p.id], p.label);
          const blob = dataUrlToBlob(upscaled);
          const name = `${String(i + 1).padStart(3, '0')}_${p.label.replace(/\s+/g, '_')}_refined.jpg`;
          zip.file(name, blob);
          setExportProgress(prev => prev && ({ ...prev, done: i + 1, items: prev.items.map(it => it.id === p.id ? { ...it, status: 'done' } : it) }));
        }
        setExportLabel('Packaging zip…');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zipBlob, 'vellum_export.zip');
      }
      setActivity(a => [{ who: 'Vellum', what: `Downloaded ${refined.length} refined photo${refined.length > 1 ? 's' : ''} (upscaled)`, cost: 0, when: 'just now' }, ...a]);
    } catch (err: any) {
      console.error('[Vellum] Export failed:', err);
      setExportError('Export failed — please try again');
      setActivity(a => [{ who: 'Vellum', what: `Export failed — ${err.message || 'unknown error'}`, cost: 0, when: 'just now' }, ...a]);
      setTimeout(() => setExportError(''), 5000);
    }
    setExporting(false);
    setExportLabel('');
    setExportProgress(null);
  };

  const doDownloadSingle = async (idx: number) => {
    const photo = photos[idx];
    if (!photo) return;
    const src = processedResults[photo.id];
    if (!src) return;
    setExporting(true);
    setExportLabel(`Upscaling ${photo.label}…`);
    setExportProgress({ done: 0, total: 1, startedAt: Date.now(), items: [{ id: photo.id, label: photo.label, status: 'upscaling' }] });
    try {
      const upscaled = await upscaleForExport(src, photo.label);
      const blob = dataUrlToBlob(upscaled);
      setExportProgress(prev => prev && ({ ...prev, done: 1, items: [{ id: photo.id, label: photo.label, status: 'done' }] }));
      triggerDownload(blob, `${photo.label.replace(/\s+/g, '_')}_refined.jpg`);
    } catch (err: any) {
      console.error('[Vellum] Single export failed:', err);
      setExportError('Export failed — please try again');
      setActivity(a => [{ who: 'Vellum', what: `Export failed — ${err.message || 'unknown error'}`, cost: 0, when: 'just now' }, ...a]);
      setTimeout(() => setExportError(''), 5000);
    }
    setExporting(false);
    setExportLabel('');
    setExportProgress(null);
  };

  const doExportOriginalSingle = async (idx: number) => {
    const photo = photos[idx];
    if (!photo) return;
    setExportConfirm(null);
    setExporting(true);
    setExportLabel(`Upscaling ${photo.label}…`);
    setExportProgress({ done: 0, total: 1, startedAt: Date.now(), items: [{ id: photo.id, label: photo.label, status: 'upscaling' }] });
    try {
      const upscaled = await upscaleForExport(photo.dataUrl, photo.label);
      const blob = dataUrlToBlob(upscaled);
      setExportProgress(prev => prev && ({ ...prev, done: 1, items: [{ id: photo.id, label: photo.label, status: 'done' }] }));
      triggerDownload(blob, `${photo.label.replace(/\s+/g, '_')}_upscaled.jpg`);
      setActivity(a => [{ who: 'Vellum', what: `Exported original (upscaled) · ${photo.label}`, cost: 0, when: 'just now' }, ...a]);
    } catch (err: any) {
      console.error('[Vellum] Original export failed:', err);
      setExportError('Export failed — please try again');
      setTimeout(() => setExportError(''), 5000);
    }
    setExporting(false);
    setExportLabel('');
    setExportProgress(null);
  };

  const doExportOriginalBatch = async () => {
    const unedited = photos.filter(p => !processedResults[p.id]);
    if (!unedited.length) return;
    setExportConfirm(null);
    setExporting(true);
    const items = unedited.map(p => ({ id: p.id, label: p.label, status: 'queued' as const }));
    setExportProgress({ done: 0, total: unedited.length, startedAt: Date.now(), items });
    try {
      if (unedited.length === 1) {
        setExportProgress(prev => prev && ({ ...prev, items: prev.items.map(it => it.id === unedited[0].id ? { ...it, status: 'upscaling' } : it) }));
        setExportLabel(`Upscaling ${unedited[0].label}…`);
        const upscaled = await upscaleForExport(unedited[0].dataUrl, unedited[0].label);
        const blob = dataUrlToBlob(upscaled);
        setExportProgress(prev => prev && ({ ...prev, done: 1, items: prev.items.map(it => it.id === unedited[0].id ? { ...it, status: 'done' } : it) }));
        triggerDownload(blob, `${unedited[0].label.replace(/\s+/g, '_')}_upscaled.jpg`);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < unedited.length; i++) {
          const p = unedited[i];
          setExportProgress(prev => prev && ({ ...prev, items: prev.items.map(it => it.id === p.id ? { ...it, status: 'upscaling' } : it) }));
          setExportLabel(`Upscaling ${i + 1} of ${unedited.length}… ${p.label}`);
          const upscaled = await upscaleForExport(p.dataUrl, p.label);
          const blob = dataUrlToBlob(upscaled);
          zip.file(`${String(i + 1).padStart(3, '0')}_${p.label.replace(/\s+/g, '_')}_upscaled.jpg`, blob);
          setExportProgress(prev => prev && ({ ...prev, done: i + 1, items: prev.items.map(it => it.id === p.id ? { ...it, status: 'done' } : it) }));
        }
        setExportLabel('Packaging zip…');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zipBlob, 'vellum_originals_upscaled.zip');
      }
      setActivity(a => [{ who: 'Vellum', what: `Exported ${unedited.length} original${unedited.length > 1 ? 's' : ''} (upscaled)`, cost: 0, when: 'just now' }, ...a]);
    } catch (err: any) {
      console.error('[Vellum] Batch original export failed:', err);
      setExportError('Export failed — please try again');
      setTimeout(() => setExportError(''), 5000);
    }
    setExporting(false);
    setExportLabel('');
    setExportProgress(null);
  };

  // ---- Upload zone (shown when no photos loaded) ----
  if (!photos.length) {
    return (
      <div className="v-editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className={'v-upload-zone' + (dragOver ? ' drag-over' : '')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) processFiles(e.target.files); }}
          />
          <div className="v-upload-icon">
            <Icon name="upload" size={32} color="var(--pale-gold)" />
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 500, margin: '16px 0 8px' }}>
            {activeProject ? `Upload photos for ${activeProject.address}` : 'Drop listing photos here'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--graphite)', margin: 0, lineHeight: 1.6 }}>
            or click to browse · JPG, PNG, WebP, HEIC · up to 50 photos per batch
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button className="v-btn v-btn--primary v-btn--sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              <Icon name="upload" size={13} /> Browse files
            </button>
          </div>
        </div>
      </div>
    );
  }

  const afterImage = currentPhoto ? getAfterImage(currentPhoto) : null;
  const toolName = (TOOLS.find(t => 'id' in t && t.id === activeTool) as any)?.name || 'Processing';
  const currentIsGenerating = currentPhoto ? isPhotoGenerating(currentPhoto.id) : false;
  const currentGenState = currentPhoto ? genMap[currentPhoto.id] : undefined;
  const currentJustUpdated = currentPhoto ? justUpdated.has(currentPhoto.id) : false;

  const renderBeforeAfter = (
    containerRef: React.RefObject<HTMLDivElement | null>,
    photo: UploadedPhoto,
  ) => {
    const after = getAfterImage(photo);
    const refined = isRefined(photo);
    const photoGen = genMap[photo.id];
    const photoUpdated = justUpdated.has(photo.id);

    return (
      <div
        className="v-ba-stage"
        ref={containerRef}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        {/* Refining indicator — top bar */}
        {photoGen && (
          <div className="v-refining-bar">
            <div className="v-refining-bar-fill" style={{ width: `${photoGen.progress}%` }} />
          </div>
        )}

        {/* Updated flash */}
        {photoUpdated && (
          <div className="v-updated-flash">
            <span>Updated</span>
          </div>
        )}

        {/* BEFORE — full stage background */}
        <img src={photo.dataUrl} className="v-ba-img-el" alt="" draggable={false} />

        {/* AFTER — full size, clipped from the right via clip-path */}
        <div className="v-ba-clip" style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}>
          {refined && after ? (
            <img src={after} className="v-ba-img-el" alt="" draggable={false} />
          ) : (
            <>
              <img src={photo.dataUrl} className="v-ba-img-el v-ba-img-dimmed" alt="" draggable={false} />
              {!photoGen && (
                <div className="v-ba-pending">
                  <span>Apply to see result</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="v-ba-tag b">{refined ? `After · ${photo.label}` : 'Pending'}</div>
        <div className="v-ba-tag a">Before</div>

        <div className="v-ba-handle" style={{ left: `${splitPos}%` }}>
          <div className="v-ba-knob">‹›</div>
        </div>

        {/* Refining pill overlay — non-blocking, top-right */}
        {photoGen && (
          <div className="v-refining-pill">
            <span className="v-refining-dot" />
            <span>{(TOOL_STEPS[photoGen.tool] || TOOL_STEPS.staging)[photoGen.step]}</span>
          </div>
        )}
      </div>
    );
  };

  const renderThumbStatus = (photo: UploadedPhoto) => {
    if (isPhotoGenerating(photo.id)) {
      return <span className="v-t-spinner" />;
    }
    if (justUpdated.has(photo.id)) {
      return <span className="v-t-updated" />;
    }
    if (isRefined(photo)) {
      return <span className="v-t-dot" />;
    }
    return null;
  };

  const renderCompare = () => (
    <>
      {renderBeforeAfter(stageRef, currentPhoto)}

      <div className="v-thumb-strip">
        {photos.map((p, i) => (
          <div
            key={p.id}
            className={'v-t' + (selectedPhoto === i ? ' selected' : '') + (isRefined(p) ? ' refined' : '') + (isPhotoGenerating(p.id) ? ' generating' : '')}
            style={{ backgroundImage: `url(${isRefined(p) && getAfterImage(p) ? getAfterImage(p) : p.dataUrl})` }}
            onClick={() => handleSelectPhoto(i)}
            title={p.label}
          >
            <span className="v-num">{String(i + 1).padStart(2, '0')}</span>
            {renderThumbStatus(p)}
          </div>
        ))}
        <div
          className="v-t v-t-add"
          onClick={() => fileInputRef.current?.click()}
          title="Add more photos"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--soft-stone)', cursor: 'pointer' }}
        >
          <Icon name="plus" size={16} color="var(--graphite)" />
        </div>
      </div>

    </>
  );

  const renderGrid = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {photos.map((p, i) => {
        const after = getAfterImage(p);
        const photoGen = isPhotoGenerating(p.id);
        return (
          <div
            key={p.id}
            onClick={() => { setSinglePhoto(i); setView('single'); }}
            style={{
              position: 'relative', aspectRatio: '4/3', borderRadius: 8,
              backgroundImage: `url(${after || p.dataUrl})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              cursor: 'pointer', overflow: 'hidden',
              transition: 'transform 180ms ease, box-shadow 180ms ease',
            }}
          >
            {photoGen && (
              <div className="v-refining-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                <div className="v-refining-bar-fill" style={{ width: `${genMap[p.id]?.progress || 0}%` }} />
              </div>
            )}
            <span style={{
              position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 600,
              background: 'rgba(247,246,242,0.95)', padding: '3px 8px', borderRadius: 3,
            }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{
              position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 500,
              background: photoGen
                ? 'rgba(216,199,154,0.9)'
                : isRefined(p) ? 'rgba(76,175,80,0.9)' : 'rgba(27,29,31,0.5)',
              color: photoGen ? 'var(--deep-charcoal)' : 'var(--warm-ivory)',
              padding: '3px 8px', borderRadius: 3,
            }}>
              {photoGen ? 'Refining…' : isRefined(p) ? 'Refined' : p.detecting ? 'Detecting…' : p.label}
            </span>
          </div>
        );
      })}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          aspectRatio: '4/3', borderRadius: 8, border: '2px dashed var(--soft-stone)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', gap: 8, color: 'var(--graphite)', fontSize: 12,
        }}
      >
        <Icon name="plus" size={20} color="var(--graphite)" />
        Add photos
      </div>
    </div>
  );

  const renderSingle = () => {
    const spIdx = singlePhoto ?? selectedPhoto;
    const sp = photos[spIdx] || photos[0];
    if (!sp) return null;
    const after = getAfterImage(sp);
    const showImage = after || sp.dataUrl;
    const photoGen = genMap[sp.id];
    const photoUpdated = justUpdated.has(sp.id);
    const history = photoHistory[sp.id] || [];

    return (
      <div className="v-single-photo-view">
        <div className="v-single-nav">
          {photos.map((p, i) => {
            const pAfter = getAfterImage(p);
            return (
              <button
                key={p.id}
                className={'v-single-thumb' + (spIdx === i ? ' active' : '') + (isRefined(p) ? ' refined' : '') + (isPhotoGenerating(p.id) ? ' generating' : '')}
                onClick={() => { setSinglePhoto(i); setSelectedPhoto(i); }}
                style={{ backgroundImage: `url(${pAfter || p.dataUrl})` }}
              >
                <span className="v-single-num">{String(i + 1).padStart(2, '0')}</span>
                {renderThumbStatus(p)}
              </button>
            );
          })}
        </div>
        <div className="v-ba-stage" style={{ position: 'relative' }}>
          {photoGen && (
            <div className="v-refining-bar">
              <div className="v-refining-bar-fill" style={{ width: `${photoGen.progress}%` }} />
            </div>
          )}
          {photoUpdated && (
            <div className="v-updated-flash">
              <span>Updated</span>
            </div>
          )}
          <img src={showImage} className="v-ba-img-el" alt="" draggable={false} />

          {photoGen && (
            <div className="v-refining-pill">
              <span className="v-refining-dot" />
              <span>{(TOOL_STEPS[photoGen.tool] || TOOL_STEPS.staging)[photoGen.step]}</span>
            </div>
          )}
        </div>
        <div style={{
          position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, alignItems: 'center', zIndex: 5,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 4,
            background: isRefined(sp) ? 'rgba(76,175,80,0.9)' : 'rgba(27,29,31,0.6)',
            color: 'var(--warm-ivory)',
          }}>
            {isRefined(sp)
              ? history.length > 1
                ? `${history.length} edits`
                : 'Refined'
              : 'Original'}
          </span>
          {isRefined(sp) && (
            <>
              <button onClick={handleUndo} className="v-btn v-btn--ghost v-btn--sm" style={{
                fontSize: 11, padding: '4px 10px', background: 'rgba(27,29,31,0.7)',
                color: 'var(--warm-ivory)', borderColor: 'transparent',
              }}>
                Undo
              </button>
              <button onClick={handleReset} className="v-btn v-btn--ghost v-btn--sm" style={{
                fontSize: 11, padding: '4px 10px', background: 'rgba(27,29,31,0.7)',
                color: 'var(--warm-ivory)', borderColor: 'transparent',
              }}>
                Reset
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const unrefinedCount = photoCount - refinedCount;
  const applyAllTargets = photos.filter(p => !isPhotoGenerating(p.id));
  const applyAllCount = applyAllTargets.length;
  const applyAllCost = Math.round(TOOL_COST[activeTool] * applyAllCount);

  return (
    <div className={'v-editor' + (leftCollapsed ? ' left-collapsed' : '') + (rightCollapsed ? ' right-collapsed' : '')}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
      />

      <div className={'v-editor-left' + (leftCollapsed ? ' collapsed' : '')}>
        <button
          className="v-panel-toggle v-panel-toggle--left"
          onClick={() => setLeftCollapsed(c => !c)}
          title={leftCollapsed ? 'Expand tools' : 'Collapse tools'}
        >
          <Icon name="chevron_right" size={12} style={{ transform: leftCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 300ms ease' }} />
        </button>
        <div style={{ marginBottom: 18 }}>
          <button className="v-btn v-btn--ghost v-btn--sm" style={{ padding: '6px 10px' }} onClick={() => setPage('projects')}>
            <Icon name="chevron_right" size={11} color="var(--graphite)" style={{ transform: 'rotate(180deg)' }} /> Back
          </button>
          <div className="v-editor-breadcrumb" style={{ marginTop: 8 }}>
            {activeProject ? activeProject.address : 'Quick edit'} · {photoCount} photo{photoCount !== 1 ? 's' : ''} · {refinedCount} refined
          </div>
          <h2 className="v-editor-title">{activeProject ? activeProject.address.split(' ').slice(-2).join(' ') : 'Photo refinement'}</h2>
        </div>

        {TOOLS.map((t, i) => {
          if ('section' in t && !('id' in t)) {
            return <div key={'s' + i} className="v-section-label">{t.section}</div>;
          }
          if (!('id' in t)) return null;
          const tool = t as { id: string; icon: string; name: string; desc: string; cost: string };
          const exteriorOnly = ['twilight', 'sky', 'lawn'].includes(tool.id);
          const interiorOnly = ['staging', 'whiten'].includes(tool.id);
          const photoIsExterior = currentPhoto ? isExteriorRoom(currentPhoto.label) : false;
          const disabled = (exteriorOnly && !photoIsExterior) || (interiorOnly && photoIsExterior);
          return (
            <div
              key={tool.id}
              className={'v-tool-item' + (activeTool === tool.id ? ' active' : '') + (disabled ? ' disabled' : '')}
              onClick={() => !disabled && setActiveTool(tool.id)}
              title={disabled ? (exteriorOnly ? 'Exterior photos only' : 'Interior photos only') : undefined}
              style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              <div className="v-tool-icon"><Icon name={tool.icon} size={16} /></div>
              <div className="v-tool-body">
                <div className="v-tool-name">{tool.name}</div>
                <div className="v-tool-desc">{disabled ? (exteriorOnly ? 'Exterior only' : 'Interior only') : tool.desc}</div>
              </div>
              <div className="v-tool-cost">{tool.cost}</div>
            </div>
          );
        })}
      </div>

      <div className="v-editor-center">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div className="v-subtabs">
            <button className={'v-subtab' + (view === 'compare' ? ' active' : '')} onClick={() => setView('compare')}>
              <Icon name="layers" size={12} /> Before / After
            </button>
            <button className={'v-subtab' + (view === 'grid' ? ' active' : '')} onClick={() => setView('grid')}>
              <Icon name="image" size={12} /> Photo grid
            </button>
            <button className={'v-subtab' + (view === 'single' ? ' active' : '')} onClick={() => { setView('single'); setSinglePhoto(selectedPhoto); }}>
              <Icon name="armchair" size={12} /> Single photo
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {generatingCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--brand-accent-dark)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="v-gen-spinner" />
                {generatingCount} processing
              </span>
            )}
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={12} /> Add photos
            </button>
            {photoCount > 1 && (
              <button
                className="v-btn v-btn--secondary v-btn--sm"
                onClick={handleApplyAll}
                disabled={applyAllCount === 0}
              >
                Apply to all ({applyAllCount}) · {applyAllCost} cr
              </button>
            )}
            <button
              className="v-btn v-btn--primary v-btn--sm"
              onClick={handleApply}
              disabled={!photos.length || (currentPhoto ? isPhotoGenerating(currentPhoto.id) : false)}
            >
              {currentIsGenerating ? (
                <><span className="v-gen-spinner" /> Refining…</>
              ) : (
                <>Apply · {TOOL_COST[activeTool]} cr <Icon name="arrow_right" size={12} /></>
              )}
            </button>
          </div>
        </div>

        {view === 'compare' && renderCompare()}
        {view === 'grid' && renderGrid()}
        {view === 'single' && renderSingle()}

        {currentPhoto && (
          <div className="v-control-card">
            <div className="v-control-head">
              <div className="v-control-ttl">
                <span className="v-gold-rule" />
                {toolName}
              </div>
              <span className="v-muted" style={{ fontSize: 12 }}>
                {view === 'single' ? `Photo ${(singlePhoto ?? selectedPhoto) + 1}` : `Photo ${selectedPhoto + 1}`} · {currentPhoto.label}
              </span>
            </div>

            {activeTool === 'twilight' ? (
              <>
                <div className="v-field">
                  <span className="v-field-label">Color style</span>
                  <div className="v-preset-row">
                    {(PRESETS.twilight_style || []).map(p => (
                      <button key={p} className={'v-preset' + (stylePreset === p.toLowerCase() ? ' active' : '')} onClick={() => setStylePreset(p.toLowerCase())}>{p}</button>
                    ))}
                  </div>
                </div>
                <div className="v-field" style={{ marginTop: 4 }}>
                  <span className="v-field-label">Time of day</span>
                  <div className="v-preset-row">
                    {(PRESETS.twilight_time || []).map(p => {
                      const val = p.toLowerCase().replace(/ /g, '-') as TwilightTime;
                      return (
                        <button key={p} className={'v-preset' + (twilightTime === val ? ' active' : '')} onClick={() => setTwilightTime(val)}>{p}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="v-field">
                <span className="v-field-label">Style preset</span>
                <div className="v-preset-row">
                  {(PRESETS[activeTool === 'declutter' && isExteriorRoom(currentPhoto.label) ? 'declutter_ext' : activeTool] || []).map(p => (
                    <button key={p} className={'v-preset' + (stylePreset === p.toLowerCase() ? ' active' : '')} onClick={() => setStylePreset(p.toLowerCase())}>{p}</button>
                  ))}
                </div>
              </div>
            )}

            {activeTool === 'declutter' && (
              <div className="v-field" style={{ marginTop: 4 }}>
                <span className="v-field-label">Specific items to remove</span>
                <input
                  className="v-set-input"
                  placeholder="e.g. blue tarp on porch, exercise bike in corner"
                  value={customRemoval}
                  onChange={(e) => setCustomRemoval(e.target.value)}
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>
            )}

            <div className="v-field-row">
              <div className="v-field">
                <span className="v-field-label">Room type</span>
                <div className="v-field-value">
                  {editingLabel ? (
                    <select
                      className="v-set-input"
                      value={currentPhoto.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        const photoId = view === 'single' ? (photos[singlePhoto ?? selectedPhoto]?.id ?? currentPhoto.id) : currentPhoto.id;
                        setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, label: val, detecting: false } : p));
                        setEditingLabel(false);
                      }}
                      onBlur={() => setEditingLabel(false)}
                      autoFocus
                      style={{ width: '100%', fontSize: 12 }}
                    >
                      {ROOM_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span
                      onClick={() => setEditingLabel(true)}
                      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--graphite)' }}
                      title="Click to change room type"
                    >
                      {currentPhoto.detecting ? 'Detecting…' : currentPhoto.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={'v-editor-right' + (rightCollapsed ? ' collapsed' : '')}>
        <button
          className="v-panel-toggle v-panel-toggle--right"
          onClick={() => setRightCollapsed(c => !c)}
          title={rightCollapsed ? 'Expand details' : 'Collapse details'}
        >
          <Icon name="chevron_right" size={12} style={{ transform: rightCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 300ms ease' }} />
        </button>

        <div className="v-rp-section">
          <h4>Batch</h4>
          <div className="v-rp-row"><span className="v-rp-l">Photos uploaded</span><span className="v-rp-v">{photoCount}</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Refined</span><span className="v-rp-v">{refinedCount}</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Pending</span><span className="v-rp-v">{unrefinedCount}</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Processing</span><span className="v-rp-v" style={generatingCount > 0 ? { color: 'var(--brand-accent-dark)', fontWeight: 600 } : {}}>{generatingCount}</span></div>
          {batchMode && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(batchDone / batchTotal) * 100}%`, height: '100%', background: 'var(--pale-gold)', transition: 'width 300ms ease' }} />
              </div>
              <div className="v-muted" style={{ fontSize: 11, marginTop: 6 }}>Batch: {batchDone} of {batchTotal} complete</div>
            </div>
          )}
        </div>

        <div className="v-rp-section">
          <h4>Edit history · {currentPhoto?.label}</h4>
          {(() => {
            const history = currentPhoto ? (photoHistory[currentPhoto.id] || []) : [];
            if (history.length === 0) return (
              <div className="v-muted" style={{ fontSize: 12, padding: '8px 0' }}>No edits yet — apply a tool to start.</div>
            );
            const toolNames: Record<string, string> = { staging: 'Staging', declutter: 'Declutter', whiten: 'White balance', twilight: 'Twilight', sky: 'Sky', lawn: 'Lawn' };
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {history.map((h, i) => (
                    <div key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--pale-gold)', color: 'var(--deep-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontWeight: 500 }}>{toolNames[h.tool] || h.tool}</span>
                      <span className="v-muted">· {h.preset}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="v-btn v-btn--ghost v-btn--sm" style={{ fontSize: 11 }} onClick={handleUndo} disabled={currentIsGenerating}>
                    Undo last
                  </button>
                  <button className="v-btn v-btn--ghost v-btn--sm" style={{ fontSize: 11 }} onClick={handleReset} disabled={currentIsGenerating}>
                    Reset to original
                  </button>
                </div>
              </>
            );
          })()}
        </div>

        <div className="v-rp-section">
          <h4>Export</h4>

          {/* ── Progress tracker (shown during export) ── */}
          {exporting && exportProgress && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${(exportProgress.done / exportProgress.total) * 100}%`,
                  height: '100%', background: 'var(--pale-gold)',
                  transition: 'width 400ms ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span className="v-muted" style={{ fontSize: 11 }}>
                  {exportProgress.done} of {exportProgress.total} upscaled
                </span>
                <span className="v-muted" style={{ fontSize: 11 }}>
                  {(() => {
                    if (exportProgress.done === 0) return 'Estimating…';
                    const elapsed = (Date.now() - exportProgress.startedAt) / 1000;
                    const perPhoto = elapsed / exportProgress.done;
                    const remaining = Math.ceil(perPhoto * (exportProgress.total - exportProgress.done));
                    if (remaining <= 0) return 'Finishing…';
                    return remaining < 60 ? `~${remaining}s left` : `~${Math.ceil(remaining / 60)}m left`;
                  })()}
                </span>
              </div>

              {exportProgress.total > 1 && (
                <div style={{
                  marginTop: 8, maxHeight: 120, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {exportProgress.items.map(it => (
                    <div key={it.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                      padding: '3px 0',
                      opacity: it.status === 'queued' ? 0.4 : 1,
                    }}>
                      {it.status === 'done' && (
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(76,175,80,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, color: '#fff' }}>✓</span>
                      )}
                      {it.status === 'upscaling' && (
                        <span className="v-gen-spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
                      )}
                      {it.status === 'queued' && (
                        <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--soft-stone)', flexShrink: 0 }} />
                      )}
                      {it.status === 'failed' && (
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,55,95,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, color: '#fff' }}>✕</span>
                      )}
                      <span style={{ color: it.status === 'upscaling' ? 'var(--warm-ivory)' : 'var(--graphite)', fontWeight: it.status === 'upscaling' ? 500 : 400 }}>
                        {it.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Export buttons (hidden during export) ── */}
          {!exporting && (
            <div className="v-export-list">
              {/* Refined exports */}
              {refinedCount > 0 && (
                <button
                  className="v-export-btn gold"
                  onClick={doDownloadAll}
                >
                  <Icon name="download" size={13} />
                  {refinedCount > 1
                    ? `Download all ${refinedCount} refined`
                    : 'Download refined photo'}
                  <span className="v-export-meta">{refinedCount > 1 ? '.zip' : '.jpg'}</span>
                </button>
              )}
              {view !== 'grid' && currentPhoto && processedResults[currentPhoto.id] && (
                <button className="v-export-btn" onClick={() => doDownloadSingle(currentPhotoIdx)}>
                  <Icon name="download" size={13} />
                  Download this photo
                  <span className="v-export-meta">.jpg · {currentPhoto.label}</span>
                </button>
              )}

              {/* Original (upscale-only) exports */}
              {view !== 'grid' && currentPhoto && !processedResults[currentPhoto.id] && (
                <button
                  className="v-export-btn"
                  onClick={() => setExportConfirm('single')}
                >
                  <Icon name="upload" size={13} />
                  Export this photo
                  <span className="v-export-meta">upscale only · {currentPhoto.label}</span>
                </button>
              )}
              {(() => {
                const uneditedCount = photos.filter(p => !processedResults[p.id]).length;
                if (uneditedCount === 0) return null;
                return (
                  <button
                    className="v-export-btn"
                    onClick={() => setExportConfirm('batch')}
                  >
                    <Icon name="upload" size={13} />
                    Export {uneditedCount === photoCount ? 'all' : uneditedCount} original{uneditedCount !== 1 ? 's' : ''}
                    <span className="v-export-meta">upscale only · {uneditedCount > 1 ? '.zip' : '.jpg'}</span>
                  </button>
                );
              })()}
            </div>
          )}

          {/* Inline confirmation for upscale-only export */}
          {exportConfirm && !exporting && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 6,
              background: 'rgba(216,199,154,0.08)', border: '1px solid rgba(216,199,154,0.2)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--warm-ivory)' }}>
                Upscale only — no AI edits
              </div>
              <div style={{ fontSize: 11, color: 'var(--graphite)', lineHeight: 1.5, marginBottom: 10 }}>
                {exportConfirm === 'single'
                  ? `This photo will be upscaled to full resolution without any AI edits applied. ${isExteriorRoom(currentPhoto?.label || '') ? 'Exterior upscale takes ~14s.' : 'Interior upscale takes ~1s.'}`
                  : `${photos.filter(p => !processedResults[p.id]).length} photo${photos.filter(p => !processedResults[p.id]).length !== 1 ? 's' : ''} will be upscaled to full resolution without any AI edits applied.`
                }
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="v-btn v-btn--primary v-btn--sm"
                  style={{ fontSize: 11 }}
                  onClick={() => exportConfirm === 'single' ? doExportOriginalSingle(currentPhotoIdx) : doExportOriginalBatch()}
                >
                  Export
                </button>
                <button
                  className="v-btn v-btn--ghost v-btn--sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setExportConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {exportError && (
            <div className="v-gate-note" style={{ color: 'var(--state-error)' }}>
              <Icon name="sparkles" size={11} />
              {exportError}
            </div>
          )}
          {!refinedCount && !exportConfirm && !exporting && !exportError && photoCount > 0 && (
            <div className="v-gate-note">
              <Icon name="sparkles" size={11} />
              Export originals with upscale, or apply a tool first for AI-enhanced results.
            </div>
          )}
        </div>

        <div className="v-rp-section" style={{ borderBottom: 0 }}>
          <h4>Activity</h4>
          {activity.length === 0 && (
            <div className="v-muted" style={{ fontSize: 12, padding: '8px 0' }}>No activity yet — upload photos to get started.</div>
          )}
          {activity.map((a, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--soft-stone)' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{a.what}</div>
              <div className="v-muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>{a.who} · {a.when}</span>
                {a.cost ? <span style={{ color: 'var(--pale-gold)', fontWeight: 600 }}>−{a.cost} cr</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Room type picker modal — shown after uploading photos */}
      {showRoomPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(27,29,31,0.6)', backdropFilter: 'blur(4px)',
          display: 'grid', placeItems: 'center',
        }} onClick={() => setShowRoomPicker(false)}>
          <div
            style={{
              background: 'var(--background-elevated)', borderRadius: 16,
              padding: '24px 28px', maxWidth: 600, width: '90%',
              maxHeight: '80vh', overflow: 'auto',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-light)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tag room types</h3>
              <button
                className="v-btn v-btn--primary v-btn--sm"
                onClick={() => setShowRoomPicker(false)}
              >
                Done
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--graphite)', margin: '0 0 16px' }}>
              Setting the room type improves cleanup prompts and enables exterior-specific tools.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {photos.map(p => (
                <div key={p.id} style={{
                  borderRadius: 10, overflow: 'hidden',
                  border: '1px solid var(--border-light)', background: 'var(--background-secondary)',
                }}>
                  <div style={{
                    aspectRatio: '4/3',
                    backgroundImage: `url(${p.dataUrl})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  }} />
                  <div style={{ padding: '6px 8px' }}>
                    <select
                      value={p.label}
                      onChange={e => {
                        const val = e.target.value;
                        setPhotos(prev => prev.map(ph => ph.id === p.id ? { ...ph, label: val, detecting: false } : ph));
                        if (activeProject?.id) idbSavePhoto(activeProject.id, p.id, p.dataUrl, val, p.file.name).catch(() => {});
                      }}
                      style={{
                        width: '100%', fontSize: 12, padding: '4px 6px',
                        border: '1px solid var(--border-light)', borderRadius: 6,
                        background: 'var(--background-elevated)', color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {ROOM_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {samModal && (
        <ClutterMaskSelector
          imageBase64={samModal.image}
          individualMasks={samModal.masks}
          onConfirm={(indices) => {
            samModal.resolver(indices);
            setSamModal(null);
          }}
          onCancel={() => {
            samModal.resolver(null);
            setSamModal(null);
          }}
        />
      )}
    </div>
  );
};

export default VellumPhotoEditor;
