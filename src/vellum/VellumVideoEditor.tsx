import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons';

interface VideoEditorProps {
  setPage: (p: string) => void;
  credits: number;
  requestSpend: (amount: number, after?: (res: any) => void) => boolean;
}

interface Scene {
  id: string;
  kind: 'intro' | 'photo' | 'endcard';
  title: string;
  dur: number;
  sub?: string;
  caption?: string;
  img?: string;
}

const INITIAL_SCENES: Scene[] = [
  { id: 's0', kind: 'intro', title: 'Title card', dur: 2.5, sub: 'Now showing' },
  { id: 's1', kind: 'photo', title: 'Exterior approach', dur: 3.5, caption: 'A timeless retreat', img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&q=80' },
  { id: 's2', kind: 'photo', title: 'Living room', dur: 4.0, caption: 'Light-filled living', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80' },
  { id: 's3', kind: 'photo', title: 'Chef kitchen', dur: 3.5, caption: 'Where the day begins', img: 'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=900&q=80' },
  { id: 's4', kind: 'photo', title: 'Primary suite', dur: 3.5, caption: 'A quiet retreat', img: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900&q=80' },
  { id: 's5', kind: 'photo', title: 'Spa bath', dur: 3.0, caption: 'Considered details', img: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=900&q=80' },
  { id: 's6', kind: 'photo', title: 'Garden views', dur: 3.0, caption: 'Indoor / outdoor', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80' },
  { id: 's7', kind: 'endcard', title: 'Signature card', dur: 3.0, sub: 'Inquiries' },
];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const VellumVideoEditor: React.FC<VideoEditorProps> = ({ setPage, credits, requestSpend }) => {
  const [aspect, setAspect] = useState('9_16');
  const [pace, setPace] = useState('medium');
  const [music, setMusic] = useState('still-water');
  const [endcard, setEndcard] = useState('signature');
  const [showLowerThirds, setShowLowerThirds] = useState(true);
  const [showVoiceover, setShowVoiceover] = useState(false);
  const [activeIdx, setActiveIdx] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const totalDur = scenes.reduce((s, x) => s + x.dur, 0);
  const dragIdRef = useRef<string | null>(null);

  const onDragStart = (id: string) => (e: React.DragEvent) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => { e.preventDefault(); setOverIdx(idx); };
  const onDragEnd = () => { dragIdRef.current = null; setOverIdx(null); };
  const onDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragIdRef.current;
    if (!id) return;
    setScenes(prev => {
      const from = prev.findIndex(s => s.id === id);
      if (from < 0) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      const insertAt = idx > from ? idx - 1 : idx;
      next.splice(insertAt, 0, m);
      return next;
    });
    onDragEnd();
  };

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      setScrub(s => {
        const next = s + dt;
        if (next >= totalDur) { setPlaying(false); return 0; }
        let acc = 0;
        for (let i = 0; i < scenes.length; i++) {
          acc += scenes[i].dur;
          if (next < acc) { setActiveIdx(i); break; }
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalDur, scenes]);

  const aspectStyle: React.CSSProperties = aspect === '9_16'
    ? { aspectRatio: '9/16', maxWidth: 320 }
    : aspect === '1_1'
    ? { aspectRatio: '1/1', maxWidth: 480 }
    : { aspectRatio: '16/9', maxWidth: 640 };

  const active = scenes[activeIdx] || scenes[0];

  return (
    <div className="v-screen v-video-editor">
      <div className="v-screen-head">
        <div>
          <div className="v-crumb">
            <a onClick={() => setPage('projects')}>Projects</a>
            <Icon name="chevron_right" size={11} /> 1247 Maple Ridge Drive
            <Icon name="chevron_right" size={11} /> <span>Listing reel</span>
          </div>
          <h1 className="v-display">Listing reel <em>·</em> Maple Ridge</h1>
          <div className="v-meta-row">
            <span><Icon name="play" size={11} /> {fmt(totalDur)}</span>
            <span className="v-dot-sep" />
            <span>{scenes.length} scenes</span>
            <span className="v-dot-sep" />
            <span>Auto-saved · just now</span>
          </div>
        </div>
        <div className="v-head-actions">
          <button className="v-btn v-btn--ghost" onClick={() => setPage('photo')}><Icon name="image" size={13} /> Switch to photos</button>
          <button className="v-btn v-btn--secondary">Save draft</button>
          <button className="v-btn v-btn--primary">Render reel <Icon name="arrow_right" size={13} /></button>
        </div>
      </div>

      <div className="v-video-grid">
        <div className="v-video-stage">
          <div className="v-preview-frame" style={aspectStyle}>
            {active.kind === 'intro' && (
              <div className="v-preview-card v-preview-intro">
                <div className="v-badge-line"><span className="v-line" /> NOW SHOWING <span className="v-line" /></div>
                <h2>1247 Maple Ridge Drive</h2>
                <div className="v-sub">Highland Park · 4 BD · 3.5 BA · 4,200 sf</div>
                <div className="v-brand-strip">VELLUM</div>
              </div>
            )}
            {active.kind === 'photo' && (
              <>
                <img src={active.img} alt={active.title} className="v-preview-img" />
                {showLowerThirds && (
                  <div className="v-lower-third">
                    <div className="v-lt-rule" />
                    <div className="v-lt-text">
                      <div className="v-lt-title">{active.caption}</div>
                      <div className="v-lt-meta">{active.title}</div>
                    </div>
                  </div>
                )}
              </>
            )}
            {active.kind === 'endcard' && (
              <div className="v-preview-card v-preview-end">
                <div className="v-end-mark">V</div>
                <h2 className="v-end-title">Inquiries</h2>
                <div className="v-end-row">Marisol Reyes · Atelier Realty</div>
                <div className="v-end-row dim">marisol@atelier.co · 312.555.0148</div>
              </div>
            )}
            <div className="v-aspect-badge">{aspect.replace('_', ':')}</div>
          </div>

          <div className="v-transport">
            <button className="v-play-btn" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={14} />
            </button>
            <div className="v-time">{fmt(scrub)}</div>
            <div className="v-scrub-track" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - r.left) / r.width;
              const t = Math.max(0, Math.min(totalDur, x * totalDur));
              setScrub(t);
              let acc = 0;
              for (let i = 0; i < scenes.length; i++) { acc += scenes[i].dur; if (t < acc) { setActiveIdx(i); break; } }
            }}>
              {scenes.map((s, i) => {
                const start = scenes.slice(0, i).reduce((a, x) => a + x.dur, 0);
                const w = (s.dur / totalDur) * 100;
                return <div key={s.id} className={'v-scrub-seg' + (i === activeIdx ? ' on' : '')} style={{ left: `${(start / totalDur) * 100}%`, width: `${w}%` }} />;
              })}
              <div className="v-scrub-head" style={{ left: `${(scrub / totalDur) * 100}%` }} />
            </div>
            <div className="v-time dim">{fmt(totalDur)}</div>
          </div>

          <div className="v-storyboard-head">
            <div>
              <div className="v-eyebrow">Storyboard</div>
              <div className="v-hint">Drag to reorder · click to edit · scenes auto-time to {music.replace('-', ' ')}</div>
            </div>
            <button className="v-btn v-btn--ghost v-btn--sm"><Icon name="plus" size={12} /> Add scene</button>
          </div>

          <div className="v-storyboard">
            {scenes.map((s, i) => (
              <React.Fragment key={s.id}>
                <div
                  className={'v-drop-slot' + (overIdx === i ? ' over' : '')}
                  onDragOver={onDragOver(i)}
                  onDrop={onDrop(i)}
                />
                <div
                  className={'v-sb-card' + (i === activeIdx ? ' active' : '') + (s.kind !== 'photo' ? ' v-sb-card--card' : '')}
                  draggable
                  onDragStart={onDragStart(s.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => { setActiveIdx(i); const start = scenes.slice(0, i).reduce((a, x) => a + x.dur, 0); setScrub(start); }}
                >
                  <div className="v-sb-grip"><Icon name="grip" size={14} /></div>
                  <div className="v-sb-thumb">
                    {s.kind === 'photo' && <img src={s.img} alt={s.title} />}
                    {s.kind === 'intro' && (
                      <div className="v-sb-card-mock">
                        <div className="v-mock-rule" />
                        <div className="v-mock-title">1247 Maple Ridge</div>
                        <div className="v-mock-sub">Now showing</div>
                      </div>
                    )}
                    {s.kind === 'endcard' && (
                      <div className="v-sb-card-mock">
                        <div className="v-mock-mark">V</div>
                        <div className="v-mock-sub">Inquiries</div>
                      </div>
                    )}
                  </div>
                  <div className="v-sb-meta">
                    <div className="v-sb-num">{String(i + 1).padStart(2, '0')}</div>
                    <div className="v-sb-title">{s.title}</div>
                    <div className="v-sb-dur">{s.dur.toFixed(1)}s</div>
                  </div>
                </div>
              </React.Fragment>
            ))}
            <div
              className={'v-drop-slot' + (overIdx === scenes.length ? ' over' : '')}
              onDragOver={onDragOver(scenes.length)}
              onDrop={onDrop(scenes.length)}
            />
          </div>
        </div>

        <aside className="v-video-rail">
          <div className="v-rail-section">
            <div className="v-rail-label">Format</div>
            <div className="v-aspect-row">
              {[
                { id: '9_16', label: '9:16', sub: 'Reels · TikTok', frame: { w: 18, h: 32 } },
                { id: '1_1', label: '1:1', sub: 'Instagram feed', frame: { w: 26, h: 26 } },
                { id: '16_9', label: '16:9', sub: 'YouTube · MLS', frame: { w: 32, h: 18 } },
              ].map(a => (
                <button key={a.id} className={'v-aspect-btn' + (aspect === a.id ? ' on' : '')} onClick={() => setAspect(a.id)}>
                  <div className="v-aspect-frame" style={{ width: a.frame.w, height: a.frame.h }} />
                  <div className="v-aspect-label">{a.label}</div>
                  <div className="v-aspect-sub">{a.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label">Pace</div>
            <div className="v-seg">
              {['gentle', 'medium', 'dynamic'].map(p => (
                <button key={p} className={'v-seg-btn' + (pace === p ? ' on' : '')} onClick={() => setPace(p)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label-row">
              <div className="v-rail-label">Music bed</div>
              <button className="v-btn v-btn--ghost v-btn--sm">Browse</button>
            </div>
            <div className="v-music-list">
              {[
                { id: 'still-water', name: 'Still Water', mood: 'Editorial · piano' },
                { id: 'linen-light', name: 'Linen Light', mood: 'Warm · strings' },
                { id: 'dusk', name: 'Dusk', mood: 'Cinematic · low' },
                { id: 'silent', name: 'No music', mood: 'Voiceover only' },
              ].map(m => (
                <button key={m.id} className={'v-music-row' + (music === m.id ? ' on' : '')} onClick={() => setMusic(m.id)}>
                  <span className="v-music-icon"><Icon name={m.id === 'silent' ? 'x' : 'music'} size={13} /></span>
                  <span className="v-music-meta">
                    <span className="v-music-name">{m.name}</span>
                    <span className="v-music-mood">{m.mood}</span>
                  </span>
                  {music === m.id && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label">Overlays</div>
            <label className="v-check-row">
              <span>Lower-third captions</span>
              <button className={'v-switch' + (showLowerThirds ? ' on' : '')} onClick={() => setShowLowerThirds(v => !v)}><span /></button>
            </label>
            <label className="v-check-row">
              <span>AI voiceover narration</span>
              <button className={'v-switch' + (showVoiceover ? ' on' : '')} onClick={() => setShowVoiceover(v => !v)}><span /></button>
            </label>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label">End card</div>
            <div className="v-seg">
              {[{ id: 'signature', l: 'Signature' }, { id: 'logo', l: 'Brokerage' }, { id: 'none', l: 'None' }].map(e => (
                <button key={e.id} className={'v-seg-btn' + (endcard === e.id ? ' on' : '')} onClick={() => setEndcard(e.id)}>{e.l}</button>
              ))}
            </div>
          </div>

          <div className="v-rail-section v-export-block">
            <div className="v-rail-label">Export</div>
            <button className="v-export-row primary" onClick={() => requestSpend(4, () => {})}>
              <span><Icon name="download" size={13} /> Render <strong>{aspect.replace('_', ':')}</strong></span>
              <span className="dim">~{Math.ceil(totalDur)}s · 4 credits</span>
            </button>
            <button className="v-export-row" onClick={() => requestSpend(10, () => {})}>
              <span>All aspect ratios</span>
              <span className="dim">9:16 · 1:1 · 16:9 · 10 credits</span>
            </button>
            <button className="v-export-row" onClick={() => requestSpend(4, () => {})}>
              <span>MLS-ready MP4</span>
              <span className="dim">1080p · 30fps · 4 cr</span>
            </button>
            <div className="v-export-note">Renders deliver to email and Projects within 90 seconds. Credits are deducted only on successful render.</div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default VellumVideoEditor;
