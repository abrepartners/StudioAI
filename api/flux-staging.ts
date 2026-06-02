/**
 * api/flux-staging.ts  —  Virtual staging via Flux 2 Pro
 *
 * Replaces the previous Gemini-based staging path. Uses flux-2-pro
 * for image-to-image generation with rich style DNA prompts, then
 * upscales via the same Clarity/Pruna pipeline as cleanup.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean, skipUpscale?: boolean }
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
  const prompt = String(body.prompt || "");
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
    // Detect aspect ratio from base64 image dimensions.
    // When dimensions can't be parsed, resolve null so we omit aspect_ratio
    // entirely and let Flux preserve the source's native ratio (rather than
    // silently forcing a 4:3 crop on an unknown-shape image).
    const dims = await new Promise<{ w: number; h: number } | null>(
      (resolve) => {
        const raw = dataUrl.split(",")[1] || "";
        const buf = Buffer.from(raw, "base64");
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        if (isPng && buf.length > 24) {
          resolve({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
        } else {
          for (let i = 0; i < buf.length - 9; i++) {
            if (
              buf[i] === 0xff &&
              (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)
            ) {
              resolve({
                w: buf.readUInt16BE(i + 7),
                h: buf.readUInt16BE(i + 5),
              });
              return;
            }
          }
          resolve(null);
        }
      },
    );

    const VALID_RATIOS = [
      { label: "1:1", v: 1 },
      { label: "4:3", v: 4 / 3 },
      { label: "3:2", v: 3 / 2 },
      { label: "16:9", v: 16 / 9 },
      { label: "21:9", v: 21 / 9 },
      { label: "3:4", v: 3 / 4 },
      { label: "2:3", v: 2 / 3 },
      { label: "9:16", v: 9 / 16 },
      { label: "9:21", v: 9 / 21 },
    ];
    const bestRatio = dims
      ? VALID_RATIOS.reduce((best, r) =>
          Math.abs(r.v - dims.w / dims.h) < Math.abs(best.v - dims.w / dims.h)
            ? r
            : best,
        )
      : null;

    console.log(
      `[flux-staging] Starting Flux 2 Pro staging... (${dims ? `${dims.w}x${dims.h} → ${bestRatio!.label}` : "native ratio"})`,
    );
    const fluxInput: Record<string, unknown> = {
      input_images: [dataUrl],
      prompt,
      output_format: "jpg",
    };
    if (bestRatio) fluxInput.aspect_ratio = bestRatio.label;
    const fluxOutput = await replicate.run("black-forest-labs/flux-2-pro", {
      input: fluxInput,
    });

    const genUrl = await extractUrl(fluxOutput);
    if (!genUrl) {
      json(res, 200, { ok: false, error: "Flux returned no image URL" });
      return;
    }
    console.log(`[flux-staging] Flux done in ${Date.now() - t0}ms`);

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
