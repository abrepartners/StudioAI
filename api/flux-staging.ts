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

  // Mask → single channel at original dims, binarized.
  // extractChannel(0) is load-bearing: sharp promotes 1-ch raw to 3-ch
  // through blur/resize, which silently garbles every downstream buffer.
  const { data: mRaw, info: mInfo } = await sharp(maskBuf)
    .resize(W, H, { fit: "fill" })
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
    .resize(W, H, { fit: "fill" })
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
    console.log("[flux-staging] Starting seedream-4 staging...");
    const output = await replicate.run("bytedance/seedream-4", {
      input: {
        prompt,
        image_input: [dataUrl],
        size: "4K",
        aspect_ratio: "match_input_image",
        enhance_prompt: false,
      },
    });

    const genUrl = await extractUrl(output);
    if (!genUrl) {
      json(res, 200, { ok: false, error: "seedream-4 returned no image URL" });
      return;
    }
    console.log(`[flux-staging] seedream-4 done in ${Date.now() - t0}ms`);

    const stagedRes = await fetch(genUrl);
    if (!stagedRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${stagedRes.status}` });
      return;
    }
    let resultBuf = Buffer.from(await stagedRes.arrayBuffer());

    // FURNITURE-LOCK COMPOSITE — fails open to the raw staged frame.
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

      const originalBuf = Buffer.from(
        dataUrl.split(",")[1] || imageBase64,
        "base64",
      );
      resultBuf = await furnitureLockComposite(originalBuf, resultBuf, maskBuf);
      console.log(
        `[flux-staging] furniture-lock composite done in ${Date.now() - tComp}ms`,
      );
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
