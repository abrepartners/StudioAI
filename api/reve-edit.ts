/**
 * api/reve-edit.ts  —  Generic in-place image editing
 *
 * Powers staging, whiten, lawn, and renovation — instruction-following
 * edits that must preserve the room/composition rather than regenerate it.
 *
 * MODEL: black-forest-labs/flux-kontext-pro (instruction-based in-place
 * editor). Swapped off reve/edit on 2026-06-08: reve/edit's upstream
 * backend (Reve) began blocking Replicate's egress IPs with
 * FORBIDDEN {verb:access, noun:ip_address}, so every staging/whiten/lawn/
 * renovation generation failed post-prediction. The block is Replicate↔Reve,
 * above this app — not fixable from our side, so we moved to Kontext (same
 * provider as flux-2-pro, which is unaffected). Endpoint name kept as
 * /api/reve-edit so the 4 services need no change.
 *
 * Upscale branch mirrors flux-cleanup:
 *   - isExterior=true  → Clarity (with Pruna OOM fallback)
 *   - isExterior=false → Pruna
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from "replicate";
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors, requireServiceOrSession } from "./_lib/auth-middleware.js";
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
    console.warn(`[reve-edit] Pruna failed: ${err?.message}`);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  // Gate: verified session OR a machine service key (dormant unless SERVICE_API_KEY set).
  const session = await requireServiceOrSession(req, res);
  if (!session) return;
  const isService = (session as any).service === true;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: "REPLICATE_API_TOKEN not configured" });
    return;
  }

  const body = parseBody(req.body);
  const imageBase64 = String(body.imageBase64 || "");
  const prompt = String(body.prompt || "").slice(0, 2560); // prompts already tuned ≤2560 (reve-era cap); Kontext has no hard cap
  const isExterior = Boolean(body.isExterior);
  const skipUpscale = Boolean(body.skipUpscale);

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
  // Service (machine) calls are quota-exempt — metered upstream at Replicate.
  let quota: Awaited<ReturnType<typeof reserveQuota>> = {
    allowed: true,
    refundHandle: null,
  } as Awaited<ReturnType<typeof reserveQuota>>;
  if (!isService) {
    quota = await reserveQuota(session.email, session.sub, 1);
    if (!quota.allowed) {
      json(res, 402, {
        ok: false,
        error: "generation quota reached",
        code: quota.reason || "quota_exhausted",
      });
      return;
    }
  }

  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(
      `[reve-edit] Starting flux-kontext-pro (${isExterior ? "exterior" : "interior"})...`,
    );
    const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
      input: {
        input_image: dataUrl,
        prompt,
        aspect_ratio: "match_input_image",
        output_format: "jpg",
        safety_tolerance: 2,
      },
    });

    const editUrl = await extractUrl(output);
    if (!editUrl) {
      if (quota.refundHandle) await refundQuota(quota.refundHandle);
      json(res, 200, {
        ok: false,
        error: "flux-kontext-pro returned no image URL",
      });
      return;
    }
    console.log(`[reve-edit] kontext done in ${Date.now() - t0}ms`);

    // Pruna 2x with enhance_realism:false for both interior and exterior.
    // (See flux-cleanup.ts for the rationale on dropping Clarity from exteriors.)
    let finalUrl = editUrl;
    let upscalerUsed = "none";

    if (!skipUpscale) {
      const tUp = Date.now();
      const upUrl = await runPruna(replicate, editUrl);
      if (upUrl) {
        finalUrl = upUrl;
        upscalerUsed = "Pruna";
        console.log(
          `[reve-edit] Pruna upscaled in ${Date.now() - tUp}ms (${isExterior ? "exterior" : "interior"})`,
        );
      }
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      if (quota.refundHandle) await refundQuota(quota.refundHandle);
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;

    console.log(
      `[reve-edit] Total: ${Date.now() - t0}ms (upscaler: ${upscalerUsed})`,
    );
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    if (quota.refundHandle) await refundQuota(quota.refundHandle);
    console.error("[reve-edit] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
