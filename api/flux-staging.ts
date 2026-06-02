/**
 * api/flux-staging.ts  —  Virtual staging via reve/edit
 *
 * Uses reve/edit (the same faithful in-place editor as whiten/lawn/cleanup)
 * so staging preserves the room's perspective, walls, windows, and flooring
 * and only ADDS the furniture described in the style-DNA prompt. The previous
 * flux-2-pro path treated the photo as a style reference and regenerated the
 * whole scene, which shifted the camera angle and architecture. Output is
 * upscaled via the same Pruna pipeline as cleanup.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from "replicate";
import {
  json,
  setCors,
  handleOptions,
  rejectMethod,
  parseBody,
} from "./utils.js";

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

async function runPruna(
  replicate: Replicate,
  imageUrl: string,
): Promise<string | null> {
  try {
    const out = await replicate.run("prunaai/p-image-upscale", {
      input: {
        image: imageUrl,
        factor: 2,
        target: 5,
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
  // reve/edit caps edit_instruction at 2560 chars — clamp so a long style-DNA
  // brief never gets rejected (reve/edit preserves the room structurally, so
  // trimming the verbose tail is low-impact).
  const prompt = String(body.prompt || "").slice(0, 2560);
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
    // reve/edit edits the supplied image in place, so it preserves the input's
    // dimensions, perspective, and architecture natively — no aspect-ratio
    // detection or style-reference regeneration needed (same path as whiten/lawn).
    console.log("[flux-staging] Starting reve/edit staging...");
    const output = await replicate.run("reve/edit", {
      input: {
        image: dataUrl,
        prompt,
        output_format: "jpg",
      },
    });

    const genUrl = await extractUrl(output);
    if (!genUrl) {
      json(res, 200, { ok: false, error: "reve/edit returned no image URL" });
      return;
    }
    console.log(`[flux-staging] reve/edit done in ${Date.now() - t0}ms`);

    // Upscale via Pruna (interior default for staging).
    // Skipped during the editing phase — export upscales once at the end,
    // so an inline upscale here would be wasted double work.
    let finalUrl = genUrl;
    if (!skipUpscale) {
      const tUp = Date.now();
      const upscaledUrl = await runPruna(replicate, genUrl);
      if (upscaledUrl) {
        finalUrl = upscaledUrl;
        console.log(`[flux-staging] Pruna upscaled in ${Date.now() - tUp}ms`);
      } else {
        console.warn("[flux-staging] Pruna failed — returning un-upscaled");
      }
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;

    console.log(`[flux-staging] Total: ${Date.now() - t0}ms`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    console.error("[flux-staging] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
