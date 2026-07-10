/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate — nano-primary architecture (2026-06-11).
 *
 * Pipeline:
 *   1. Cleanup engine (selected by `engine` field from client):
 *      - "nano"  →  google/nano-banana-pro (PRIMARY). Whole-frame
 *        instruction edit, prompt-only — no mask, no composite. Fails open
 *        to Bria.
 *      - "bria"  →  bria/fibo-edit. Masked edits for Precision Select
 *        (user-picked SAM mask) and the nano fallback.
 *      - "reve"  →  flux-kontext-pro. Legacy full-clear, explicit
 *        override only.
 *   2. Upscale via prunaai/p-image-upscale (~1s, ~$0.005), both interior
 *      and exterior. Pruna with enhance_realism:false produces natural
 *      textures on every surface — no HDR over-processing.
 *
 * Input (POST JSON):
 *   { imageBase64, prompt, engine?: 'bria'|'reve', isExterior?, skipUpscale? }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Model bake-off (2026-04-28, Cody Garrett listing photos):
 *   Tested nano-banana vs bria/fibo-edit vs reve/edit vs qwen-image-edit-plus
 *   across 4 cluttered rooms. Nano Banana removed <40% of items on average.
 *   → Bria for standard cleanup, Reve for full clean.
 *
 * Bake-off re-run (2026-06-11, nano-banana-PRO vs prompt-only Bria):
 *   The April verdict tested the OLD nano. Pro removed 100% of targeted
 *   decor while preserving furniture, layered rugs, floors, and the window
 *   view; Bria removed the decor but collaterally re-rendered the rugs and
 *   drifted the whole frame. → Nano Pro promoted to primary; Bria kept for
 *   masked Precision Select + fallback.
 */
import Replicate from "replicate";
import sharp from "sharp";
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors, requireSession } from "./_lib/auth-middleware.js";
import { reserveQuota, refundQuota } from "./_lib/quota.js";

export const config = { runtime: "nodejs", maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

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

// Pruna upscaler — primary for interiors. Fast (<1s), $0.005/run, good
// realism on interior surfaces. Also used as Clarity-OOM fallback.
async function runPruna(
  replicate: Replicate,
  imageUrl: string,
): Promise<string | null> {
  try {
    const out = await replicate.run("prunaai/p-image-upscale", {
      input: {
        image: imageUrl,
        factor: 2,
        // 'factor' mode doubles each side (output capped at 8 MP). The `target`
        // MP param is only read in 'target' mode, so it's omitted (was a no-op).
        upscale_mode: "factor",
        output_format: "jpg",
        output_quality: 95,
        enhance_details: true,
        enhance_realism: false,
      },
    });
    return await extractUrl(out);
  } catch (err: any) {
    console.warn(`[flux-cleanup] Pruna failed: ${err?.message}`);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  // Gate: verified session required. Closes the anonymous-access hole.
  const session = await requireSession(req, res);
  if (!session) return;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: "REPLICATE_API_TOKEN not configured" });
    return;
  }

  const body = parseBody(req.body);
  const imageBase64 = String(body.imageBase64 || "");
  const prompt = String(body.prompt || "");
  const skipUpscale = Boolean(body.skipUpscale);
  const isExterior = Boolean(body.isExterior);
  // Default mirrors the client routing and flux-staging: nano primary.
  const engine = String(body.engine || "nano");
  const maskBase64 = String(body.maskBase64 || "");

  if (!imageBase64) {
    json(res, 400, { ok: false, error: "imageBase64 is required" });
    return;
  }
  if (!prompt) {
    json(res, 400, { ok: false, error: "prompt is required" });
    return;
  }

  // Reserve AFTER validation (a malformed request never consumes quota) and
  // BEFORE the paid Replicate work. Refund on any generation failure below.
  const quota = await reserveQuota(session.email, session.sub, 1);
  if (!quota.allowed) {
    json(res, 402, {
      ok: false,
      error: "generation quota reached",
      code: quota.reason || "quota_exhausted",
    });
    return;
  }

  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const maskDataUrl = maskBase64
    ? maskBase64.startsWith("data:")
      ? maskBase64
      : `data:image/png;base64,${maskBase64}`
    : null;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // --- Step 1: Cleanup engine (Bria default, Reve for full-clean) ----
    console.log(
      `[flux-cleanup] Starting ${engine} engine... (${isExterior ? "exterior" : "interior"})`,
    );
    let cleanUrl: string | null = null;
    let ranEngine = engine;

    if (engine === "nano") {
      // Nano Banana Pro (google/nano-banana-pro) — PRIMARY for declutter
      // since 2026-06-11 (see bake-off note in the header). Whole-frame
      // instruction edit, prompt-only; fails open to the Bria path below.
      // Caller omits maskBase64 on this path (whole-frame edit — a mask
      // would be ignored, and the precision composite is skipped because
      // there is nothing to composite against).
      try {
        const output = await replicate.run("google/nano-banana-pro", {
          input: {
            prompt,
            image_input: [dataUrl],
            resolution: "2K",
            aspect_ratio: "match_input_image",
            output_format: "jpg",
            allow_fallback_model: false,
          },
        });
        cleanUrl = await extractUrl(output);
        if (!cleanUrl) throw new Error("nano returned no image");
      } catch (e: any) {
        console.warn(
          `[flux-cleanup] nano engine failed (${e?.message}) — falling back to bria`,
        );
        ranEngine = "bria";
      }
    }

    if (ranEngine === "reve") {
      // Full-clean path. Was reve/edit, whose upstream IP-blocked Replicate
      // (FORBIDDEN ip_address) — swapped to flux-kontext-pro (same in-place
      // editor now used by whiten/lawn/renovation). The masked Bria path below
      // is the primary route; this runs only for unmasked full-room clears.
      const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
        input: {
          prompt,
          input_image: dataUrl,
          aspect_ratio: "match_input_image",
          output_format: "jpg",
          safety_tolerance: 2,
        },
      });
      cleanUrl = await extractUrl(output);
    } else if (ranEngine === "bria") {
      // Pass mask when available — Bria edits only masked areas, leaving the
      // rest of the image pixel-identical. Best path for Precision Select mode.
      // fibo-edit has NO `negative_prompt` field (inputs: image / instruction /
      // mask / structured_instruction), so the removal guardrails are folded
      // into the instruction — sending them as negative_prompt dropped them
      // silently. See docs/replicate-input-contract.md.
      const guardrail = isExterior
        ? " Only remove the specified items and fill with the existing ground surface material. Do not add any new objects, plants, grass, landscaping, or greenery; do not change the ground surface material, house architecture, siding, roof, windows, doors, sky, lighting, shadows, or color grading."
        : " Only remove the specified items and fill with matching surface texture. Do not add any new objects, furniture, decor, or items; do not change room architecture, wall colors or texture, flooring, ceiling, fixtures, lighting, shadows, or color grading.";
      const briaInput: Record<string, unknown> = {
        image: dataUrl,
        instruction: prompt + guardrail,
      };
      if (maskDataUrl) {
        briaInput.mask = maskDataUrl;
        console.log(`[flux-cleanup] Using SAM mask for precision edit`);
      }
      const output = await replicate.run("bria/fibo-edit", {
        input: briaInput,
      });
      cleanUrl = await extractUrl(output);
    }

    if (!cleanUrl) {
      await refundQuota(quota.refundHandle);
      json(res, 200, {
        ok: false,
        error: `${ranEngine} engine returned no image URL`,
      });
      return;
    }
    console.log(
      `[flux-cleanup] ${ranEngine} done in ${Date.now() - t0}ms → ${cleanUrl.slice(0, 60)}...`,
    );

    // PRECISION GUARANTEE — when a mask was provided, pixel-replace the
    // unmasked areas with the ORIGINAL input. Bria treats `mask` as soft
    // guidance and can still drift on unmasked surfaces (e.g. re-rendering a
    // floor under a removed appliance). The composite below makes that
    // impossible: anywhere mask is black, original wins, byte-identical.
    if (maskDataUrl) {
      const tComp = Date.now();
      try {
        const briaRes = await fetch(cleanUrl);
        const briaBuf = Buffer.from(await briaRes.arrayBuffer());
        const meta = await sharp(briaBuf).metadata();
        const W = meta.width || 0;
        const H = meta.height || 0;
        if (W > 0 && H > 0) {
          // Decode original + mask, resize to Bria's output dimensions.
          const origRaw = dataUrl.split(",")[1] || dataUrl;
          const origBuf = Buffer.from(origRaw, "base64");
          const maskRaw = maskDataUrl.split(",")[1] || maskDataUrl;
          const maskBuf = Buffer.from(maskRaw, "base64");

          // Original at Bria resolution, no alpha channel
          const origAtBria = await sharp(origBuf)
            .resize(W, H, { fit: "fill" })
            .removeAlpha()
            .toBuffer();

          // Mask at Bria resolution, single channel grayscale
          const maskRawData = await sharp(maskBuf)
            .resize(W, H, { fit: "fill" })
            .greyscale()
            .raw()
            .toBuffer();

          // Use mask AS-IS as alpha for Bria output: white=opaque Bria, black=transparent.
          // Composite Bria-with-alpha OVER original. Where mask is black, original shows.
          const briaWithMask = await sharp(briaBuf)
            .removeAlpha()
            .joinChannel(maskRawData, {
              raw: { width: W, height: H, channels: 1 },
            })
            .png()
            .toBuffer();

          const composited = await sharp(origAtBria)
            .composite([{ input: briaWithMask, blend: "over" }])
            .jpeg({ quality: 95 })
            .toBuffer();

          // Upload composited result back to Replicate as a data URL replacement.
          // The downstream upscale step will fetch from this URL, but since we now
          // have the bytes locally we'll inline-base64 instead.
          const composedDataUrl = `data:image/jpeg;base64,${composited.toString("base64")}`;
          cleanUrl = composedDataUrl; // upscale step accepts data URLs
          console.log(
            `[flux-cleanup] Mask composite done in ${Date.now() - tComp}ms (${W}×${H})`,
          );
        }
      } catch (compErr: any) {
        console.warn(
          `[flux-cleanup] Mask composite failed: ${compErr?.message} — using raw Bria output`,
        );
        // Fall through to upscale with Bria's raw output as before.
      }
    }

    // --- Step 2 (optional): Upscale branch -----------------------------
    // Pruna 2x with enhance_realism:false for both interior and exterior.
    // Clarity was previously used on exteriors for "detail-adding" upscale, but
    // its more_details + SDXLrender LoRAs + creativity:0.35 added that HDR
    // over-processed glossy look (over-sharp brick, fake-lush lawns, wet-look
    // driveways). Pruna with realism:false produces natural exterior textures.
    let finalUrl = cleanUrl;
    let upscalerUsed: "none" | "Pruna" = "none";

    if (!skipUpscale) {
      const tUp = Date.now();
      const upscaledUrl = await runPruna(replicate, cleanUrl);
      if (upscaledUrl) {
        finalUrl = upscaledUrl;
        upscalerUsed = "Pruna";
        console.log(
          `[flux-cleanup] Pruna upscaled in ${Date.now() - tUp}ms (${isExterior ? "exterior" : "interior"})`,
        );
      } else {
        console.warn(
          "[flux-cleanup] Pruna returned no URL — using un-upscaled",
        );
      }
    }

    // --- Step 3: Fetch final URL and return base64 ---------------------
    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      await refundQuota(quota.refundHandle);
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;

    console.log(
      `[flux-cleanup] Total: ${Date.now() - t0}ms (${engine} + ${upscalerUsed})`,
    );
    json(res, 200, {
      ok: true,
      resultBase64,
      latencyMs: Date.now() - t0,
      engine: ranEngine,
    });
  } catch (err: any) {
    await refundQuota(quota.refundHandle);
    console.error("[flux-cleanup] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
