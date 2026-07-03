/**
 * api/flux-twilight.ts  —  DAY TO DUSK (v6, 2-axis: style × time of day)
 *
 * HISTORY:
 *  - v1-v4: see git log
 *  - v5: brightened all prompts toward civil twilight
 *  - v6 (this file): 2-axis system — 4 color styles × 3 times of day.
 *    Style controls the sky color palette (pink, golden, purple, natural).
 *    Time controls brightness and how far into dusk (early evening →
 *    sunset → twilight). Total = 12 prompt combinations.
 *
 * Input (POST JSON):
 *   { imageBase64: string, style: string, timeOfDay?: string, skipUpscale?: boolean }
 *   Legacy: style-only still works (maps to 'sunset' time)
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
  MOONDREAM,
} from "./utils.js";

// 180s: worst case is a failed nano-banana-pro attempt, a flux-2-pro pass,
// the moondream QC check, a corrective retry on the same engine, then the
// Pruna upscale — five sequential model calls.
export const config = { runtime: "nodejs", maxDuration: 180 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

type TwilightColorStyle = "pink" | "golden" | "purple" | "natural";
type TwilightTime = "early-evening" | "sunset" | "twilight";

const VALID_STYLES: ReadonlyArray<TwilightColorStyle> = [
  "pink",
  "golden",
  "purple",
  "natural",
];
const VALID_TIMES: ReadonlyArray<TwilightTime> = [
  "early-evening",
  "sunset",
  "twilight",
];

const LEGACY_MAP: Record<
  string,
  { style: TwilightColorStyle; time: TwilightTime }
> = {
  "warm-classic": { style: "golden", time: "sunset" },
  "modern-dramatic": { style: "purple", time: "twilight" },
  "golden-luxury": { style: "golden", time: "early-evening" },
};

const SKY_PALETTE: Record<TwilightColorStyle, string> = {
  pink: "soft peach-pink and rose-magenta sky, warm salmon tones at the horizon fading to lavender-pink overhead",
  golden:
    "warm amber-gold sky, rich golden-orange at the horizon fading to soft peach then pale blue overhead",
  purple:
    "deep blue-violet sky with a strong magenta-pink horizon band, cool purple tones overhead transitioning to warm pink at the edge",
  natural:
    "realistic, true-to-life dusk sky — soft gradient from warm horizon to cool upper sky, no exaggerated color saturation, natural blend of ambient tones",
};

const TIME_EXPOSURE: Record<
  TwilightTime,
  { brightness: string; windowGlow: string; guardrail: string }
> = {
  "early-evening": {
    brightness:
      'Still BRIGHT — the last 15 minutes of sunlight. Sky is colorful but the scene is well-lit with lingering daylight. Siding, landscaping, and architecture warmly illuminated by ambient light from the horizon. This is the "golden hour" moment real estate photographers chase.',
    windowGlow:
      "Subtle warm 2700K glow just starting to appear in the windows that already exist in the photo — visible but not dominant. Exterior light still competes with interior. Do not add any lamp, fixture, or glow that is not already physically present in the input.",
    guardrail:
      'MEDIUM-HIGH exposure, 3+ f-stops brighter than a moody night edit. Scene should read as "late afternoon transitioning to evening," NOT dusk.',
  },
  sunset: {
    brightness:
      "CIVIL TWILIGHT — sun just below the horizon, sky still warm and bright with rich color. Architectural details all clearly visible. Gentle lingering daylight still illuminating siding, trim, and landscaping. Think Architectural Digest twilight cover shot.",
    windowGlow:
      "Warm amber 2700K light glowing from the windows that already exist. ONLY porch lights, path lights, and fixtures that are already physically visible in the input photo turn on, with soft warm halos — do NOT add or invent any fixture that is not already there. Interior glow noticeably brighter than ambient.",
    guardrail:
      "MEDIUM-HIGH exposure, 2-3 f-stops brighter than a moody night edit. All exterior details must remain clearly visible WITHOUT squinting.",
  },
  twilight: {
    brightness:
      "Late civil twilight / early blue hour — sky is deeper and more dramatic but the house is NOT a silhouette. Ambient light is lower but architectural details remain readable. Cool ambient light with strong warm interior contrast.",
    windowGlow:
      "Bright warm interior glow from the windows that already exist, spilling warm light onto nearby walls, porches, and ground. Any architectural sconces, soffit lights, path lights, or landscape fixtures THAT ARE ALREADY PHYSICALLY PRESENT in the input photo turn on warmly — if a fixture is not visible in the original photo it stays off and is NOT added. Window glow is the dominant light source. Never invent new lamps, sconces, uplights, or floating glows.",
    guardrail:
      "MEDIUM exposure — darker than sunset but all siding texture, landscaping, and architectural features still clearly visible. NOT night. NOT silhouette. 1-2 f-stops brighter than a moody night edit.",
  },
};

function buildTwilightPrompt(
  style: TwilightColorStyle,
  time: TwilightTime,
): string {
  const sky = SKY_PALETTE[style];
  const exp = TIME_EXPOSURE[time];

  return `LIGHTING-ONLY EDIT. This is a photo restoration / relighting task, not a creative regeneration task. Take the input photograph and change only the lighting and sky. Everything else must remain pixel-accurate.

TARGET SKY:
${sky}

TARGET LIGHTING:
${exp.brightness}

WINDOW & FIXTURE GLOW:
${exp.windowGlow}

BRIGHTNESS / EXPOSURE GUARDRAIL (critical):
- ${exp.guardrail}
- Shadows should be soft and readable, not crushed black.

PRESERVE EXACTLY (must be pixel-identical to the input):
- House structure, silhouette, and all architectural features (walls, siding, trim, columns, porches, railings, roofs, chimneys, gutters, eaves).
- Siding material and color (do not change or "upgrade" materials).
- Every window: count, position, size, framing, mullions, glass.
- Every door: count, position, size, style, color, hardware.
- Roof: shape, pitch, material, shingle pattern.
- Yard, grass, driveway, walkways, hardscape, fences, mailbox.
- Existing trees, shrubs, flower beds — no additions or removals.
- Camera framing, angle, field of view, perspective, and crop.

STRICT RULES:
- Do NOT invent, add, or remove any physical object, plant, or architectural element.
- Do NOT change camera angle, zoom, or perspective.
- Do NOT upgrade, repaint, re-side, or re-roof the house.
- Do NOT regenerate grass, trees, or landscaping.
- Do NOT add new windows, doors, lights, cars, furniture, or decor.
- NEW LIGHT SOURCES ARE THE #1 FAILURE MODE: do NOT add, invent, or switch on any light fixture, lamp, sconce, porch light, path light, landscape uplight, or window glow that is not already physically visible in the input photo. Illuminate ONLY light sources that already exist. A glow with no visible fixture behind it, or a lit fixture that is not in the original photo, is a FAILED result.
- Only change: sky (to the target atmosphere), exterior ambient light level, interior glow of EXISTING windows and EXISTING fixtures, and reflections that follow naturally from the new lighting.

PHOTOGRAPHY DNA — MATCH THE INPUT:
- Preserve the input photo's noise/grain structure. Do not smooth or denoise.
- The output should look like the same camera captured the scene at a different time of day — same sensor characteristics, same lens, same focal length.
- If the input has JPEG compression artifacts, the output should have similar compression texture. Do not "clean up" the photo.

Output the same photograph relit to the target atmosphere. Treat the input as immutable geometry and change only the light energy in the scene.`;
}

// SHORT prompts for the nano-banana-pro A/B path. Edit models (Gemini family)
// follow concise, positive, "keep-first / change-second" instructions far
// better than the 400-word rule wall above — see the twilight research notes.
const SKY_SHORT: Record<TwilightColorStyle, string> = {
  pink: "soft peach-pink and rose near the horizon fading to cool blue overhead",
  golden: "warm amber-gold at the horizon fading to deep blue overhead",
  purple: "magenta-pink horizon band fading to deep blue-violet overhead",
  natural:
    "natural true-to-life dusk gradient, warm at the horizon to cool blue overhead, gentle and not over-saturated",
};
const TIME_SHORT: Record<TwilightTime, string> = {
  "early-evening":
    "the last minutes of sunlight — the scene stays bright and clearly lit",
  sunset:
    "sun just below the horizon — the house and yard stay clearly lit and detailed, never a dark silhouette",
  twilight:
    "deep blue hour — lower ambient light but the facade, siding texture and landscaping stay readable, never a black silhouette",
};

function buildTwilightPromptShort(
  style: TwilightColorStyle,
  time: TwilightTime,
): string {
  return `Using the provided photo, relight this house exterior to a warm twilight scene. Sky: a smooth blue-hour gradient — ${SKY_SHORT[style]} — natural, no hard bands or pasted-in look. Lighting: ${TIME_SHORT[time]}. Light the windows with a warm 2700K interior glow, and turn on ONLY the light fixtures already visible in the original photo. Do NOT add or invent any new lights, landscape uplighting, path lights, or fixtures that are not already present — if there is no fixture there, leave it dark. Keep the sky cooler than the warm window glow, and keep the house, windows, doors, roof, siding, landscaping, driveway and camera angle exactly the same — change only the sky and the lighting.`;
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

// ── NO-NEW-LIGHTS QC GATE ────────────────────────────────────────────────────
// Day-to-dusk's #1 defect is the model inventing lit fixtures (path lights,
// uplights, sconces, floating glows) that were never in the photo. The prompt
// fix (illuminate only EXISTING fixtures) removes most of it; this gate catches
// the rest. moondream is the same sub-second VQA already used by the staging
// presence gate — here it inspects the relit frame for obviously fake/added
// lights. Single-image check (no original needed): "fake glow with no fixture"
// is judgeable from the output alone, and that is exactly the complaint.

/** True if moondream sees obviously fake / added lights in the relit frame.
 *  Fails OPEN (returns false) so QC outages never block a delivery. */
async function hasFakeLights(
  replicate: Replicate,
  imageUrl: string,
): Promise<boolean> {
  // Deadline: replicate.run blocks until the prediction settles, so a stuck
  // moondream (cold boot, queue delay) would burn the 180s budget AFTER the
  // expensive generation already succeeded. 15s covers a cold boot; timeout
  // fails open like any other QC outage. AbortController (not a bare
  // Promise.race) so the abandoned prediction is cancelled instead of left
  // polling and billing in the background.
  const qcAbort = new AbortController();
  const qcTimer = setTimeout(() => qcAbort.abort(), 15_000);
  try {
    const out = await replicate.run(
      MOONDREAM as `${string}/${string}:${string}`,
      {
        input: {
          image: imageUrl,
          prompt:
            "This is a twilight real estate photo. Are there any obviously fake or artificially added lights — a glow with no visible fixture behind it, floating orbs of light, or path lights / uplights / sconces that look painted on? Answer with exactly one word: yes or no.",
        },
        signal: qcAbort.signal,
      },
    );
    const ans = (Array.isArray(out) ? out.join("") : String(out))
      .trim()
      .toLowerCase();
    return ans.startsWith("yes");
  } catch (qcErr: any) {
    console.warn(
      qcAbort.signal.aborted
        ? "[flux-twilight] QC gate timed out (15s) — failing open"
        : `[flux-twilight] QC gate errored (${qcErr?.message}) — failing open`,
    );
    return false; // QC unavailable → don't block delivery
  } finally {
    clearTimeout(qcTimer);
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
  const rawStyle = String(body.style || "");
  const rawTime = String(body.timeOfDay || "");
  const skipUpscale = Boolean(body.skipUpscale);
  // nano-banana-pro is the primary twilight engine; flux-2-pro is the
  // fallback only (nano refusal / capacity). ?engine=flux forces the old
  // path for side-by-side checks.
  const forceFlux = String(body.engine || "") === "flux";

  if (!imageBase64) {
    json(res, 400, { ok: false, error: "imageBase64 is required" });
    return;
  }

  let style: TwilightColorStyle;
  let time: TwilightTime;

  if (rawStyle in LEGACY_MAP) {
    const mapped = LEGACY_MAP[rawStyle];
    style = mapped.style;
    time = mapped.time;
  } else {
    style = rawStyle as TwilightColorStyle;
    time = (rawTime || "sunset") as TwilightTime;
  }

  if (!VALID_STYLES.includes(style)) {
    json(res, 400, { ok: false, error: `Invalid style: ${rawStyle}` });
    return;
  }
  if (!VALID_TIMES.includes(time)) {
    json(res, 400, { ok: false, error: `Invalid timeOfDay: ${rawTime}` });
    return;
  }

  const userDataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // Detect aspect ratio from base64 image dimensions
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const raw = userDataUrl.split(",")[1] || "";
      const buf = Buffer.from(raw, "base64");
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      if (isPng && buf.length > 24) {
        resolve({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
      } else {
        for (let i = 0; i < buf.length - 9; i++) {
          if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
            resolve({ w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) });
            return;
          }
        }
        resolve({ w: 4, h: 3 });
      }
    });

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
    const imgRatio = dims.w / dims.h;
    const bestRatio = VALID_RATIOS.reduce((best, r) =>
      Math.abs(r.v - imgRatio) < Math.abs(best.v - imgRatio) ? r : best,
    );

    const basePrompt = buildTwilightPrompt(style, time);
    const runFlux = async (promptText: string): Promise<string | null> => {
      const fluxOutput = await replicate.run("black-forest-labs/flux-2-pro", {
        input: {
          input_images: [userDataUrl],
          prompt: promptText,
          output_format: "jpg",
          aspect_ratio: bestRatio.label,
          // flux-2-pro defaults to 1 MP; 2 MP doubles output pixels for free
          // (model supports up to 4 MP but BFL recommends ≤2 MP for quality).
          resolution: "2 MP",
        },
      });
      return extractUrl(fluxOutput);
    };
    const runNano = async (promptText: string): Promise<string | null> => {
      const nanoOutput = await replicate.run("google/nano-banana-pro", {
        input: {
          prompt: promptText,
          image_input: [userDataUrl],
          resolution: "2K",
          aspect_ratio: "match_input_image",
          output_format: "jpg",
          allow_fallback_model: false,
        },
      });
      return extractUrl(nanoOutput);
    };

    let cleanUrl: string | null = null;
    let engineUsed = "flux-2-pro";

    // PRIMARY: google/nano-banana-pro with the short, edit-model-friendly
    // prompt. Same call shape as staging/sky. On refusal or any failure we
    // fall through to the flux-2-pro fallback below, so a nano hiccup never
    // means a failed generation. ?engine=flux skips nano for comparison.
    if (!forceFlux) {
      try {
        console.log(
          `[flux-twilight] Starting nano-banana-pro (${style}/${time})`,
        );
        const nanoUrl = await runNano(buildTwilightPromptShort(style, time));
        if (nanoUrl) {
          cleanUrl = nanoUrl;
          engineUsed = "nano-banana-pro";
          console.log(
            `[flux-twilight] nano-banana-pro done in ${Date.now() - t0}ms`,
          );
        } else {
          console.warn(
            "[flux-twilight] nano-banana-pro returned no URL — falling back to flux",
          );
        }
      } catch (nanoErr: any) {
        console.warn(
          `[flux-twilight] nano-banana-pro failed (${nanoErr?.message}) — falling back to flux`,
        );
      }
    }

    if (!cleanUrl) {
      console.log(
        `[flux-twilight] Starting Flux 2 Pro v6 2-axis (${style}/${time}, ${dims.w}x${dims.h} → ${bestRatio.label})`,
      );
      cleanUrl = await runFlux(basePrompt);
      engineUsed = "flux-2-pro";
    }

    if (!cleanUrl) {
      json(res, 200, { ok: false, error: "twilight engine returned no image" });
      return;
    }
    console.log(`[flux-twilight] ${engineUsed} done in ${Date.now() - t0}ms`);

    // NO-NEW-LIGHTS QC: if moondream flags invented/fake lights, regenerate
    // once on the SAME engine with an explicit failure callout (steers far
    // harder than the base prompt). Fail-open: a flagged-but-unfixable frame
    // still ships.
    let qcFlagged = false;
    let qcRetried = false;
    if (await hasFakeLights(replicate, cleanUrl)) {
      qcFlagged = true;
      // Budget gate: the corrective pass is a full second generation, and the
      // Pruna upscale + result fetch still follow. With most of the 180s spent,
      // shipping the flagged frame (fail-open) beats Vercel killing a finished
      // delivery mid-retry.
      if (Date.now() - t0 > 90_000) {
        console.warn(
          `[flux-twilight] QC flagged ${engineUsed} but budget low (${Date.now() - t0}ms elapsed) — shipping flagged frame`,
        );
      } else {
        console.warn(
          `[flux-twilight] QC flagged added/fake lights on ${engineUsed} — corrective retry`,
        );
        const retryCallout =
          "CRITICAL RETRY — your previous attempt FAILED because it ADDED light fixtures or glows that are NOT in the original photo. Add NO new lights of any kind. Illuminate ONLY windows and fixtures already physically visible in the input. This is the single most important requirement.\n\n";
        // The retry engines throw on refusal / 429 / capacity — the same
        // conditions the primary pass guards against. A throwing retry must
        // not kill a delivery we already have in hand: fall back to the
        // flagged frame (fail-open), never to the outer error path.
        try {
          const retryUrl =
            engineUsed === "nano-banana-pro"
              ? await runNano(
                  retryCallout + buildTwilightPromptShort(style, time),
                )
              : await runFlux(retryCallout + basePrompt);
          if (retryUrl) {
            cleanUrl = retryUrl;
            qcRetried = true;
            console.log(
              `[flux-twilight] corrective retry done in ${Date.now() - t0}ms`,
            );
          }
        } catch (retryErr: any) {
          console.warn(
            `[flux-twilight] corrective retry failed (${retryErr?.message}) — shipping flagged frame`,
          );
        }
      }
    } else {
      console.log(`[flux-twilight] QC verdict: clean (${engineUsed})`);
    }

    // Pruna 2x upscale (consistent with cleanup/staging/sky/upscale endpoints).
    // Skipped during the editing phase — export upscales once at the end,
    // so an inline upscale here would be wasted double work.
    let finalUrl = cleanUrl;
    if (!skipUpscale) {
      const tUp = Date.now();
      try {
        const upOutput = await replicate.run("prunaai/p-image-upscale", {
          input: {
            image: cleanUrl,
            factor: 2,
            target: 5,
            upscale_mode: "factor",
            output_format: "jpg",
            output_quality: 95,
            enhance_details: true,
            enhance_realism: false,
          },
        });
        const upscaledUrl = await extractUrl(upOutput);
        if (upscaledUrl) {
          finalUrl = upscaledUrl;
          console.log(
            `[flux-twilight] Pruna upscaled in ${Date.now() - tUp}ms`,
          );
        }
      } catch (upErr: any) {
        console.warn(
          `[flux-twilight] Pruna failed: ${upErr?.message} — using un-upscaled`,
        );
      }
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;

    console.log(
      `[flux-twilight] Total: ${Date.now() - t0}ms (${style}/${time})`,
    );
    json(res, 200, {
      ok: true,
      resultBase64,
      latencyMs: Date.now() - t0,
      engine: engineUsed,
      // QC observability: a flagged-then-shipped frame must be measurable
      // (false-positive rate, retry efficacy) without grepping Vercel logs.
      qcFlagged,
      qcRetried,
    });
  } catch (err: any) {
    console.error("[flux-twilight] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
