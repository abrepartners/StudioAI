/**
 * src/routes/ModelLabRoute.tsx
 *
 * Admin Model Lab. Upload a photo, pick a tool, compare 3 candidate
 * Replicate models side-by-side. Gated by isAdmin() — any
 * @averyandbryant.com email (including book@averyandbryant.com) passes.
 * Non-admins are redirected to /.
 *
 * Model configs are editable per-card so the admin can tweak slugs and
 * prompts on the fly without a deploy.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readGoogleUser, isAdmin } from './authStorage';

type Tool = 'twilight' | 'cleanup' | 'sky' | 'renovation' | 'staging';

type RunResult = { ok: true; image: string; latencyMs: number } | { ok: false; error: string; latencyMs?: number };

interface ModelConfig {
  /** Display name for the card header. */
  name: string;
  /** 1-line description of what this model/approach does. */
  description: string;
  /** Replicate slug, optionally version-pinned (owner/model[:hash]). */
  modelSlug: string;
  /** Builds the Replicate input payload from the uploaded image + optional prompt override. */
  buildInput: (imageDataUrl: string, promptOverride: string) => Record<string, unknown>;
}

const TWILIGHT_PROMPT = `LIGHTING-ONLY EDIT. Take the input photograph and change only the lighting and sky. PRESERVE: house architecture, siding, roof, windows, doors, landscaping, yard, camera framing, perspective. TARGET: blue hour twilight with warm amber window glow, porch lights on, cinematic real estate photography. Do NOT invent objects, do NOT change perspective, do NOT re-side or re-roof the house.`;

const CLEANUP_PROMPT = `Remove personal items, clutter, trash, construction debris, and for-sale signs from this photo. PRESERVE the house, architecture, siding, roof, windows, doors, landscaping, grass, and perspective exactly. Treat as photo restoration, not creative regeneration.`;

const SKY_PROMPT = `Replace the sky only with a vivid deep blue sky with scattered cumulus clouds. Keep the house, landscaping, perspective, and everything else pixel-identical.`;

const RENO_PROMPT = `Change cabinets to white shaker style with brushed nickel hardware. Keep everything else in the photo (walls, floor, appliances, perspective, architecture) pixel-identical.`;

const STAGING_PROMPT = `Virtually stage this empty room with photorealistic modern transitional furniture appropriate for the room's type and scale. Add a sofa and accent chairs in neutral tones, a coffee table or ottoman, an area rug that fits the space, a console or side tables, tasteful artwork and lamps, and a few plants. Furniture must be proportional to the room — no king beds in small rooms, no oversized sectionals in tight spaces.

ABSOLUTE PRESERVATION — pixel-identical on every non-furniture surface:
- Walls, wall color, paint, trim, baseboards
- Floors, flooring material, rugs that are actually painted on the floor
- Ceiling, ceiling fans, light fixtures already in place
- Windows, window frames, blinds/curtains already present, views through windows
- Doors, door frames, doorways
- Architectural details: crown molding, wainscoting, built-ins
- Camera framing, perspective, focal length, lens distortion

Shadows under new furniture must match the existing light direction in the photo. Professional real estate photography style — crisp, bright, neutral color balance. Do NOT repaint walls, do NOT change flooring, do NOT alter architecture.`;

const CONFIGS: Record<Tool, ModelConfig[]> = {
  twilight: [
    {
      name: 'Flux 2 Pro (current)',
      description: 'Text-to-image edit. Hallucinates exteriors sometimes.',
      modelSlug: 'black-forest-labs/flux-2-pro',
      buildInput: (img, p) => ({
        input_images: [img],
        prompt: p || TWILIGHT_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'IC-Light Background',
      description: 'Dedicated relighting. Uses subject_image as hard ground truth + a background reference for the target lighting. Cannot invent new architecture.',
      modelSlug: 'zsxkib/ic-light-background:60015df78a8a795470da6494822982140d57b150b9ef14354e79302ff89f69e3',
      buildInput: (img, p) => ({
        subject_image: img,
        background_image: 'https://studioai.averyandbryant.com/references/twilight/warm-classic.jpg',
        prompt: p || 'professional real estate twilight photography, blue hour with warm sunset horizon, amber window glow, cinematic dusk exterior',
        appended_prompt: 'best quality, photorealistic, real estate exterior, preserve subject',
        negative_prompt: 'lowres, different house, changed building, invented objects, cartoon, reframed, wide angle',
        light_source: 'Use Background Image',
        steps: 30,
        cfg: 2,
        lowres_denoise: 0.9,
        highres_denoise: 0.3,
      }),
    },
    {
      name: 'Flux Kontext Pro',
      description: 'Flux family tuned for image editing. Tighter input preservation than Flux 2 Pro on some edit tasks.',
      modelSlug: 'black-forest-labs/flux-kontext-pro',
      buildInput: (img, p) => ({
        input_image: img,
        prompt: p || TWILIGHT_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
  ],
  cleanup: [
    {
      name: 'Flux 2 Pro (current)',
      description: 'Text-to-image edit with preservation prompt.',
      modelSlug: 'black-forest-labs/flux-2-pro',
      buildInput: (img, p) => ({
        input_images: [img],
        prompt: p || CLEANUP_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Flux Kontext Pro',
      description: 'Editing-specialized Flux, designed for clean object removal while preserving context.',
      modelSlug: 'black-forest-labs/flux-kontext-pro',
      buildInput: (img, p) => ({
        input_image: img,
        prompt: p || CLEANUP_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Google Nano Banana',
      description: 'Gemini 2.5 Flash Image editing. Fast, cheap (~$0.04/img), strong preservation.',
      modelSlug: 'google/nano-banana',
      buildInput: (img, p) => ({
        image_input: [img],
        prompt: p || CLEANUP_PROMPT,
        output_format: 'jpg',
      }),
    },
  ],
  sky: [
    {
      name: 'Flux Kontext Pro',
      description: 'Targeted image edit — ask for sky only, rest preserved.',
      modelSlug: 'black-forest-labs/flux-kontext-pro',
      buildInput: (img, p) => ({
        input_image: img,
        prompt: p || SKY_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Flux 2 Pro',
      description: 'Text-driven sky replacement, broader model.',
      modelSlug: 'black-forest-labs/flux-2-pro',
      buildInput: (img, p) => ({
        input_images: [img],
        prompt: p || SKY_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Google Nano Banana',
      description: 'Gemini image edit — often best at localized sky edits with preservation.',
      modelSlug: 'google/nano-banana',
      buildInput: (img, p) => ({
        image_input: [img],
        prompt: p || SKY_PROMPT,
        output_format: 'jpg',
      }),
    },
  ],
  renovation: [
    {
      name: 'Flux Kontext Pro',
      description: 'Strong at material/color/finish swaps while keeping geometry intact.',
      modelSlug: 'black-forest-labs/flux-kontext-pro',
      buildInput: (img, p) => ({
        input_image: img,
        prompt: p || RENO_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Flux 2 Pro',
      description: 'Text-driven renovation preview.',
      modelSlug: 'black-forest-labs/flux-2-pro',
      buildInput: (img, p) => ({
        input_images: [img],
        prompt: p || RENO_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Qwen Image Edit',
      description: 'Alibaba\'s image-edit model — alternative take on prompt-driven renovation.',
      modelSlug: 'qwen/qwen-image-edit',
      buildInput: (img, p) => ({
        image: img,
        prompt: p || RENO_PROMPT,
      }),
    },
  ],
  staging: [
    {
      name: 'Adirik Interior Design',
      description: 'Budget tier — ~$0.0072/img (~6x cheaper than Gemini/Flux). SD-based with interior-design finetune. Big margin unlock if quality holds.',
      modelSlug: 'adirik/interior-design',
      buildInput: (img, p) => ({
        image: img,
        prompt: p || STAGING_PROMPT,
        negative_prompt: 'lowres, blurry, distorted, deformed, watermark, text, cartoon, anime, painting, oversized furniture, unrealistic proportions, wrong perspective, different room, changed walls, changed floors',
        prompt_strength: 0.8,
        num_inference_steps: 50,
        guidance_scale: 15,
      }),
    },
    {
      name: 'Flux Kontext Pro',
      description: 'Editing-specialized Flux. Strong at adding objects into a scene while keeping walls/floors/perspective pixel-accurate.',
      modelSlug: 'black-forest-labs/flux-kontext-pro',
      buildInput: (img, p) => ({
        input_image: img,
        prompt: p || STAGING_PROMPT,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      }),
    },
    {
      name: 'Google Nano Banana',
      description: 'Gemini 2.5 Flash Image. Same model we locked for cleanup + sky. ~$0.04/img. Strong preservation.',
      modelSlug: 'google/nano-banana',
      buildInput: (img, p) => ({
        image_input: [img],
        prompt: p || STAGING_PROMPT,
        output_format: 'jpg',
      }),
    },
  ],
};

const TOOL_LABELS: Record<Tool, { label: string; sub: string }> = {
  twilight: { label: 'Day to Dusk', sub: 'Relight exteriors to twilight' },
  cleanup: { label: 'Smart Cleanup', sub: 'Remove clutter & personal items' },
  sky: { label: 'Sky Replacement', sub: 'Swap dull skies' },
  renovation: { label: 'Virtual Renovation', sub: 'Material & finish swaps' },
  staging: { label: 'Virtual Staging', sub: 'Fill empty rooms with furniture' },
};

/** Downscale a data URL to <=1280px longest side to stay under Vercel's 4.5MB limit. */
async function shrinkDataUrl(dataUrl: string, maxEdge = 1280): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const ModelLabRoute: React.FC = () => {
  const navigate = useNavigate();
  const [user] = useState(() => readGoogleUser());
  const admin = isAdmin(user);

  const [tool, setTool] = useState<Tool>('twilight');
  const [image, setImage] = useState<string | null>(null);
  const [promptOverride, setPromptOverride] = useState('');
  const [results, setResults] = useState<Array<RunResult | null>>([null, null, null]);
  const [running, setRunning] = useState<boolean[]>([false, false, false]);
  const [editedSlugs, setEditedSlugs] = useState<Record<Tool, string[]>>({
    twilight: CONFIGS.twilight.map(c => c.modelSlug),
    cleanup: CONFIGS.cleanup.map(c => c.modelSlug),
    sky: CONFIGS.sky.map(c => c.modelSlug),
    renovation: CONFIGS.renovation.map(c => c.modelSlug),
    staging: CONFIGS.staging.map(c => c.modelSlug),
  });

  useEffect(() => {
    if (!admin) navigate('/', { replace: true });
  }, [admin, navigate]);

  const configs = useMemo(() => CONFIGS[tool], [tool]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      const shrunk = await shrinkDataUrl(raw, 1280);
      setImage(shrunk);
      setResults([null, null, null]);
    };
    reader.readAsDataURL(f);
  };

  const runOne = async (idx: number) => {
    if (!image) return;
    const cfg = configs[idx];
    const slug = editedSlugs[tool][idx] || cfg.modelSlug;
    setRunning(r => { const n = [...r]; n[idx] = true; return n; });
    setResults(r => { const n = [...r]; n[idx] = null; return n; });
    try {
      const res = await fetch('/api/lab-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelSlug: slug, input: cfg.buildInput(image, promptOverride) }),
      });
      const data = await res.json();
      setResults(r => {
        const n = [...r];
        n[idx] = data.ok
          ? { ok: true, image: data.resultBase64, latencyMs: data.latencyMs }
          : { ok: false, error: data.error || 'unknown error', latencyMs: data.latencyMs };
        return n;
      });
    } catch (err: any) {
      setResults(r => { const n = [...r]; n[idx] = { ok: false, error: err?.message || 'network error' }; return n; });
    } finally {
      setRunning(r => { const n = [...r]; n[idx] = false; return n; });
    }
  };

  const runAll = () => { for (let i = 0; i < 3; i++) runOne(i); };

  const updateSlug = (idx: number, slug: string) => {
    setEditedSlugs(prev => ({ ...prev, [tool]: prev[tool].map((s, i) => i === idx ? slug : s) }));
  };

  const downloadResult = (idx: number) => {
    const r = results[idx];
    if (!r || !r.ok) return;
    const a = document.createElement('a');
    a.href = r.image;
    a.download = `lab-${tool}-${configs[idx].name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.jpg`;
    a.click();
  };

  if (!admin) return null;

  const anyRunning = running.some(Boolean);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-50">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-primary)] font-bold">Admin · Model Lab</p>
          <h1 className="text-xl font-black mt-0.5">A/B/C test Replicate models</h1>
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
          {(Object.keys(CONFIGS) as Tool[]).map(t => (
            <button key={t} type="button" onClick={() => { setTool(t); setResults([null, null, null]); setPromptOverride(''); }}
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

        {/* Upload + prompt override */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">1. Source photo</label>
            <input type="file" accept="image/*" onChange={onFile}
              className="block mt-2 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-1.5 file:text-white file:text-xs file:font-semibold hover:file:bg-white/10" />
            {image && (
              <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
                <img src={image} alt="source" className="w-full max-h-[320px] object-contain bg-black" />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">2. Prompt override (optional)</label>
            <p className="text-[10px] text-zinc-600 mt-1">Leave empty to use each model card's built-in prompt. Applies to all 3 cards.</p>
            <textarea value={promptOverride} onChange={e => setPromptOverride(e.target.value)}
              rows={6} placeholder={`Using default ${TOOL_LABELS[tool].label} prompt…`}
              className="w-full mt-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono" />
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={runAll} disabled={!image || anyRunning}
                className="flex-1 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
                {anyRunning ? 'Running…' : '3. Run all 3 models'}
              </button>
            </div>
          </div>
        </div>

        {/* Results grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {configs.map((cfg, idx) => {
            const res = results[idx];
            const isRunning = running[idx];
            const slug = editedSlugs[tool][idx];
            return (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-bold">Option {idx + 1}</p>
                    <h3 className="font-black text-base mt-0.5">{cfg.name}</h3>
                    <p className="text-xs text-zinc-400 mt-1 leading-snug">{cfg.description}</p>
                  </div>
                  <button type="button" onClick={() => runOne(idx)} disabled={!image || isRunning}
                    className="shrink-0 rounded-lg text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 bg-white/10 border border-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed">
                    {isRunning ? 'Running…' : 'Run'}
                  </button>
                </div>

                <label className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mt-3">Model slug</label>
                <input value={slug} onChange={e => updateSlug(idx, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-zinc-300 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] font-mono" />

                <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black aspect-[4/3] relative">
                  {isRunning && (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="text-xs text-zinc-400 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
                        Generating…
                      </div>
                    </div>
                  )}
                  {!isRunning && res && res.ok && (
                    <img src={res.image} alt={cfg.name} className="w-full h-full object-contain" />
                  )}
                  {!isRunning && res && !res.ok && (
                    <div className="absolute inset-0 grid place-items-center p-3 text-center">
                      <div>
                        <p className="text-xs font-bold text-[#FF375F]">Failed</p>
                        <p className="text-[10px] text-zinc-500 mt-1 break-words">{res.error}</p>
                      </div>
                    </div>
                  )}
                  {!isRunning && !res && (
                    <div className="absolute inset-0 grid place-items-center">
                      <p className="text-xs text-zinc-600">No result yet</p>
                    </div>
                  )}
                </div>

                {res && (res.latencyMs !== undefined) && (
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className={`font-semibold ${res.ok ? 'text-[#30D158]' : 'text-[#FF375F]'}`}>
                      {res.ok ? 'Success' : 'Error'} · {(res.latencyMs / 1000).toFixed(1)}s
                    </span>
                    {res.ok && (
                      <button type="button" onClick={() => downloadResult(idx)}
                        className="text-[11px] text-[var(--color-primary)] hover:opacity-80 font-semibold">
                        Download
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-zinc-600 pt-4">
          Admin-only page. Gated to @averyandbryant.com emails via localStorage auth probe. Results are stored in memory only (no DB writes). Costs billed to the shop's Replicate account per run.
        </div>
      </main>
    </div>
  );
};

export default ModelLabRoute;
