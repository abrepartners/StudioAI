import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import { generateRoomDesign, instantDeclutter } from '../../services/geminiService';
import { fluxCleanup } from '../../services/fluxService';
import { fluxTwilight, TwilightStyle } from '../../services/twilightService';
import { nanoSky, SkyStyle } from '../../services/skyService';

const SAMPLE_PHOTOS = [
  { id: 1, before: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80', after: 'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=1600&q=80', label: 'Living room' },
  { id: 2, before: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80', after: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80', label: 'Kitchen' },
  { id: 3, before: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1600&q=80', after: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80', label: 'Bedroom' },
  { id: 4, before: 'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1600&q=80', after: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80', label: 'Exterior' },
];

const ALL_PHOTOS = [...SAMPLE_PHOTOS, ...SAMPLE_PHOTOS, ...SAMPLE_PHOTOS].slice(0, 12).map((p, i) => ({
  ...p,
  id: i,
  label: p.label + (i >= SAMPLE_PHOTOS.length ? ` (${i + 1})` : ''),
}));

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
  declutter: ['Personal items', 'Cables & cords', 'Toys', 'Bathroom items', 'All of the above'],
  whiten: ['Bright & airy', 'Warm editorial', 'Neutral'],
  twilight: ['Golden hour', 'Blue hour', 'After sunset'],
  sky: ['Clear blue', 'Golden hour', 'Soft overcast', 'Dramatic'],
  lawn: ['Manicured', 'Natural', 'Drought-resistant'],
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

interface PhotoEditorProps {
  setPage: (p: string) => void;
  credits: number;
  requestSpend: (amount: number, after?: (res: any) => void) => boolean;
}

const VellumPhotoEditor: React.FC<PhotoEditorProps> = ({ setPage, credits, requestSpend }) => {
  const [activity, setActivity] = useState([
    { who: 'Vellum', what: 'Twilight applied to 6 exteriors', cost: 12, when: '2m ago' },
    { who: 'You', what: 'Switched preset to Contemporary', cost: 0, when: '8m ago' },
    { who: 'Vellum', what: '24 photos imported from MLS', cost: 0, when: '14m ago' },
  ]);

  const doExport = (label: string, cost: number, dest: string) => {
    const charge = (res: any) => {
      setActivity(a => [{ who: 'Vellum', what: `${label} → ${dest}`, cost: res.charged, when: 'just now' }, ...a]);
    };
    requestSpend(cost, charge);
  };

  const [activeTool, setActiveTool] = useState('staging');
  const [stylePreset, setStylePreset] = useState('contemporary');
  const [intensity, setIntensity] = useState(0.7);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [view, setView] = useState<'compare' | 'grid' | 'single'>('compare');
  const [singlePhoto, setSinglePhoto] = useState<number | null>(null);

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

  const photo = ALL_PHOTOS[selectedPhoto];
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genProgress, setGenProgress] = useState(0);
  const [processedSet, setProcessedSet] = useState<Set<number>>(new Set([0]));
  const genRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalCost = Math.round(TOOL_COST[activeTool] * SAMPLE_PHOTOS.length);
  const abortRef = useRef<AbortController | null>(null);
  const [processedResults, setProcessedResults] = useState<Record<number, string>>({});

  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const callApi = async (imageBase64: string, roomLabel: string, signal: AbortSignal): Promise<string> => {
    const presetMap: Record<string, Record<string, string>> = {
      twilight: { 'golden hour': 'warm-classic', 'blue hour': 'modern-dramatic', 'after sunset': 'golden-luxury' },
      sky: { 'clear blue': 'blue', 'golden hour': 'golden', 'soft overcast': 'stormy', 'dramatic': 'dramatic' },
    };

    switch (activeTool) {
      case 'staging': {
        const prompt = `Virtually stage this ${roomLabel.toLowerCase()} with ${stylePreset} style furniture. Professional real estate photography, warm editorial lighting, high-end finishes.`;
        const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
        return results[0] || imageBase64;
      }
      case 'declutter': {
        const result = await fluxCleanup(imageBase64, roomLabel, signal);
        return `data:image/jpeg;base64,${result.resultBase64}`;
      }
      case 'whiten': {
        const prompt = `Correct white balance and lighting on this ${roomLabel.toLowerCase()} photo. Make it ${stylePreset}: even exposure, natural daylight, warm tones. Keep all furniture and architecture exactly as-is.`;
        const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
        return results[0] || imageBase64;
      }
      case 'twilight': {
        const mapped = presetMap.twilight[stylePreset] || 'warm-classic';
        const result = await fluxTwilight(imageBase64, mapped as TwilightStyle, signal);
        return `data:image/jpeg;base64,${result.resultBase64}`;
      }
      case 'sky': {
        const mapped = presetMap.sky[stylePreset] || 'blue';
        const result = await nanoSky(imageBase64, mapped as SkyStyle, signal);
        return `data:image/jpeg;base64,${result.resultBase64}`;
      }
      case 'lawn': {
        const prompt = `Enhance the lawn and landscaping of this exterior photo. Make the grass ${stylePreset}, green, and manicured. Keep the house, driveway, sky, and all architecture exactly unchanged.`;
        const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
        return results[0] || imageBase64;
      }
      default:
        return imageBase64;
    }
  };

  const startProgressAnimation = () => {
    setGenStep(0);
    setGenProgress(0);
    const steps = TOOL_STEPS[activeTool] || TOOL_STEPS.staging;
    let step = 0;
    let prog = 0;
    const tick = () => {
      prog += 1.5 + Math.random() * 2;
      const capped = Math.min(prog, 90);
      setGenProgress(capped);
      const expectedStep = Math.floor((capped / 100) * (steps.length - 1));
      if (expectedStep !== step) { step = expectedStep; setGenStep(step); }
      if (prog < 90) {
        genRef.current = setTimeout(tick, 200 + Math.random() * 300);
      }
    };
    genRef.current = setTimeout(tick, 200);
  };

  const handleApply = () => {
    if (generating) return;
    const doGenerate = async () => {
      setGenerating(true);
      startProgressAnimation();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const photoIdx = view === 'single' ? (singlePhoto ?? selectedPhoto) : 0;
        const photo = ALL_PHOTOS[photoIdx];
        const imageBase64 = await fetchImageAsBase64(photo.before);
        const resultDataUrl = await callApi(imageBase64, photo.label, controller.signal);

        if (genRef.current) clearTimeout(genRef.current);
        setGenProgress(100);
        setGenStep((TOOL_STEPS[activeTool] || TOOL_STEPS.staging).length - 1);

        const newResults = { ...processedResults };
        if (view === 'single') {
          newResults[photoIdx] = resultDataUrl;
          setProcessedSet(prev => new Set([...prev, photoIdx % SAMPLE_PHOTOS.length]));
        } else {
          newResults[photoIdx] = resultDataUrl;
          setProcessedSet(new Set(SAMPLE_PHOTOS.map((_, i) => i)));
        }
        setProcessedResults(newResults);

        setTimeout(() => {
          setGenerating(false);
          setGenProgress(0);
          setGenStep(0);
          const tool = TOOLS.find(t => 'id' in t && t.id === activeTool);
          setActivity(a => [{
            who: 'Vellum',
            what: `${(tool as any)?.name} applied${view === 'single' ? ' to 1 photo' : ` to ${SAMPLE_PHOTOS.length} photos`} · ${stylePreset}`,
            cost: view === 'single' ? TOOL_COST[activeTool] : totalCost,
            when: 'just now',
          }, ...a]);
        }, 600);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('[Vellum] Generation failed:', err);
        if (genRef.current) clearTimeout(genRef.current);
        setGenerating(false);
        setGenProgress(0);
        setGenStep(0);
        setActivity(a => [{
          who: 'Vellum',
          what: `Generation failed — ${err.message || 'unknown error'}`,
          cost: 0,
          when: 'just now',
        }, ...a]);
      }
    };

    const cost = view === 'single' ? TOOL_COST[activeTool] : totalCost;
    requestSpend(cost, doGenerate);
  };

  useEffect(() => () => {
    if (genRef.current) clearTimeout(genRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const getAfterImage = (idx: number) => processedResults[idx] || ALL_PHOTOS[idx].after;

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const renderCompare = () => (
    <>
      <div
        className="v-ba-stage"
        ref={stageRef}
        onMouseDown={!generating ? onPointerDown : undefined}
        onTouchStart={!generating ? onPointerDown : undefined}
        style={{ cursor: generating ? 'default' : undefined }}
      >
        <div className="v-ba-img" style={{ backgroundImage: `url(${photo.before})` }} />
        <div className="v-ba-clip" style={{ width: `${splitPos}%` }}>
          <div className="v-ba-img" style={{ backgroundImage: `url(${getAfterImage(selectedPhoto)})`, width: `${100 / (splitPos / 100)}%` }} />
        </div>
        <div className="v-ba-tag b">Before</div>
        <div className="v-ba-tag a">After · {ALL_PHOTOS[selectedPhoto].label}</div>
        {!generating && (
          <div className="v-ba-handle" style={{ left: `${splitPos}%` }}>
            <div className="v-ba-knob">‹›</div>
          </div>
        )}
        {generating && (
          <div className="v-gen-overlay">
            <div className="v-gen-panel">
              <div className="v-gen-eye">
                <div className="v-gen-pulse" />
                <Icon name="sparkles" size={18} />
              </div>
              <div className="v-gen-label">
                {(TOOL_STEPS[activeTool] || TOOL_STEPS.staging)[genStep]}
              </div>
              <div className="v-gen-sub">
                {TOOLS.find(t => 'id' in t && t.id === activeTool && 'name' in t)
                  ? (TOOLS.find(t => 'id' in t && t.id === activeTool) as any).name
                  : 'Processing'} · {stylePreset} · {SAMPLE_PHOTOS.length} photos
              </div>
              <div className="v-gen-bar-track">
                <div className="v-gen-bar-fill" style={{ width: `${genProgress}%` }} />
              </div>
              <div className="v-gen-pct">{Math.round(genProgress)}%</div>
            </div>
            <div className="v-gen-shimmer" />
          </div>
        )}
      </div>

      <div className="v-thumb-strip">
        {ALL_PHOTOS.map((p, i) => {
          const isRefined = processedSet.has(i % SAMPLE_PHOTOS.length);
          return (
            <div
              key={i}
              className={'v-t' + (selectedPhoto === i ? ' selected' : '') + (isRefined ? ' refined' : '')}
              style={{ backgroundImage: `url(${isRefined ? getAfterImage(i) : p.before})` }}
              onClick={() => setSelectedPhoto(i)}
              title={p.label}
            >
              <span className="v-num">{String(i + 1).padStart(2, '0')}</span>
              {isRefined && <span className="v-t-dot" />}
            </div>
          );
        })}
      </div>

      <div className="v-control-card">
        <div className="v-control-head">
          <div className="v-control-ttl">
            <span className="v-gold-rule" />
            {(TOOLS.find(t => 'id' in t && t.id === activeTool) as any)?.name}
          </div>
          <span className="v-muted" style={{ fontSize: 12 }}>Applies to all 24 photos in batch</span>
        </div>

        <div className="v-field">
          <span className="v-field-label">Style preset</span>
          <div className="v-preset-row">
            {(PRESETS[activeTool] || []).map(p => (
              <button key={p} className={'v-preset' + (stylePreset === p.toLowerCase() ? ' active' : '')} onClick={() => setStylePreset(p.toLowerCase())}>{p}</button>
            ))}
          </div>
        </div>

        <div className="v-field-row">
          <div className="v-field">
            <span className="v-field-label">Intensity</span>
            <div className="v-slider-track" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setIntensity(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
            }}>
              <div className="v-slider-fill" style={{ width: `${intensity * 100}%` }} />
              <div className="v-slider-thumb" style={{ left: `${intensity * 100}%` }} />
            </div>
            <span className="v-muted" style={{ fontSize: 11 }}>{Math.round(intensity * 100)}%</span>
          </div>
          <div className="v-field">
            <span className="v-field-label">Apply to</span>
            <div className="v-field-value">
              <span>All living spaces</span>
              <Icon name="chevron_down" size={12} color="var(--graphite)" />
            </div>
          </div>
          <div className="v-field">
            <span className="v-field-label">Output quality</span>
            <div className="v-field-value">
              <span>Print · 4K</span>
              <Icon name="chevron_down" size={12} color="var(--graphite)" />
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderGrid = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {ALL_PHOTOS.map((p, i) => {
        const isProcessed = processedSet.has(i % SAMPLE_PHOTOS.length);
        return (
          <div
            key={i}
            onClick={() => { setSinglePhoto(i); setView('single'); }}
            style={{
              position: 'relative', aspectRatio: '4/3', borderRadius: 8,
              backgroundImage: `url(${isProcessed ? getAfterImage(i) : p.before})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              cursor: 'pointer', overflow: 'hidden',
              transition: 'transform 180ms ease, box-shadow 180ms ease',
            }}
          >
            <span style={{
              position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 600,
              background: 'rgba(247,246,242,0.95)', padding: '3px 8px', borderRadius: 3,
            }}>{String(i + 1).padStart(2, '0')}</span>
            {isProcessed ? (
              <span className="v-pill v-pill--ready" style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10 }}>
                <span className="dot" />Refined
              </span>
            ) : (
              <span style={{
                position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 500,
                background: 'rgba(27,29,31,0.5)', color: 'var(--warm-ivory)',
                padding: '3px 8px', borderRadius: 3,
              }}>Pending</span>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderSingle = () => {
    const sp = ALL_PHOTOS[singlePhoto ?? selectedPhoto];
    const spIdx = singlePhoto ?? selectedPhoto;
    const spProcessed = processedSet.has(spIdx % SAMPLE_PHOTOS.length);
    return (
      <div className="v-single-photo-view">
        <div className="v-single-nav">
          {ALL_PHOTOS.map((p, i) => (
            <button
              key={i}
              className={'v-single-thumb' + (spIdx === i ? ' active' : '') + (processedSet.has(i % SAMPLE_PHOTOS.length) ? ' refined' : '')}
              onClick={() => setSinglePhoto(i)}
              style={{ backgroundImage: `url(${getAfterImage(i)})` }}
            >
              <span className="v-single-num">{String(i + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <div
          className="v-single-canvas"
          ref={stageRef}
          onMouseDown={!generating ? onPointerDown : undefined}
          onTouchStart={!generating ? onPointerDown : undefined}
        >
          <div className="v-ba-img" style={{ backgroundImage: `url(${sp.before})` }} />
          <div className="v-ba-clip" style={{ width: `${splitPos}%` }}>
            <div className="v-ba-img" style={{ backgroundImage: `url(${getAfterImage(spIdx)})`, width: `${100 / (splitPos / 100)}%` }} />
          </div>
          <div className="v-ba-tag b">Before</div>
          <div className="v-ba-tag a">After · {sp.label}</div>
          {!generating && (
            <div className="v-ba-handle" style={{ left: `${splitPos}%` }}>
              <div className="v-ba-knob">‹›</div>
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 4,
            background: spProcessed ? 'rgba(76,175,80,0.9)' : 'rgba(27,29,31,0.6)',
            color: 'var(--warm-ivory)',
          }}>
            {spProcessed ? 'Refined' : 'Pending refinement'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={'v-editor' + (leftCollapsed ? ' left-collapsed' : '') + (rightCollapsed ? ' right-collapsed' : '')}>
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
            1247 Maple Ridge Drive · 24 photos
          </div>
          <h2 className="v-editor-title">Photo refinement</h2>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="v-btn v-btn--ghost v-btn--sm" disabled={generating}>Reset</button>
            <button className="v-btn v-btn--secondary v-btn--sm" disabled={generating}>Save draft</button>
            <button
              className={'v-btn v-btn--primary v-btn--sm' + (generating ? ' generating' : '')}
              onClick={handleApply}
              disabled={generating}
            >
              {generating ? (
                <><span className="v-gen-spinner" /> Processing…</>
              ) : view === 'single' ? (
                <>Apply this photo · {TOOL_COST[activeTool] || 1} cr <Icon name="arrow_right" size={12} /></>
              ) : (
                <>Apply all {SAMPLE_PHOTOS.length} · {totalCost} cr <Icon name="arrow_right" size={12} /></>
              )}
            </button>
          </div>
        </div>

        {view === 'compare' && renderCompare()}
        {view === 'grid' && renderGrid()}
        {view === 'single' && renderSingle()}
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
          <h4>Listing</h4>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, lineHeight: 1.15, marginBottom: 4 }}>
            1247 Maple Ridge Drive
          </div>
          <div className="v-muted" style={{ fontSize: 12 }}>Highland Park, IL · Single family · 4 bd · 3 ba</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <span className="v-pill v-pill--gold">MLS-ready</span>
            <span className="v-pill v-pill--ghost">$1.2M</span>
          </div>
        </div>

        <div className="v-rp-section">
          <h4>Edit summary</h4>
          <div className="v-rp-row"><span className="v-rp-l">Photos in batch</span><span className="v-rp-v">24</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Refinements queued</span><span className="v-rp-v">3</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Estimated credits</span><span className="v-rp-v">12.5</span></div>
          <div className="v-rp-row"><span className="v-rp-l">Processing time</span><span className="v-rp-v">~4 min</span></div>
        </div>

        <div className="v-rp-section">
          <h4>Export</h4>
          <div className="v-export-list">
            <button className="v-export-btn gold" onClick={() => doExport('MLS export · 24 photos', 12, 'Bright MLS')}>
              <Icon name="layers" size={13} />
              Send to MLS
              <span className="v-export-meta">12 cr · JPG · sRGB</span>
            </button>
            <button className="v-export-btn" onClick={() => doExport('Download · 24 photos', 12, '.zip')}>
              <Icon name="download" size={13} />
              Download all
              <span className="v-export-meta">12 cr · .zip</span>
            </button>
            <button className="v-export-btn" onClick={() => doExport('Social pack · 24 photos', 18, 'IG/FB/TikTok')}>
              <Icon name="image" size={13} />
              Social pack
              <span className="v-export-meta">18 cr · 3 sizes</span>
            </button>
            <button className="v-export-btn" onClick={() => doExport('Dropbox sync · 24 photos', 12, 'Dropbox')}>
              <Icon name="folder" size={13} />
              Send to Dropbox
              <span className="v-export-meta">12 cr · linked</span>
            </button>
          </div>
          {credits < 12 && (
            <div className="v-gate-note">
              <Icon name="sparkles" size={11} />
              Low balance — exports above {credits} cr will prompt a refill.
            </div>
          )}
        </div>

        <div className="v-rp-section" style={{ borderBottom: 0 }}>
          <h4>Activity</h4>
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
