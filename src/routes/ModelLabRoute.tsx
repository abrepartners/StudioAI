/**
 * src/routes/ModelLabRoute.tsx
 *
 * Admin Model Lab — the FAITHFUL playground. Upload a photo (or use the golden
 * set), pick a tool, and run it through the EXACT same pipeline production
 * uses: the shared callApiDirect() dispatch, the shared client prompt builders
 * (buildStagingAssignment, buildCleanupPrompt, buildMagicEditPrompt), the real
 * /api/flux-* endpoints, and the current shipping engines. What you test here
 * IS what an agent gets — no stale hardcoded prompts, no drift.
 *
 * The exact prompt is shown and editable; edits run through the real pipeline
 * via callApiDirect's promptOverride. Server-side-prompt tools (twilight, sky,
 * renovation) build their prompt in the endpoint, so the lab notes that.
 *
 * Gated by isAdmin() — any @averyandbryant.com email. Non-admins → /.
 * Runs on the live deploy with the production Replicate key. No DB writes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readGoogleUser, isAdmin } from './authStorage';
import { callApiDirect } from '../vellum/VellumPhotoEditor';
import { buildMagicEditPrompt } from '../vellum/toolPrompts';
import { STYLE_PACKS, buildStagingAssignment } from '../prompts/stylePacks';
import { buildCleanupPrompt } from '../../services/fluxService';

// ── Faithful tool set: exactly the tools that route through callApiDirect.
type Tool =
  | 'staging'
  | 'declutter'
  | 'magicedit'
  | 'twilight'
  | 'sky'
  | 'renovation';

const TOOL_LABELS: Record<Tool, { label: string; sub: string }> = {
  staging: { label: 'Virtual Staging', sub: 'Fill / restage a room' },
  declutter: { label: 'Smart Cleanup', sub: 'Remove clutter' },
  magicedit: { label: 'Magic Edit', sub: 'Free-text catch-all' },
  twilight: { label: 'Twilight', sub: 'Day to dusk' },
  sky: { label: 'Sky Replacement', sub: 'Swap the sky' },
  renovation: { label: 'Virtual Renovation', sub: 'Finish swaps' },
};

// Option lists mirror the Vellum editor's pickers. These are menu options only
// — the prompt and model come from shared code, so nothing here can drift the
// actual output.
const ROOM_TYPES = [
  'Living Room', 'Dining Room', 'Kitchen', 'Bedroom', 'Bathroom', 'Office',
  'Laundry Room', 'Garage', 'Bonus Room', 'Media Room', 'Nursery', 'Basement',
  'Foyer', 'Hallway', 'Closet', 'Sunroom', 'Patio', 'Pool', 'Backyard',
  'Front Yard',
];
const STAGING_STYLES = [
  'Contemporary', 'Mid-century', 'Coastal', 'Farmhouse', 'Scandinavian',
  'Minimalist', 'Urban loft', 'Bohemian',
];
// buildCleanupPrompt's own filter vocabulary (the true source), so the lab
// bypasses the preset→filter indirection and drives the builder directly.
const DECLUTTER_FILTERS_INTERIOR = [
  { value: '', label: 'Standard (room clutter)' },
  { value: 'fullclean', label: 'Full clean (empty the room)' },
  { value: 'personal', label: 'Personal items only' },
  { value: 'surfaces', label: 'Surface clutter only' },
];
const DECLUTTER_FILTERS_EXTERIOR = [
  { value: '', label: 'Standard (movable clutter)' },
  { value: 'yard', label: 'Yard clutter' },
  { value: 'vehicles', label: 'Vehicles & bins' },
  { value: 'signs', label: 'Signs & temp items' },
];
const EXTERIOR_ROOMS = new Set(['Exterior', 'Patio', 'Pool', 'Backyard', 'Front Yard']);
const TWILIGHT_STYLES = ['Pink', 'Golden', 'Purple', 'Natural'];
const TWILIGHT_TIMES = ['Early evening', 'Sunset', 'Twilight'];
const SKY_STYLES = ['Clear blue', 'Golden hour', 'Soft overcast', 'Dramatic'];

type RunResult =
  | { ok: true; image: string; latencyMs: number; engine?: string }
  | { ok: false; error: string; latencyMs?: number };

interface GoldenPhoto {
  label: string;
  dataUrl: string;
}

/** Downscale a data URL to <=2048px longest side. resizeForUpload inside each
 *  service shrinks again per-tool; this just keeps the initial read sane. */
async function shrinkDataUrl(dataUrl: string, maxEdge = 2048): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= maxEdge) return resolve(dataUrl);
      const scale = maxEdge / longest;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const readFileAsDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(f);
  });

const ModelLabRoute: React.FC = () => {
  const navigate = useNavigate();
  const [user] = useState(() => readGoogleUser());
  const admin = isAdmin(user);

  const [tool, setTool] = useState<Tool>('staging');
  const [image, setImage] = useState<string | null>(null);
  const [golden, setGolden] = useState<GoldenPhoto[]>([]);

  // Tool-specific controls (mirror the editor's inputs).
  const [room, setRoom] = useState('Living Room');
  const [stagingStyle, setStagingStyle] = useState('Contemporary');
  const [replaceFurniture, setReplaceFurniture] = useState(false);
  const [declutterFilter, setDeclutterFilter] = useState('');
  const [customRemoval, setCustomRemoval] = useState('');
  const [magicInstruction, setMagicInstruction] = useState('');
  const [twilightStyle, setTwilightStyle] = useState('Golden');
  const [twilightTime, setTwilightTime] = useState('Sunset');
  const [skyStyle, setSkyStyle] = useState('Clear blue');
  const [reno, setReno] = useState({ cabinets: '', countertops: '', flooring: '', walls: '' });

  // promptOverride === null → not dirtied, textarea shows the built prompt.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [goldenResults, setGoldenResults] = useState<Record<number, RunResult | null>>({});
  const [goldenRunning, setGoldenRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!admin) navigate('/', { replace: true });
  }, [admin, navigate]);

  // Auto-load a committed golden set if the team has curated one at
  // /golden/manifest.json (same-origin — avoids canvas-taint on upload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/golden/manifest.json', { cache: 'no-store' });
        if (!res.ok) return;
        const list: Array<{ file: string; label?: string }> = await res.json();
        if (!Array.isArray(list) || !list.length) return;
        const loaded = await Promise.all(
          list.map(async (item) => {
            try {
              const imgRes = await fetch(`/golden/${item.file}`, { cache: 'no-store' });
              if (!imgRes.ok) return null;
              const blob = await imgRes.blob();
              const dataUrl = await readFileAsDataUrl(new File([blob], item.file));
              return { label: item.label || item.file, dataUrl: await shrinkDataUrl(dataUrl) };
            } catch { return null; }
          }),
        );
        if (!cancelled) setGolden((g) => (g.length ? g : loaded.filter(Boolean) as GoldenPhoto[]));
      } catch { /* no committed set — fine, admin uploads their own */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const isExterior = EXTERIOR_ROOMS.has(room);
  const declutterFilterOptions = isExterior ? DECLUTTER_FILTERS_EXTERIOR : DECLUTTER_FILTERS_INTERIOR;

  // ── Exact prompt for the current tool, built by the SAME shared code prod
  // uses. null → the prompt is built server-side (twilight/sky/renovation).
  const builtPrompt: string | null = useMemo(() => {
    if (tool === 'staging') {
      const packKey = stagingStyle.toLowerCase().replace(/ /g, '-');
      const pack = STYLE_PACKS[packKey] || STYLE_PACKS[stagingStyle.toLowerCase()];
      return pack
        ? buildStagingAssignment(pack, room, replaceFurniture ? 'replace' : 'add')
        : `Take this exact photograph of a ${room.toLowerCase()} and ${replaceFurniture ? 'REPLACE all existing freestanding furniture and decor with' : 'ADD'} ${stagingStyle} style furniture${replaceFurniture ? '' : ' to it'}. This is an ADDITIVE edit, NOT image generation: keep every existing pixel identical to the input.`;
    }
    if (tool === 'declutter') {
      return buildCleanupPrompt(room, declutterFilter || undefined, customRemoval.trim() || undefined);
    }
    if (tool === 'magicedit') {
      return buildMagicEditPrompt(room, magicInstruction.trim() || '[your instruction]');
    }
    return null;
  }, [tool, room, stagingStyle, replaceFurniture, declutterFilter, customRemoval, magicInstruction]);

  // Reset the override whenever the built prompt's inputs change so the
  // textarea re-seeds from the fresh default (unless the user is mid-edit and
  // wants to keep it — the Reset button restores the default explicitly).
  useEffect(() => { setPromptOverride(null); }, [tool]);

  const textareaValue = promptOverride ?? (builtPrompt || '');
  const promptEditable = builtPrompt !== null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await readFileAsDataUrl(f);
    setImage(await shrinkDataUrl(raw));
    setResult(null);
  };

  const onGoldenFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const added = await Promise.all(
      files.map(async (f) => ({ label: f.name, dataUrl: await shrinkDataUrl(await readFileAsDataUrl(f)) })),
    );
    setGolden((g) => [...g, ...added]);
    e.target.value = '';
  };

  // Build the (preset, customRemovalVal, replaceFurniture, promptOverride)
  // tuple callApiDirect expects for the active tool — identical to how the
  // editor calls it.
  const dispatchArgs = (): { preset: string; custom: string; replace: boolean; override?: string } => {
    const effectiveOverride = promptEditable ? textareaValue : undefined;
    switch (tool) {
      case 'staging':
        return { preset: stagingStyle, custom: '', replace: replaceFurniture, override: effectiveOverride };
      case 'declutter':
        // Always pass the shown prompt so display == run (bypasses the
        // preset→filter mapping; the prompt already encodes the filter).
        return { preset: 'standard', custom: customRemoval.trim(), replace: false, override: effectiveOverride };
      case 'magicedit':
        return { preset: '', custom: magicInstruction.trim(), replace: false, override: effectiveOverride };
      case 'twilight':
        return {
          preset: `${twilightStyle.toLowerCase()}|${twilightTime.toLowerCase().replace(/ /g, '-')}`,
          custom: '', replace: false,
        };
      case 'sky':
        return { preset: skyStyle.toLowerCase(), custom: '', replace: false };
      case 'renovation':
        return { preset: JSON.stringify(reno), custom: '', replace: false };
    }
  };

  const runFaithful = async (imageDataUrl: string): Promise<RunResult> => {
    const { preset, custom, replace, override } = dispatchArgs();
    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = Date.now();
    try {
      const res = await callApiDirect(
        imageDataUrl,
        room,
        tool,
        preset,
        custom,
        controller.signal,
        undefined, // no SAM controller — Precision Select is not exposed in the lab
        replace,
        override,
      );
      return { ok: true, image: res.resultBase64, latencyMs: Date.now() - t0, engine: res.engine };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'failed', latencyMs: Date.now() - t0 };
    }
  };

  const validate = (): string | null => {
    if (tool === 'magicedit' && !magicInstruction.trim()) return 'Enter a Magic Edit instruction.';
    if (tool === 'renovation' && !(reno.cabinets.trim() || reno.countertops.trim() || reno.flooring.trim() || reno.walls.trim()))
      return 'Enter at least one renovation change.';
    return null;
  };

  const runSingle = async () => {
    if (!image) return;
    const err = validate();
    if (err) { setResult({ ok: false, error: err }); return; }
    setRunning(true);
    setResult(null);
    setResult(await runFaithful(image));
    setRunning(false);
  };

  const runGolden = async () => {
    if (!golden.length) return;
    const err = validate();
    if (err) { setResult({ ok: false, error: err }); return; }
    setGoldenRunning(true);
    setGoldenResults({});
    // Sequential to stay gentle on the Replicate account and keep latency
    // readings clean (concurrency here would just queue behind rate limits).
    for (let i = 0; i < golden.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await runFaithful(golden[i].dataUrl);
      setGoldenResults((prev) => ({ ...prev, [i]: r }));
    }
    setGoldenRunning(false);
  };

  const download = (r: RunResult, name: string) => {
    if (!r.ok) return;
    const a = document.createElement('a');
    a.href = r.image;
    a.download = `lab-${tool}-${name}-${Date.now()}.jpg`;
    a.click();
  };

  if (!admin) return null;

  const controls = () => {
    switch (tool) {
      case 'staging':
        return (
          <>
            <LabSelect label="Room" value={room} onChange={setRoom} options={ROOM_TYPES} />
            <LabSelect label="Style" value={stagingStyle} onChange={setStagingStyle} options={STAGING_STYLES} />
            <label className="flex items-center gap-2 text-xs text-zinc-300 mt-1">
              <input type="checkbox" checked={replaceFurniture} onChange={(e) => setReplaceFurniture(e.target.checked)} />
              Replace existing furniture (furnished room)
            </label>
          </>
        );
      case 'declutter':
        return (
          <>
            <LabSelect label="Room" value={room} onChange={setRoom} options={ROOM_TYPES} />
            <LabSelect
              label="Cleanup mode" value={declutterFilter} onChange={setDeclutterFilter}
              options={declutterFilterOptions.map((o) => o.value)}
              render={(v) => declutterFilterOptions.find((o) => o.value === v)?.label || v}
            />
            <LabText label="Also remove (optional)" value={customRemoval} onChange={setCustomRemoval} placeholder="e.g. the blue trash can" />
          </>
        );
      case 'magicedit':
        return (
          <>
            <LabSelect label="Room (context, optional)" value={room} onChange={setRoom} options={ROOM_TYPES} />
            <LabText label="Instruction *" value={magicInstruction} onChange={setMagicInstruction} placeholder="e.g. remove the cars from the driveway" />
          </>
        );
      case 'twilight':
        return (
          <>
            <LabSelect label="Sky palette" value={twilightStyle} onChange={setTwilightStyle} options={TWILIGHT_STYLES} />
            <LabSelect label="Time of day" value={twilightTime} onChange={setTwilightTime} options={TWILIGHT_TIMES} />
          </>
        );
      case 'sky':
        return <LabSelect label="Sky" value={skyStyle} onChange={setSkyStyle} options={SKY_STYLES} />;
      case 'renovation':
        return (
          <>
            <LabText label="Cabinets" value={reno.cabinets} onChange={(v) => setReno((r) => ({ ...r, cabinets: v }))} placeholder="white shaker" />
            <LabText label="Countertops" value={reno.countertops} onChange={(v) => setReno((r) => ({ ...r, countertops: v }))} placeholder="white quartz" />
            <LabText label="Flooring" value={reno.flooring} onChange={(v) => setReno((r) => ({ ...r, flooring: v }))} placeholder="light oak LVP" />
            <LabText label="Walls" value={reno.walls} onChange={(v) => setReno((r) => ({ ...r, walls: v }))} placeholder="warm white" />
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-50">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-primary)] font-bold">Admin · Model Lab</p>
          <h1 className="text-xl font-black mt-0.5">Faithful playground</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Real pipeline · real prompts · shipping engines. What runs here is what agents get.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{user?.email}</span>
          <button type="button" onClick={() => navigate('/')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            Back to Studio
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Tool tabs */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TOOL_LABELS) as Tool[]).map((t) => (
            <button key={t} type="button" onClick={() => { setTool(t); setResult(null); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tool === t
                  ? 'bg-[var(--color-primary)]/20 border border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10'
              }`}>
              {TOOL_LABELS[t].label}
              <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">{TOOL_LABELS[t].sub}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: source + controls */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">1. Source photo</label>
            <input type="file" accept="image/*" onChange={onFile}
              className="block text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-1.5 file:text-white file:text-xs file:font-semibold hover:file:bg-white/10" />
            {image && (
              <div className="rounded-xl overflow-hidden border border-white/10">
                <img src={image} alt="source" className="w-full max-h-[280px] object-contain bg-black" />
              </div>
            )}
            <div className="pt-2 space-y-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">2. {TOOL_LABELS[tool].label} settings</label>
              {controls()}
            </div>
          </div>

          {/* Right: exact prompt */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">3. Exact prompt (as shipped)</label>
              {promptEditable && promptOverride !== null && (
                <button type="button" onClick={() => setPromptOverride(null)}
                  className="text-[11px] text-[var(--color-primary)] hover:opacity-80 font-semibold">Reset to default</button>
              )}
            </div>
            {promptEditable ? (
              <>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Built by the same shared code production runs ({tool === 'staging' ? 'buildStagingAssignment' : tool === 'declutter' ? 'buildCleanupPrompt' : 'buildMagicEditPrompt'}). Edit to A/B a wording — your edit runs through the real endpoint.
                </p>
                <textarea value={textareaValue} onChange={(e) => setPromptOverride(e.target.value)} rows={14}
                  className="w-full mt-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[12px] leading-relaxed text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono" />
                <p className="text-[10px] text-zinc-600 mt-1">{textareaValue.length.toLocaleString()} chars</p>
              </>
            ) : (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] text-zinc-400 leading-relaxed">
                This tool builds its prompt <b>server-side</b> inside{' '}
                <span className="font-mono text-zinc-300">
                  {tool === 'twilight' ? '/api/flux-twilight' : tool === 'sky' ? '/api/sky-replace' : '/api/flux-renovation'}
                </span>{' '}
                from the settings on the left. The lab sends those settings through the exact same endpoint — the server owns the wording, so there's nothing to override here.
              </div>
            )}
            <button type="button" onClick={runSingle} disabled={!image || running}
              className="w-full mt-3 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
              {running ? 'Running…' : '4. Run on source photo'}
            </button>
          </div>
        </div>

        {/* Single result */}
        {(running || result) && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Result</label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {image && (
                <figure>
                  <figcaption className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1">Before</figcaption>
                  <img src={image} alt="before" className="w-full rounded-xl border border-white/10 object-contain bg-black max-h-[420px]" />
                </figure>
              )}
              <figure>
                <figcaption className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1">After</figcaption>
                <div className="w-full rounded-xl border border-white/10 bg-black aspect-[4/3] grid place-items-center overflow-hidden">
                  {running && <Spinner />}
                  {!running && result?.ok && <img src={result.image} alt="after" className="w-full h-full object-contain" />}
                  {!running && result && !result.ok && (
                    <div className="p-3 text-center">
                      <p className="text-xs font-bold text-[#FF375F]">Failed</p>
                      <p className="text-[10px] text-zinc-500 mt-1 break-words">{result.error}</p>
                    </div>
                  )}
                </div>
                {result && result.latencyMs !== undefined && (
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className={`font-semibold ${result.ok ? 'text-[#30D158]' : 'text-[#FF375F]'}`}>
                      {result.ok ? `Success · ${(result.latencyMs / 1000).toFixed(1)}s${result.engine ? ` · ${result.engine}` : ''}` : 'Error'}
                    </span>
                    {result.ok && (
                      <button type="button" onClick={() => download(result, 'source')}
                        className="text-[11px] text-[var(--color-primary)] hover:opacity-80 font-semibold">Download</button>
                    )}
                  </div>
                )}
              </figure>
            </div>
          </div>
        )}

        {/* Golden set */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Golden set</label>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Your canonical test photos. Auto-loads from <span className="font-mono">/golden/manifest.json</span> if committed, or add your own below. "Run golden set" runs the current tool + prompt across every photo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="rounded-lg text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 bg-white/10 border border-white/10 hover:bg-white/20 cursor-pointer">
                Add photos
                <input type="file" accept="image/*" multiple onChange={onGoldenFiles} className="hidden" />
              </label>
              <button type="button" onClick={runGolden} disabled={!golden.length || goldenRunning}
                className="rounded-lg text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90">
                {goldenRunning ? 'Running…' : `Run golden set (${golden.length})`}
              </button>
            </div>
          </div>

          {golden.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {golden.map((g, i) => {
                const r = goldenResults[i];
                return (
                  <div key={i} className="rounded-xl border border-white/10 overflow-hidden bg-black/40">
                    <div className="aspect-[4/3] bg-black grid place-items-center overflow-hidden relative">
                      {goldenRunning && !r && <Spinner />}
                      {r?.ok && <img src={r.image} alt={g.label} className="w-full h-full object-contain" />}
                      {!r && !goldenRunning && <img src={g.dataUrl} alt={g.label} className="w-full h-full object-contain opacity-40" />}
                      {r && !r.ok && <p className="text-[10px] text-[#FF375F] p-2 text-center">{r.error}</p>}
                    </div>
                    <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-zinc-400 truncate">{g.label}</span>
                      {r?.ok
                        ? <button type="button" onClick={() => download(r, g.label.replace(/\W+/g, '-'))} className="text-[10px] text-[var(--color-primary)] font-semibold shrink-0">↓</button>
                        : <button type="button" onClick={() => setGolden((gs) => gs.filter((_, j) => j !== i))} className="text-[10px] text-zinc-600 hover:text-[#FF375F] shrink-0">✕</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[11px] text-zinc-600 pt-2">
          Admin-only. Every run hits the live <span className="font-mono">/api/flux-*</span> endpoints via the shared <span className="font-mono">callApiDirect</span> — the same code path, prompts, and engines the Vellum editor ships. Costs bill to the shop's Replicate account. No DB writes; results held in memory.
        </div>
      </main>
    </div>
  );
};

const Spinner: React.FC = () => (
  <div className="text-xs text-zinc-400 flex items-center gap-2">
    <div className="w-3 h-3 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
    Generating…
  </div>
);

const LabSelect: React.FC<{
  label: string; value: string; onChange: (v: string) => void; options: string[]; render?: (v: string) => string;
}> = ({ label, value, onChange, options, render }) => (
  <div>
    <label className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-sm text-zinc-200 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]">
      {options.map((o) => <option key={o} value={o}>{render ? render(o) : o}</option>)}
    </select>
  </div>
);

const LabText: React.FC<{
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">{label}</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]" />
  </div>
);

export default ModelLabRoute;
