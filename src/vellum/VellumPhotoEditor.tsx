import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import { generateRoomDesign, detectRoomType } from '../../services/geminiService';
import { fluxCleanup } from '../../services/fluxService';
import { fluxTwilight, TwilightStyle } from '../../services/twilightService';
import { nanoSky, SkyStyle } from '../../services/skyService';
import { upscaleImage } from '../../services/upscaleService';
import { isExteriorRoom } from '../../services/fluxService';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
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
  staging: ['Contemporary', 'Mid-century', 'Coastal', 'Farmhouse', 'Scandinavian', 'Minimalist'],
  declutter: ['Full clean', 'Personal items only', 'Surface clutter only'],
  whiten: ['Bright & airy', 'Warm editorial', 'Neutral'],
  twilight: ['Golden hour', 'Blue hour', 'After sunset'],
  sky: ['Clear blue', 'Golden hour', 'Soft overcast', 'Dramatic'],
  lawn: ['Manicured', 'Natural', 'Drought-resistant'],
};

const DECLUTTER_FILTER_MAP: Record<string, string | undefined> = {
  'full clean': 'fullclean',
  'personal items only': 'personal',
  'surface clutter only': 'surfaces',
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
  activeProject?: { id: string; address: string; city: string; propertyType: string; beds: number | null; baths: number | null } | null;
  updateProject?: (id: string, partial: Record<string, any>) => void;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

const callApiDirect = async (
  imageBase64: string,
  roomLabel: string,
  tool: string,
  preset: string,
  customRemovalVal: string,
  signal: AbortSignal,
): Promise<string> => {
  const presetMap: Record<string, Record<string, string>> = {
    twilight: { 'golden hour': 'warm-classic', 'blue hour': 'modern-dramatic', 'after sunset': 'golden-luxury' },
    sky: { 'clear blue': 'blue', 'golden hour': 'golden', 'soft overcast': 'stormy', 'dramatic': 'dramatic' },
  };

  switch (tool) {
    case 'staging': {
      const prompt = `Virtually stage this ${roomLabel.toLowerCase()} with ${preset} style furniture. Professional real estate photography, warm editorial lighting, high-end finishes.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
    case 'declutter': {
      const filter = DECLUTTER_FILTER_MAP[preset] || undefined;
      const custom = customRemovalVal || undefined;
      const result = await fluxCleanup(imageBase64, roomLabel, signal, {
        filter, customRemoval: custom, skipUpscale: true,
      });
      return result.resultBase64;
    }
    case 'whiten': {
      const prompt = `Correct white balance and lighting on this ${roomLabel.toLowerCase()} photo. Make it ${preset}: even exposure, natural daylight, warm tones. Keep all furniture and architecture exactly as-is.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
    case 'twilight': {
      const mapped = presetMap.twilight[preset] || 'warm-classic';
      const result = await fluxTwilight(imageBase64, mapped as TwilightStyle, signal);
      return result.resultBase64;
    }
    case 'sky': {
      const mapped = presetMap.sky[preset] || 'blue';
      const result = await nanoSky(imageBase64, mapped as SkyStyle, signal);
      return result.resultBase64;
    }
    case 'lawn': {
      const prompt = `Enhance the lawn and landscaping of this exterior photo. Make the grass ${preset}, green, and manicured. Keep the house, driveway, sky, and all architecture exactly unchanged.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
    default:
      return imageBase64;
  }
};

const VellumPhotoEditor: React.FC<PhotoEditorProps> = ({ setPage, credits, requestSpend, activeProject, updateProject }) => {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [activity, setActivity] = useState<{ who: string; what: string; cost: number; when: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const nextId = useRef(0);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!activeProject?.id || restoredRef.current) return;
    restoredRef.current = true;
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
      const dataUrl = await readFileAsDataUrl(file);
      const id = nextId.current++;
      const label = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      newPhotos.push({ id, file, dataUrl, label, detecting: true });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    setActivity(a => [{ who: 'You', what: `Uploaded ${newPhotos.length} photo${newPhotos.length > 1 ? 's' : ''}`, cost: 0, when: 'just now' }, ...a]);

    for (const p of newPhotos) {
      try {
        const roomType = await detectRoomType(p.dataUrl);
        const finalLabel = roomType || p.label;
        setPhotos(prev => prev.map(ph => ph.id === p.id ? { ...ph, label: finalLabel, detecting: false } : ph));
        if (activeProject?.id) idbSavePhoto(activeProject.id, p.id, p.dataUrl, finalLabel, p.file.name).catch(() => {});
      } catch {
        setPhotos(prev => prev.map(ph => ph.id === p.id ? { ...ph, detecting: false } : ph));
        if (activeProject?.id) idbSavePhoto(activeProject.id, p.id, p.dataUrl, p.label, p.file.name).catch(() => {});
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const [activeTool, setActiveToolRaw] = useState('staging');
  const [stylePreset, setStylePreset] = useState('contemporary');
  const [customRemoval, setCustomRemoval] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const setActiveTool = (tool: string) => {
    setActiveToolRaw(tool);
    const firstPreset = (PRESETS[tool] || [])[0];
    if (firstPreset) setStylePreset(firstPreset.toLowerCase());
    setCustomRemoval('');
  };
  const [view, setView] = useState<'compare' | 'grid' | 'single'>('compare');
  const [singlePhoto, setSinglePhoto] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);

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
      const resultDataUrl = await callApiDirect(inputImage, photo.label, tool, preset, customRemovalVal, controller.signal);

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

      if (err.name === 'AbortError') return false;
      console.error('[Vellum] Generation failed:', err);
      setActivity(a => [{
        who: 'Vellum',
        what: `Failed on ${photo.label} — ${err.message || 'unknown error'}`,
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
    const frozenPreset = stylePreset;
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
    const frozenPreset = stylePreset;
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
    (Object.values(genMap) as PhotoGenState[]).forEach(gs => {
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
    try {
      if (refined.length === 1) {
        setExportLabel(`Upscaling ${refined[0].label}…`);
        const upscaled = await upscaleForExport(processedResults[refined[0].id], refined[0].label);
        const blob = await dataUrlToBlob(upscaled);
        saveAs(blob, `${refined[0].label.replace(/\s+/g, '_')}_refined.jpg`);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < refined.length; i++) {
          const p = refined[i];
          setExportLabel(`Upscaling ${i + 1} of ${refined.length}… ${p.label}`);
          const upscaled = await upscaleForExport(processedResults[p.id], p.label);
          const blob = await dataUrlToBlob(upscaled);
          const name = `${String(i + 1).padStart(3, '0')}_${p.label.replace(/\s+/g, '_')}_refined.jpg`;
          zip.file(name, blob);
        }
        setExportLabel('Packaging zip…');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, 'vellum_export.zip');
      }
      setActivity(a => [{ who: 'Vellum', what: `Downloaded ${refined.length} refined photo${refined.length > 1 ? 's' : ''} (upscaled)`, cost: 0, when: 'just now' }, ...a]);
    } catch (err: any) {
      console.error('[Vellum] Export failed:', err);
    }
    setExporting(false);
    setExportLabel('');
  };

  const doDownloadSingle = async (idx: number) => {
    const photo = photos[idx];
    if (!photo) return;
    const src = processedResults[photo.id];
    if (!src) return;
    setExporting(true);
    setExportLabel(`Upscaling ${photo.label}…`);
    try {
      const upscaled = await upscaleForExport(src, photo.label);
      const blob = await dataUrlToBlob(upscaled);
      saveAs(blob, `${photo.label.replace(/\s+/g, '_')}_refined.jpg`);
    } catch (err: any) {
      console.error('[Vellum] Single export failed:', err);
    }
    setExporting(false);
    setExportLabel('');
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

        {TOOLS.map((t, i) => 'section' in t && !('id' in t) ? (
          <div key={'s' + i} className="v-section-label">{t.section}</div>
        ) : 'id' in t ? (
          <div key={(t as any).id} className={'v-tool-item' + (activeTool === (t as any).id ? ' active' : '')} onClick={() => setActiveTool((t as any).id)}>
            <div className="v-tool-icon"><Icon name={(t as any).icon} size={16} /></div>
            <div className="v-tool-body">
              <div className="v-tool-name">{(t as any).name}</div>
              <div className="v-tool-desc">{(t as any).desc}</div>
            </div>
            <div className="v-tool-cost">{(t as any).cost}</div>
          </div>
        ) : null)}
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
              >
                Apply to all ({photoCount}) · {Math.round(TOOL_COST[activeTool] * photoCount)} cr
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

            <div className="v-field">
              <span className="v-field-label">Style preset</span>
              <div className="v-preset-row">
                {(PRESETS[activeTool] || []).map(p => (
                  <button key={p} className={'v-preset' + (stylePreset === p.toLowerCase() ? ' active' : '')} onClick={() => setStylePreset(p.toLowerCase())}>{p}</button>
                ))}
              </div>
            </div>

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
          <div className="v-export-list">
            <button
              className="v-export-btn gold"
              onClick={doDownloadAll}
              disabled={!refinedCount || exporting}
            >
              <Icon name="download" size={13} />
              {exporting && exportLabel
                ? exportLabel
                : refinedCount > 1
                  ? `Download all ${refinedCount} refined`
                  : 'Download refined photo'}
              <span className="v-export-meta">{exporting ? 'upscaling…' : refinedCount > 1 ? '.zip' : '.jpg'}</span>
            </button>
            {view !== 'grid' && currentPhoto && processedResults[currentPhoto.id] && (
              <button className="v-export-btn" onClick={() => doDownloadSingle(currentPhotoIdx)}>
                <Icon name="download" size={13} />
                Download this photo
                <span className="v-export-meta">.jpg · {currentPhoto.label}</span>
              </button>
            )}
          </div>
          {!refinedCount && (
            <div className="v-gate-note">
              <Icon name="sparkles" size={11} />
              Apply a tool to your photos first, then export the results here.
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
    </div>
  );
};

export default VellumPhotoEditor;
