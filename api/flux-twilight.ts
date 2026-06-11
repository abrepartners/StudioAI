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
} from "./utils.js";

export const config = { runtime: "nodejs", maxDuration: 120 };

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
      "Subtle warm 2700K glow just starting to appear in windows — visible but not dominant. Exterior light still competes with interior.",
    guardrail:
      'MEDIUM-HIGH exposure, 3+ f-stops brighter than a moody night edit. Scene should read as "late afternoon transitioning to evening," NOT dusk.',
  },
  sunset: {
    brightness:
      "CIVIL TWILIGHT — sun just below the horizon, sky still warm and bright with rich color. Architectural details all clearly visible. Gentle lingering daylight still illuminating siding, trim, and landscaping. Think Architectural Digest twilight cover shot.",
    windowGlow:
      "Warm amber 2700K light glowing from every visible window. Existing porch lights and path lights ON with soft warm halos. Interior glow noticeably brighter than ambient.",
    guardrail:
      "MEDIUM-HIGH exposure, 2-3 f-stops brighter than a moody night edit. All exterior details must remain clearly visible WITHOUT squinting.",
  },
  twilight: {
    brightness:
      "Late civil twilight / early blue hour — sky is deeper and more dramatic but the house is NOT a silhouette. Ambient light is lower but architectural details remain readable. Cool ambient light with strong warm interior contrast.",
    windowGlow:
      "Bright warm interior glow from every window spilling warm light onto nearby walls, porches, and ground. Architectural sconces, recessed soffit lights, path lights, and landscape uplighting all ON. Window glow is the dominant light source.",
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
- Only change: sky (to the target atmosphere), exterior ambient light level, interior window glow, and reflections that follow naturally from the new lighting.

PHOTOGRAPHY DNA — MATCH THE INPUT:
- Preserve the input photo's noise/grain structure. Do not smooth or denoise.
- The output should look like the same camera captured the scene at a different time of day — same sensor characteristics, same lens, same focal length.
- If the input has JPEG compression artifacts, the output should have similar compression texture. Do not "clean up" the photo.

Output the same photograph relit to the target atmosphere. Treat the input as immutable geometry and change only the light energy in the scene.`;
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

    console.log(
      `[flux-twilight] Starting Flux 2 Pro v6 2-axis (${style}/${time}, ${dims.w}x${dims.h} → ${bestRatio.label})`,
    );
    const fluxOutput = await replicate.run("black-forest-labs/flux-2-pro", {
      input: {
        input_images: [userDataUrl],
        prompt: buildTwilightPrompt(style, time),
        output_format: "jpg",
        aspect_ratio: bestRatio.label,
        // flux-2-pro defaults to 1 MP; 2 MP doubles output pixels for free
        // (model supports up to 4 MP but BFL recommends ≤2 MP for quality).
        resolution: "2 MP",
      },
    });

    const cleanUrl = await extractUrl(fluxOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: "Flux returned no image URL" });
      return;
    }
    console.log(`[flux-twilight] Flux done in ${Date.now() - t0}ms`);

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
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    console.error("[flux-twilight] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
