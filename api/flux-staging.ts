/**
 * api/flux-staging.ts  —  Virtual staging via Seedream 4 + furniture-lock composite
 *
 * Generate: bytedance/seedream-4 — the strongest scene-preserving editor in
 * the 2026-06-10 bake. History: flux-2-pro regenerated the whole scene →
 * reve/edit (faithful, then upstream IP-blocked Replicate) → Seedream 4.
 *
 * FURNITURE-LOCK COMPOSITE (2026-06-11): Seedream still re-renders the whole
 * frame — global tone ran 7-10% hot and surfaces micro-drift. Prompt rules
 * only *discourage* that; the composite makes it impossible:
 *   1. lang-segment-anything (Grounding DINO + SAM) masks FURNITURE in the
 *      staged output (semantic — pixel-diff masking fails on low-contrast
 *      furniture like a white duvet on beige carpet; validated 2026-06-11).
 *   2. Mask is dilated (catch contact shadows) and feathered.
 *   3. Staged frame is tone-matched to the original (per-channel gain from
 *      outside-mask pixels, clamped ±12%) — kills the wall-halo + tone drift.
 *   4. Per-pixel blend: furniture from staged, EVERYTHING else is the
 *      original input pixels — floor, walls, windows, fixtures byte-faithful.
 * Fails OPEN at every step: any error / implausible mask coverage (<2% or
 * >90%) returns the raw staged frame, never blocks generation.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from "replicate";
import sharp from "sharp";
import {
  json,
  setCors,
  handleOptions,
  rejectMethod,
  parseBody,
} from "./utils.js";

export const config = { runtime: "nodejs", maxDuration: 180 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

// Community model — predictions require the pinned version hash.
const LANG_SAM =
  "tmappdev/lang-segment-anything:891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc";

const FURNITURE_MASK_PROMPT =
  "furniture, sofa, sectional, couch, bed, headboard, pillow, blanket, nightstand, dresser, " +
  "coffee table, side table, dining table, chair, bench, stool, lamp, rug, artwork, " +
  // NOTE: "curtains" deliberately excluded — it matches existing blinds/window
  // treatments, keeping Seedream's re-render of them (verified on the dining
  // room preview test). Existing window treatments are room, not furniture.
  "picture frame, wall art, mirror, plant, tree, planter, vase, decor, media console, bookshelf";

// Composite tuning — validated 2026-06-11 on bedroom + two marble great rooms.
const MASK_BINARIZE = 8; // lang-sam instance grays → any non-black is furniture
const DILATE_PX = 8; // grow mask to catch contact shadows
const FEATHER_PX = 10; // soft blend boundary
const TONE_CLAMP = 0.12; // max ±12% per-channel tone correction

// ── INPAINT ENGINE (R2 rebuild, 2026-06-11) ─────────────────────────────────
// Cut-and-paste from a Seedream re-imagined frame produced furniture that was
// geometrically coherent with a room that doesn't exist ("looks real, doesn't
// fit the space" + phantom-room pastes — user's bonus-room failure). FLUX Fill
// inverts the problem: the ORIGINAL photo is the canvas, a floor-region mask
// defines where furniture may appear, and the model generates INSIDE it with
// the real walls/floor/perspective as fixed context. Geometry cannot drift.
// The furniture-lock composite then restores the floor inside the mask
// (Fill re-renders it), which is registration-safe here because the fill
// frame IS the original's geometry. Seedream remains the fallback engine.
const FLUX_FILL = "black-forest-labs/flux-fill-pro";

/** Extract room/style/furniture from the app's staging prompt and build the
 *  positive description Fill wants (it needs "what to paint", not rules). */
function buildInpaintPrompt(stagingPrompt: string): string {
  const room =
    stagingPrompt.match(/to this ([a-z &-]+?) to virtually stage/i)?.[1] ||
    "room";
  const style =
    stagingPrompt.match(/stage it in (.+?) style/i)?.[1] || "modern";
  const furniture = (
    stagingPrompt.split(/FURNITURE TO ADD:\s*/i)[1] || ""
  ).trim();
  return (
    `A professionally staged ${style} ${room}: ${furniture} ` +
    `Premium real-estate listing photography. Furniture perfectly scaled to the room and resting naturally on the floor. ` +
    `Photorealistic, shadows matching the room's existing natural light direction. ` +
    `Do NOT add any windows, doors, vents, radiators, or architectural features — only freestanding furniture and decor.`
  ).slice(0, 2500);
}

/** Floor-region inpaint mask: lang-sam floor on the ORIGINAL, expanded upward
 *  for furniture height, edges softened. Returns PNG buffer at original dims.
 *  Throws on failure — caller falls back to the Seedream engine. */
async function buildInpaintMask(
  replicate: Replicate,
  originalBuf: Buffer,
  W: number,
  H: number,
): Promise<{ png: Buffer; floorRaw: Buffer }> {
  const out = await replicate.run(LANG_SAM as `${string}/${string}:${string}`, {
    input: {
      image: `data:image/jpeg;base64,${originalBuf.toString("base64")}`,
      text_prompt: "floor, carpet, rug, tile floor, wood floor",
    },
  });
  const url = await extractUrl(out);
  if (!url) throw new Error("floor mask: no URL");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`floor mask fetch ${res.status}`);
  const maskPngRaw = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(maskPngRaw)
    .resize(W, H, { fit: "cover" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const floor = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++)
    floor[p] = data[p * info.channels] > 8 ? 255 : 0;
  let on = 0;
  for (const v of floor) if (v) on++;
  const cov = on / (W * H);
  if (cov < 0.08 || cov > 0.85)
    throw new Error(`floor coverage implausible ${(cov * 100).toFixed(1)}%`);

  // Expand upward (shift-union) so beds/headboards/art zones are paintable.
  const grown = Buffer.from(floor);
  for (const f of [0.08, 0.16, 0.24, 0.32]) {
    const shift = Math.round(H * f);
    for (let y = 0; y < H - shift; y++) {
      const src = (y + shift) * W,
        dst = y * W;
      for (let x = 0; x < W; x++) if (floor[src + x]) grown[dst + x] = 255;
    }
  }
  let soft = await sharp(grown, { raw: { width: W, height: H, channels: 1 } })
    .blur(6)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let i = 0; i < soft.length; i++) soft[i] = soft[i] > 100 ? 255 : 0;
  // CEILING CLAMP — lang-sam's floor occasionally over-matches high planes;
  // expanded upward that let Fill repaint the ceiling/fan (gray-band + phantom
  // blades, v3 eval). No furniture needs the top 22% of frame: hard-zero it.
  soft.fill(0, 0, Math.round(H * 0.22) * W);
  const png = await sharp(soft, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
  return { png, floorRaw: floor };
}

/**
 * FLOOR-RESTORE composite (inpaint engine only). Outside the inpaint mask the
 * frame is already original BY CONSTRUCTION, so the only restoration needed:
 *   restore = (floor ∪ window/door-protect) ∧ NOT furniture
 * Restoring "everything except furniture" (the Seedream-era lock) punches
 * holes through furniture wherever the furniture mask under-recalls — the
 * transparent-bed defect. The protect mask kills hallucinated windows/doors
 * that survive via furniture-mask false positives ("mirror"/"wall art").
 */
async function floorRestoreComposite(
  originalBuf: Buffer,
  fillBuf: Buffer,
  floorRaw: Buffer,
  furnitureMaskBuf: Buffer,
  protectMaskBuf: Buffer | null,
  W: number,
  H: number,
): Promise<Buffer> {
  const toRaw1 = async (buf: Buffer): Promise<Buffer> => {
    const { data, info } = await sharp(buf)
      .resize(W, H, { fit: "cover" })
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++)
      out[p] = data[p * info.channels] > MASK_BINARIZE ? 255 : 0;
    return out;
  };
  const furn0 = await toRaw1(furnitureMaskBuf);
  // dilate furniture so contact shadows stay with the furniture
  let furn = await sharp(furn0, { raw: { width: W, height: H, channels: 1 } })
    .blur(DILATE_PX)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let i = 0; i < furn.length; i++) furn[i] = furn[i] > 20 ? 255 : 0;

  // INTERIOR-HOLE FILL — a region enclosed by furniture cannot be background.
  // lang-sam under-recalls low-contrast interiors (white duvet on white bed),
  // which previously punched see-through holes in furniture. Flood-fill the
  // background from the frame border; any non-furniture pixel NOT reached is
  // an enclosed hole → furniture.
  {
    const reach = new Uint8Array(W * H);
    const qx = new Int32Array(W * H);
    let head = 0,
      tail = 0;
    const push = (idx: number) => {
      if (!reach[idx] && !furn[idx]) {
        reach[idx] = 1;
        qx[tail++] = idx;
      }
    };
    for (let x = 0; x < W; x++) {
      push(x);
      push((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      push(y * W);
      push(y * W + W - 1);
    }
    while (head < tail) {
      const i = qx[head++];
      const x = i % W,
        y = (i / W) | 0;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W);
      if (y < H - 1) push(i + W);
    }
    let filled = 0;
    for (let i = 0; i < W * H; i++) {
      if (!furn[i] && !reach[i]) {
        furn[i] = 255;
        filled++;
      }
    }
    if (filled > 0)
      console.log(
        `[flux-staging] hole-fill closed ${((filled / (W * H)) * 100).toFixed(2)}% enclosed furniture holes`,
      );
  }
  let cov = 0;
  for (const v of furn) if (v) cov++;
  console.log(
    `[flux-staging] floor-restore: furniture=${((cov / (W * H)) * 100).toFixed(1)}%`,
  );

  const protect = protectMaskBuf ? await toRaw1(protectMaskBuf) : null;

  const restore = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) {
    const want = floorRaw[p] || (protect && protect[p]);
    restore[p] = want && !furn[p] ? 255 : 0;
  }
  const feathered = await sharp(restore, {
    raw: { width: W, height: H, channels: 1 },
  })
    .blur(FEATHER_PX)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const orig = await sharp(originalBuf).ensureAlpha().raw().toBuffer();
  const fill = await sharp(fillBuf)
    .resize(W, H, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const a = feathered[p] / 255; // weight of ORIGINAL
    const inv = 1 - a;
    out[i] = fill[i] * inv + orig[i] * a;
    out[i + 1] = fill[i + 1] * inv + orig[i + 1] * a;
    out[i + 2] = fill[i + 2] * inv + orig[i + 2] * a;
    out[i + 3] = 255;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── Primary-furniture verify-and-retry gate ─────────────────────────────────
// QA batch 2026-06-11 (12 prod runs): Seedream occasionally IGNORES most of
// the furniture list — 3/12 runs delivered a bedroom with no bed / living
// room with no sofa. A staged room missing its primary piece is a failed
// result, so after generation we ask moondream (sub-second VQA, same model as
// classify-room) whether the primary item is present; if not, regenerate once.
const MOONDREAM =
  "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31";

/** Room type → the primary furniture that MUST be present after staging. */
function primaryFurnitureFor(prompt: string): string | null {
  // The staging prompt opens "Add furniture and decor to this {room} to
  // virtually stage it…" — extract the room from the prompt itself so the
  // endpoint contract stays unchanged.
  const m = prompt.match(/to this ([a-z &-]+?) to virtually stage/i);
  const room = (m?.[1] || "").toLowerCase();
  if (!room) return null;
  if (room.includes("bedroom")) return "a bed";
  if (room.includes("nursery")) return "a crib";
  if (room.includes("dining")) return "a dining table";
  if (room.includes("office")) return "a desk";
  if (
    room.includes("living") ||
    room.includes("bonus") ||
    room.includes("sunroom") ||
    room.includes("basement")
  )
    return "a sofa or couch";
  return null; // foyer/hallway/etc — no single mandatory piece
}

/** True if moondream sees the primary item in the staged frame. Fails open. */
async function hasPrimaryFurniture(
  replicate: Replicate,
  stagedDataUrl: string,
  item: string,
): Promise<boolean> {
  try {
    const out = await replicate.run(
      MOONDREAM as `${string}/${string}:${string}`,
      {
        input: {
          image: stagedDataUrl,
          prompt: `Does this image contain ${item}? Answer with exactly one word: yes or no.`,
        },
      },
    );
    const ans = (Array.isArray(out) ? out.join("") : String(out))
      .trim()
      .toLowerCase();
    return !ans.startsWith("no");
  } catch {
    return true; // verification unavailable → don't block
  }
}

/**
 * Furniture-lock composite: original pixels everywhere except the lang-sam
 * furniture mask (dilated + feathered), with the staged frame tone-matched to
 * the original first. Returns a JPEG buffer at the ORIGINAL's dimensions.
 * Throws on any failure — caller falls back to the raw staged frame.
 */
async function furnitureLockComposite(
  originalBuf: Buffer,
  stagedBuf: Buffer,
  maskBuf: Buffer,
): Promise<Buffer> {
  const om = await sharp(originalBuf).metadata();
  const W = om.width || 0;
  const H = om.height || 0;
  if (!W || !H) throw new Error("original metadata unreadable");

  // ASPECT GUARD — Seedream does not always honor the input aspect exactly.
  // fit:"fill" would STRETCH the staged frame to the original's dims, warping
  // furniture geometry ("looks real but doesn't fit the space"). fit:"cover"
  // center-crops instead — geometry preserved; identical transform must be
  // applied to the mask (it lives in the staged frame's coordinate system).
  const sm = await sharp(stagedBuf).metadata();
  const stagedAspect = (sm.width || 1) / (sm.height || 1);
  const origAspect = W / H;
  const aspectDelta = Math.abs(stagedAspect - origAspect) / origAspect;
  if (aspectDelta > 0.015) {
    console.warn(
      `[flux-staging] ASPECT MISMATCH staged ${sm.width}x${sm.height} (${stagedAspect.toFixed(3)}) vs input ${W}x${H} (${origAspect.toFixed(3)}) — cover-cropping, delta=${(aspectDelta * 100).toFixed(1)}%`,
    );
  }
  if (aspectDelta > 0.12) {
    // The model recomposed the scene — a crop can't fix that. Refuse to
    // composite a mis-registered frame; caller ships the raw staged result.
    throw new Error(
      `staged aspect ${stagedAspect.toFixed(3)} too far from input ${origAspect.toFixed(3)}`,
    );
  }

  // Mask → single channel at original dims, binarized.
  // extractChannel(0) is load-bearing: sharp promotes 1-ch raw to 3-ch
  // through blur/resize, which silently garbles every downstream buffer.
  const { data: mRaw, info: mInfo } = await sharp(maskBuf)
    .resize(W, H, { fit: "cover" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) {
    mask[p] = mRaw[p * mInfo.channels] > MASK_BINARIZE ? 255 : 0;
  }
  let on = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p]) on++;
  const coverage = on / (W * H);
  console.log(
    `[flux-staging] furniture mask coverage=${(coverage * 100).toFixed(1)}%`,
  );
  if (coverage < 0.02 || coverage > 0.9) {
    throw new Error(
      `implausible mask coverage ${(coverage * 100).toFixed(1)}%`,
    );
  }

  // Dilate (blur + re-binarize) then feather.
  let dil = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(DILATE_PX)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let i = 0; i < dil.length; i++) dil[i] = dil[i] > 20 ? 255 : 0;
  const feathered = await sharp(dil, {
    raw: { width: W, height: H, channels: 1 },
  })
    .blur(FEATHER_PX)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const prior = await sharp(originalBuf).ensureAlpha().raw().toBuffer();
  const staged = await sharp(stagedBuf)
    .resize(W, H, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Tone-match staged → original on outside-mask pixels (sampled).
  let so = [0, 0, 0],
    po = [0, 0, 0],
    n = 0;
  for (let p = 0, i = 0; p < W * H; p += 7, i += 28) {
    if (feathered[p] < 16) {
      so[0] += staged[i];
      so[1] += staged[i + 1];
      so[2] += staged[i + 2];
      po[0] += prior[i];
      po[1] += prior[i + 1];
      po[2] += prior[i + 2];
      n++;
    }
  }
  if (n > 5000) {
    const gain = [0, 1, 2].map((c) =>
      Math.min(
        1 + TONE_CLAMP,
        Math.max(1 - TONE_CLAMP, po[c] / n / Math.max(1, so[c] / n)),
      ),
    );
    console.log(
      `[flux-staging] tone-match gain RGB=${gain.map((g) => g.toFixed(3)).join(",")}`,
    );
    for (let i = 0; i < staged.length; i += 4) {
      staged[i] = Math.min(255, staged[i] * gain[0]);
      staged[i + 1] = Math.min(255, staged[i + 1] * gain[1]);
      staged[i + 2] = Math.min(255, staged[i + 2] * gain[2]);
    }
  }

  // Blend: furniture (mask) from staged, everything else original pixels.
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const a = feathered[p] / 255;
    const inv = 1 - a;
    out[i] = prior[i] * inv + staged[i] * a;
    out[i + 1] = prior[i + 1] * inv + staged[i + 1] * a;
    out[i + 2] = prior[i + 2] * inv + staged[i + 2] * a;
    out[i + 3] = 255;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function extractUrl(output: unknown): Promise<string | null> {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return extractUrl(output[0]);
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "function") {
      try {
        const u = (o.url as () => unknown)();
        return typeof u === "string" ? u : String(u);
      } catch {
        return null;
      }
    }
    if (typeof o.url === "string") return o.url;
  }
  return null;
}

async function runPruna(
  replicate: Replicate,
  imageUrl: string,
): Promise<string | null> {
  try {
    const out = await replicate.run("prunaai/p-image-upscale", {
      input: {
        image: imageUrl,
        factor: 2,
        // upscale_mode 'factor' doubles each side (output capped at 8 MP); the
        // `target` MP param is only read in 'target' mode, so it's omitted here.
        upscale_mode: "factor",
        output_format: "jpg",
        output_quality: 95,
        enhance_details: true,
        enhance_realism: false,
      },
    });
    return extractUrl(out);
  } catch (err: any) {
    console.warn(`[flux-staging] Pruna failed: ${err?.message}`);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  setCors(res, "POST,OPTIONS");
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, "POST")) return;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: "REPLICATE_API_TOKEN not configured" });
    return;
  }

  const body = parseBody(req.body);
  const imageBase64 = String(body.imageBase64 || "");
  // Seedream has no hard instruction cap (reve/edit's was 2560); the staging
  // prompt builder already self-trims to ~2558, so this clamp is a generous
  // safety bound, not a binding limit.
  const prompt = String(body.prompt || "").slice(0, 5000);
  const skipUpscale = Boolean(body.skipUpscale);

  if (!imageBase64) {
    json(res, 400, { ok: false, error: "imageBase64 is required" });
    return;
  }
  if (!prompt) {
    json(res, 400, { ok: false, error: "prompt is required" });
    return;
  }

  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // Seedream 4 edits the supplied image in place with the strongest scene
    // preservation of the editors we tested (2026-06-10 bake): on an empty
    // marble great room it KEPT the marble floor, the cool/bright white tone,
    // the kitchen niche, and the ceiling fixture, changing only the furniture —
    // where Kontext drifted the marble to wood and warmed the tone. Critical
    // params: `enhance_prompt:false` (left true it rewrites our preservation
    // prompt and reintroduces drift), `aspect_ratio:match_input_image` (locks
    // framing), `size:4K` (output tracks input resolution — feed the largest
    // input the body limit allows; see stagingService FLUX_UPLOAD_MAX_EDGE).
    // Replaces reve/edit, whose upstream IP-blocked Replicate's egress
    // (FORBIDDEN ip_address) — staging had been silently down on that path.
    // ENGINE 1 — FLUX Fill inpaint (geometry locked by construction).
    // ENGINE 2 (fallback) — Seedream whole-frame edit (legacy path).
    const originalBuf = Buffer.from(
      dataUrl.split(",")[1] || imageBase64,
      "base64",
    );
    const oMeta = await sharp(originalBuf).metadata();
    const oW = oMeta.width || 0;
    const oH = oMeta.height || 0;

    const generateSeedream = async (p: string): Promise<Buffer | null> => {
      const output = await replicate.run("bytedance/seedream-4", {
        input: {
          prompt: p,
          image_input: [dataUrl],
          size: "4K",
          aspect_ratio: "match_input_image",
          enhance_prompt: false,
        },
      });
      const genUrl = await extractUrl(output);
      if (!genUrl) return null;
      const r = await fetch(genUrl);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    };

    let inpaintMaskPng: Buffer | null = null;
    let floorRawMask: Buffer | null = null;
    const generateInpaint = async (p: string): Promise<Buffer | null> => {
      if (!inpaintMaskPng) {
        const m = await buildInpaintMask(replicate, originalBuf, oW, oH);
        inpaintMaskPng = m.png;
        floorRawMask = m.floorRaw;
      }
      const output = await replicate.run(FLUX_FILL, {
        input: {
          image: dataUrl,
          mask: `data:image/png;base64,${inpaintMaskPng!.toString("base64")}`,
          prompt: buildInpaintPrompt(p),
          steps: 50,
          guidance: 60,
          output_format: "jpg",
          safety_tolerance: 2,
        },
      });
      const genUrl = await extractUrl(output);
      if (!genUrl) return null;
      const r = await fetch(genUrl);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    };

    let engine = "flux-fill";
    const generate = async (p: string = prompt): Promise<Buffer | null> => {
      if (engine === "flux-fill") {
        try {
          const b = await generateInpaint(p);
          if (b) return b;
          throw new Error("fill returned no image");
        } catch (e: any) {
          console.warn(
            `[flux-staging] fill engine failed (${e?.message}) — falling back to seedream`,
          );
          engine = "seedream";
        }
      }
      return generateSeedream(p);
    };

    console.log("[flux-staging] Starting staging (engine: flux-fill)...");
    let resultBuf = await generate();
    if (!resultBuf) {
      json(res, 200, { ok: false, error: "staging engine returned no image" });
      return;
    }
    console.log(`[flux-staging] ${engine} generation done in ${Date.now() - t0}ms`);

    // Verify-and-retry gate: Seedream under-stages (no bed in a bedroom) when
    // the room's purpose isn't visually obvious — measured at ~50% per try on
    // a worst-case bedroom before the prompt fix. Up to 2 corrective retries;
    // each retry prepends an explicit failure callout, which steers the model
    // far harder than the base prompt. Fail-open: the last frame always ships.
    const primary = primaryFurnitureFor(prompt);
    if (primary) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await hasPrimaryFurniture(
          replicate,
          `data:image/jpeg;base64,${resultBuf.toString("base64")}`,
          primary,
        );
        if (ok) {
          if (attempt > 0)
            console.log(
              `[flux-staging] retry ${attempt} PASSED (${primary} present)`,
            );
          break;
        }
        if (attempt === 2) {
          console.warn(
            `[flux-staging] ${primary} still missing after 2 retries — shipping last frame`,
          );
          break;
        }
        console.warn(
          `[flux-staging] staged frame missing ${primary} — corrective retry ${attempt + 1}`,
        );
        const retryPrompt =
          `RETRY — your previous attempt FAILED because it did not include ${primary}. ` +
          `Including ${primary.toUpperCase()} is MANDATORY and is the single most important requirement.\n\n` +
          prompt;
        const second = await generate(retryPrompt);
        if (!second) break;
        resultBuf = second;
      }
    }

    // COMPOSITE — engine-specific contract, fails open to the raw frame.
    try {
      const tComp = Date.now();
      const stagedDataUrl = `data:image/jpeg;base64,${resultBuf.toString("base64")}`;
      const maskOut = await replicate.run(
        LANG_SAM as `${string}/${string}:${string}`,
        {
          input: { image: stagedDataUrl, text_prompt: FURNITURE_MASK_PROMPT },
        },
      );
      const maskUrl = await extractUrl(maskOut);
      if (!maskUrl) throw new Error("lang-sam returned no mask URL");
      const maskRes = await fetch(maskUrl);
      if (!maskRes.ok) throw new Error(`mask fetch ${maskRes.status}`);
      const maskBuf = Buffer.from(await maskRes.arrayBuffer());

      if (engine === "flux-fill" && floorRawMask) {
        // window/door hard-protect (kills hallucinated architecture that the
        // furniture mask would otherwise keep via "mirror"/"wall art")
        let protectBuf: Buffer | null = null;
        try {
          const pOut = await replicate.run(
            LANG_SAM as `${string}/${string}:${string}`,
            {
              input: {
                image: `data:image/jpeg;base64,${originalBuf.toString("base64")}`,
                text_prompt: "window, door, doorway, glass door, french doors, ceiling, ceiling fan, light fixture, chandelier",
              },
            },
          );
          const pUrl = await extractUrl(pOut);
          if (pUrl) {
            const pRes = await fetch(pUrl);
            if (pRes.ok) protectBuf = Buffer.from(await pRes.arrayBuffer());
          }
        } catch {
          /* protect mask optional */
        }
        resultBuf = await floorRestoreComposite(
          originalBuf,
          resultBuf,
          floorRawMask,
          maskBuf,
          protectBuf,
          oW,
          oH,
        );
        console.log(
          `[flux-staging] floor-restore composite done in ${Date.now() - tComp}ms`,
        );
      } else {
        resultBuf = await furnitureLockComposite(originalBuf, resultBuf, maskBuf);
        console.log(
          `[flux-staging] furniture-lock composite done in ${Date.now() - tComp}ms`,
        );
      }
    } catch (compErr: any) {
      console.warn(
        `[flux-staging] composite failed (${compErr?.message}) — returning raw staged frame`,
      );
    }

    // Upscale via Pruna — on the COMPOSITED frame so the export inherits the
    // locked pixels. Skipped during the editing phase (export upscales once).
    if (!skipUpscale) {
      const tUp = Date.now();
      const upscaledUrl = await runPruna(
        replicate,
        `data:image/jpeg;base64,${resultBuf.toString("base64")}`,
      );
      if (upscaledUrl) {
        const upRes = await fetch(upscaledUrl);
        if (upRes.ok) {
          resultBuf = Buffer.from(await upRes.arrayBuffer());
          console.log(`[flux-staging] Pruna upscaled in ${Date.now() - tUp}ms`);
        }
      } else {
        console.warn("[flux-staging] Pruna failed — returning un-upscaled");
      }
    }

    const resultBase64 = `data:image/jpeg;base64,${resultBuf.toString("base64")}`;
    console.log(`[flux-staging] Total: ${Date.now() - t0}ms`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    console.error("[flux-staging] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
