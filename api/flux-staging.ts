/**
 * api/flux-staging.ts  —  Virtual staging via Seedream 4
 *
 * Uses bytedance/seedream-4 — the strongest scene-preserving editor in the
 * 2026-06-10 bake. It ADDS the furniture from the style-DNA prompt while
 * holding the floor material, white balance, architecture, and fixtures (the
 * exact regions Kontext drifted). History: flux-2-pro regenerated the whole
 * scene (camera/architecture shifted) → switched to reve/edit (faithful) →
 * reve/edit's upstream IP-blocked Replicate (FORBIDDEN ip_address), silently
 * breaking staging → now Seedream 4. Output upscaled via the Pruna pipeline.
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
