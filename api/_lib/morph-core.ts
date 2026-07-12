/**
 * api/_lib/morph-core.ts — server-only engine for the Property Morph feature.
 *
 * Ports the proven recipe from the local tester (property-morph-engine): a
 * front-facing listing photo is reframed to a full-house vertical, turned into
 * an under-construction still, then morphed real -> construction -> real into a
 * 9:16 loop. Everything here runs behind the book@averyandbryant.com gate and
 * uses server-side secrets only (REPLICATE_API_TOKEN, SUPABASE_SERVICE_KEY).
 *
 * Serverless shape: no single request runs the whole 10-minute render. Each
 * step STARTS a Replicate prediction (returns immediately) and job state lives
 * in the morph_jobs table; the browser polls /api/morph/status, which advances
 * the state machine one step per call. Never import this from client code.
 */
import { requireServiceOrSession } from "./auth-middleware.js";
import { json } from "../utils.js";

const REPLICATE_TOKEN =
  process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN || "";
const SB = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";

/** The single account allowed to use the morph feature (Thomas' ask). */
export const MORPH_EMAIL = "book@averyandbryant.com";

// ── Prompts (proven on 48 Orle + 800 Silverwood) ───────────────────────────

/** Reframe: keep the ONE house, change the ratio to a tall vertical. The
 *  anti-duplication guard stops the model inventing extra houses when it fills
 *  the taller frame (flux outpaint hallucinated whole houses at this ratio). */
export const REFRAME_PROMPT =
  "Recompose this exact photograph into a vertical portrait (taller than wide) frame. " +
  "Keep the SINGLE main house exactly as it is — identical brick and materials, gables, " +
  "arched entry, tall windows, roofline, garage wing, mailbox and landscaping, in the same " +
  "position and proportion. To fill the taller frame, extend ONLY the existing sky upward and " +
  "the existing front lawn, driveway and street downward. Do NOT add, duplicate, or invent any " +
  "additional houses, buildings, garages or structures — one house only. Photorealistic, bright " +
  "daylight, clear blue sky. No text, labels, or watermarks.";

const FRAME_LOCK =
  "Keep the exact same camera position, perspective, scale and framing as the reference image. " +
  "Do not move, resize, rotate or re-crop the house. Preserve the exact rooflines, gable, arched " +
  "entry, tall window openings, side wing/garage and proportions.";

/** The one V1 look: an ACTIVE construction SITE (not the finished house with
 *  framing pasted on) — bare dirt lot, no lawn, no driveway. */
export const CONSTRUCTION_PROMPT =
  FRAME_LOCK +
  " Transform it into an ACTIVE CONSTRUCTION SITE at the framing stage: exposed wood wall studs " +
  "and roof trusses, Tyvek house wrap and OSB sheathing, poured concrete foundation. Bare dirt and " +
  "mud where the lawn will be (NO finished green lawn), dirt or gravel where the driveway will be " +
  "(NO finished driveway), scattered lumber and building materials on the ground. Natural daylight. " +
  "No people, no workers, no vehicles, no text or watermarks.";

const morphPrompt = (fromLabel: string, toLabel: string) =>
  `The house transforms from a ${fromLabel} view into a ${toLabel} view, the new treatment ` +
  `appearing over the exact same structure. Locked static tripod camera, zero movement, physical ` +
  `transformation only, not a crossfade.`;

// ── Auth gate ───────────────────────────────────────────────────────────────

/** Gate: a headless service key (blessed pattern, for agents/smoke tests) OR a
 *  browser session that is book@averyandbryant.com. Assumes the handler already
 *  ran applyCors. Returns the claims or null after writing 401/403. */
export async function requireMorphUser(req: any, res: any) {
  const claims = await requireServiceOrSession(req, res);
  if (!claims) return null; // 401 already written
  if ((claims as any).service) return claims; // headless service identity
  if ((claims.email || "").toLowerCase() !== MORPH_EMAIL) {
    json(res, 403, { ok: false, error: "not authorized for this feature" });
    return null;
  }
  return claims;
}

// ── Replicate (raw REST: start + poll across invocations) ────────────────────

const RHEAD = {
  Authorization: `Token ${REPLICATE_TOKEN}`,
  "Content-Type": "application/json",
};

/** Start a prediction on an official model. Returns the poll URL (urls.get). */
export async function startModel(model: string, input: any): Promise<string> {
  const r = await fetch(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    { method: "POST", headers: RHEAD, body: JSON.stringify({ input }) },
  );
  if (!r.ok)
    throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const p = await r.json();
  const pollUrl = p?.urls?.get;
  if (!pollUrl) throw new Error(`${model}: no poll url`);
  return pollUrl;
}

export interface PredState {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: any;
  error?: any;
}

/** Poll a prediction. Returns its state; caller decides to advance or wait. */
export async function getPred(pollUrl: string): Promise<PredState> {
  const r = await fetch(pollUrl, {
    headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
  });
  if (!r.ok) return { status: "processing" }; // transient: treat as not-ready, retry next poll
  return (await r.json()) as PredState;
}

/** First output URL from a finished prediction. */
export const predUrl = (p: PredState): string =>
  Array.isArray(p.output) ? p.output[0] : p.output;

/** Upload a raw image buffer to Replicate files; returns a servable URL. */
export async function uploadToReplicate(buf: Buffer): Promise<string> {
  const fd = new FormData();
  fd.append("content", new Blob([buf], { type: "image/jpeg" }), "src.jpg");
  const r = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
    body: fd,
  });
  if (!r.ok) throw new Error("replicate upload " + r.status);
  return (await r.json()).urls.get;
}

// Step starters — one place for the exact model + input contract.
export const startReframe = (srcUrl: string) =>
  startModel("openai/gpt-image-2", {
    prompt: REFRAME_PROMPT,
    input_images: [srcUrl],
    quality: "high",
    aspect_ratio: "2:3",
    output_format: "png",
  });

export const startConstruction = (realUrl: string) =>
  startModel("openai/gpt-image-2", {
    prompt: CONSTRUCTION_PROMPT,
    input_images: [realUrl],
    quality: "high",
    aspect_ratio: "2:3",
    output_format: "png",
  });

export const startMorph = (
  fromUrl: string,
  toUrl: string,
  fromLabel: string,
  toLabel: string,
) =>
  startModel("bytedance/seedance-1-pro", {
    prompt: morphPrompt(fromLabel, toLabel),
    image: fromUrl,
    last_frame_image: toUrl,
    duration: 5,
    resolution: "1080p",
    aspect_ratio: "9:16",
    camera_fixed: true,
  });

// ── Supabase (REST, service key — bypasses RLS) ──────────────────────────────

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

export interface MorphJob {
  id: string;
  email: string;
  status: string;
  step?: string;
  src_url?: string;
  real_url?: string;
  construction_url?: string;
  real_pred?: string;
  cons_pred?: string;
  morph1_pred?: string;
  morph2_pred?: string;
  morph1_url?: string;
  morph2_url?: string;
  video_url?: string;
  error?: string;
}

export async function sbInsert(row: Partial<MorphJob>): Promise<void> {
  const r = await fetch(`${SB}/rest/v1/morph_jobs`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!r.ok)
    throw new Error(
      "sbInsert " + r.status + " " + (await r.text()).slice(0, 200),
    );
}

export async function sbGet(id: string): Promise<MorphJob | null> {
  const r = await fetch(
    `${SB}/rest/v1/morph_jobs?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: sbHeaders },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? (rows[0] as MorphJob) : null;
}

export async function sbPatch(
  id: string,
  fields: Partial<MorphJob>,
): Promise<void> {
  await fetch(`${SB}/rest/v1/morph_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

/** Atomic status claim: flip from->to only if still at `from`. Returns true if
 *  THIS caller won the transition (used so only one invocation runs concat). */
export async function sbClaim(
  id: string,
  from: string,
  to: string,
): Promise<boolean> {
  const r = await fetch(
    `${SB}/rest/v1/morph_jobs?id=eq.${encodeURIComponent(id)}&status=eq.${from}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        status: to,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

/** Upload the finished reel to the public morph-reels bucket; return its URL. */
export async function sbUploadReel(path: string, buf: Buffer): Promise<string> {
  const r = await fetch(`${SB}/storage/v1/object/morph-reels/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!r.ok)
    throw new Error(
      "sbUploadReel " + r.status + " " + (await r.text()).slice(0, 200),
    );
  return `${SB}/storage/v1/object/public/morph-reels/${path}`;
}
