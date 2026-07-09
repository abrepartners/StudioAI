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
import { json, rejectMethod, parseBody, MOONDREAM } from "./utils.js";
import { applyCors, requireSession } from "./_lib/auth-middleware.js";
import { reserveQuota, refundQuota } from "./_lib/quota.js";
import {
  orientationRoomFor,
  judgeOrientation,
} from "./_lib/orientation-judge.js";

// 300s: worst case is mask ladder (2 lang-sam) + fill + 2 verify retries
// (each = fill + moondream) + 2 composite lang-sams. 180 was tight; repo
// precedent: sam-detect runs 300 for the same reason.
export const config = { runtime: "nodejs", maxDuration: 300 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

// ── NANO BANANA PRO ENGINE (A/B, 2026-06-11) ────────────────────────────────
// Whole-frame instruction-following editor (Gemini 3 Pro Image), run through
// REPLICATE (google/nano-banana-pro) on the same token as every other model in
// this pipeline — no separate Google key. Hypothesis: a faithful-enough
// whole-frame edit beats inpaint+composite because the model renders furniture
// WITH the scene (cohesive light/realism) and native preservation removes the
// composite stage — and every composite-boundary defect with it. Opt-in via
// body.engine="nano" (?engine=nano in the app). Ships RAW (no composite) so
// the A/B measures native fidelity. allow_fallback_model stays FALSE: a silent
// Seedream-lite substitution upstream would corrupt the A/B; our own chain
// (nano → fill → seedream) handles capacity errors. ~$0.14/image at 2K.
const NANO_MODEL = "google/nano-banana-pro";

async function generateNanoBanana(
  replicate: Replicate,
  imageDataUrl: string,
  prompt: string,
): Promise<Buffer | null> {
  const output = await replicate.run(NANO_MODEL, {
    input: {
      prompt,
      image_input: [imageDataUrl],
      resolution: "2K",
      aspect_ratio: "match_input_image",
      output_format: "jpg",
      allow_fallback_model: false,
    },
  });
  const url = await extractUrl(output);
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

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
 *  positive description Fill wants. v2 (2026-06-11): the v1 builder stripped
 *  the prompt to a bare furniture list — ALL style DNA (materials, palette,
 *  arrangement, anti-patterns) and photography matching was discarded, which
 *  produced catalog-looking, badly arranged furniture. Now the DNA block is
 *  carried through and arrangement/photography rules are explicit. */
function buildInpaintPrompt(stagingPrompt: string): string {
  const room =
    stagingPrompt.match(/to this ([a-z &-]+?) to virtually stage/i)?.[1] ||
    "room";
  const style =
    stagingPrompt.match(/stage it in (.+?) style/i)?.[1] || "modern";
  const furniture = (
    stagingPrompt.split(/FURNITURE TO ADD:\s*/i)[1] || ""
  ).trim();
  const dna =
    stagingPrompt
      .match(/STYLE DNA:\s*([\s\S]*?)\n\s*HARD PRESERVATION/i)?.[1]
      ?.trim() || "";
  return (
    `A professionally staged ${style} ${room}.\n` +
    `FURNITURE: ${furniture}\n` +
    (dna ? `STYLE DNA:\n${dna}\n` : "") +
    `ARRANGEMENT: place pieces the way a professional stager would — intentional, asymmetric, conversation-oriented groupings; never catalog symmetry; every piece perfectly scaled to the room and resting naturally on the floor.\n` +
    `PHOTOGRAPHY: photorealistic; match the photo's existing grain, white balance, and natural light direction exactly; shadows grounded and soft.\n` +
    `Do NOT add any windows, doors, vents, radiators, or architectural features — only freestanding furniture and decor.`
  ).slice(0, 2500);
}

/** One lang-sam floor query → binary floor buffer at W×H, with coverage. */
async function langSamFloor(
  replicate: Replicate,
  originalBuf: Buffer,
  W: number,
  H: number,
  textPrompt: string,
): Promise<{ floor: Buffer; cov: number }> {
  const out = await replicate.run(LANG_SAM as `${string}/${string}:${string}`, {
    input: {
      image: `data:image/jpeg;base64,${originalBuf.toString("base64")}`,
      text_prompt: textPrompt,
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
  let on = 0;
  for (let p = 0; p < W * H; p++) {
    if (data[p * info.channels] > 8) {
      floor[p] = 255;
      on++;
    }
  }
  return { floor, cov: on / (W * H) };
}

/** Shave an over-matched floor mask from the top down until coverage ≤ target.
 *  Floor is bottom-weighted in eye-level listing shots, so excess match (large
 *  tile walls, shower surrounds) concentrates in upper rows — trimming
 *  top-down keeps the true floor and discards the over-match. Returns the
 *  resulting coverage. Mutates `floor` in place. */
function clampFloorFromTop(
  floor: Buffer,
  W: number,
  H: number,
  targetCov: number,
): number {
  let on = 0;
  for (const v of floor) if (v) on++;
  let cov = on / (W * H);
  for (let y = 0; y < H && cov > targetCov; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (floor[i]) {
        floor[i] = 0;
        on--;
      }
    }
    cov = on / (W * H);
  }
  return cov;
}

/** Geometric floor of last resort: perspective trapezoid anchored to the
 *  bottom edge (eye-level listing shots put floor in the bottom band, wider
 *  toward the camera). ~36% coverage before upward expansion. Never fails. */
function geometricFloor(W: number, H: number): Buffer {
  const floor = Buffer.alloc(W * H);
  const yTop = Math.round(H * 0.55);
  for (let y = yTop; y < H; y++) {
    const t = (y - yTop) / Math.max(1, H - yTop); // 0 at trapezoid top → 1 at bottom
    const half = (0.3 + 0.2 * t) * W; // 60% wide at top → 100% at bottom edge
    const x0 = Math.max(0, Math.round(W / 2 - half));
    const x1 = Math.min(W, Math.round(W / 2 + half));
    floor.fill(255, y * W + x0, y * W + x1);
  }
  return floor;
}

// Floor plausibility window + rescue tuning.
const FLOOR_COV_MIN = 0.08; // below this lang-sam likely missed the floor
const FLOOR_COV_MAX = 0.85; // above this lang-sam over-matched
const FLOOR_COV_JUNK = 0.93; // above this the mask is noise — not salvageable
const FLOOR_CLAMP_TARGET = 0.8; // over-match shave target

/** Floor-region inpaint mask: lang-sam floor on the ORIGINAL, expanded upward
 *  for furniture height, edges softened. Returns PNG buffer at original dims.
 *
 *  MASK RESCUE LADDER (2026-06-11): the single multi-term lang-sam query was a
 *  hard point of failure — ~13% of prod runs threw "coverage implausible" and
 *  silently degraded to the Seedream fallback engine, the exact geometry-drift
 *  path this rebuild exists to escape. Ladder: multi-term query → bare "floor"
 *  query → geometric trapezoid. Moderate over-match (≤93%) is clamped from the
 *  top instead of abandoned. The fill engine no longer dies for mask reasons;
 *  only true infrastructure errors (sharp failures) still throw to the caller. */
async function buildInpaintMask(
  replicate: Replicate,
  originalBuf: Buffer,
  W: number,
  H: number,
): Promise<{ png: Buffer; floorRaw: Buffer }> {
  let floor: Buffer | null = null;

  for (const tp of ["floor, carpet, rug, tile floor, wood floor", "floor"]) {
    try {
      const r = await langSamFloor(replicate, originalBuf, W, H, tp);
      if (r.cov >= FLOOR_COV_MIN && r.cov <= FLOOR_COV_MAX) {
        floor = r.floor;
        break;
      }
      if (r.cov > FLOOR_COV_MAX && r.cov <= FLOOR_COV_JUNK) {
        const cov = clampFloorFromTop(r.floor, W, H, FLOOR_CLAMP_TARGET);
        if (cov >= FLOOR_COV_MIN) {
          console.warn(
            `[flux-staging] floor mask over-matched ${(r.cov * 100).toFixed(1)}% ("${tp}") — clamped to ${(cov * 100).toFixed(1)}%`,
          );
          floor = r.floor;
          break;
        }
      }
      console.warn(
        `[flux-staging] floor coverage implausible ${(r.cov * 100).toFixed(1)}% ("${tp}") — trying next mask strategy`,
      );
    } catch (e: any) {
      console.warn(
        `[flux-staging] floor mask attempt failed ("${tp}"): ${e?.message} — trying next mask strategy`,
      );
    }
  }

  if (!floor) {
    console.warn(
      "[flux-staging] floor mask: GEOMETRIC fallback — lang-sam found no plausible floor",
    );
    floor = geometricFloor(W, H);
  }

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
  // RESTORE KEEP-OUT (2026-06-11): restore previously came within ~8px of the
  // furniture mask edge; wherever lang-sam under-recalled (thin legs, throw
  // fringe, low-contrast fabric) original floor pixels feathered THROUGH the
  // furniture — the "weird fading" defect. The keep-out is now 20px: restored
  // floor can never touch a furniture boundary, so feathering blends
  // fill-floor↔original-floor in open floor only.
  const RESTORE_KEEPOUT_PX = 20;
  let furn = await sharp(furn0, { raw: { width: W, height: H, channels: 1 } })
    .blur(RESTORE_KEEPOUT_PX)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let i = 0; i < furn.length; i++) furn[i] = furn[i] > 12 ? 255 : 0;

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
  // Seedream has no hard instruction cap (reve/edit's was 2560); the staging
  // prompt builder already self-trims to ~2558, so this clamp is a generous
  // safety bound, not a binding limit.
  const prompt = String(body.prompt || "").slice(0, 5000);
  const skipUpscale = Boolean(body.skipUpscale);
  // Furnished room → replace mode: the prompt removes existing furniture
  // before staging. Whole-frame engines only — the fill inpaint pipeline
  // can't remove furniture through a floor mask, so its fallback is skipped.
  const furnished = Boolean(body.furnished);
  // Architecture protect (nano path only): nano ships RAW and its native
  // preservation is NOT reliable on architecture — measured live dropping an
  // exterior glass door (re-rendered as a solid panel) and altering windows.
  // A moondream QC gate can't judge this (yes-biased on the real images), so we
  // deterministically restore the ORIGINAL's windows/doors/fixtures via lang-sam
  // masks, minus any furniture now in front of them. On by default; `?protect=0`
  // disables for A/B against pure-RAW nano.
  const protectArchitecture = String(body.protect || "") !== "0";

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
          // 30 = flux-fill-pro's default and realism sweet spot. The previous
          // 60 over-baked output into a plastic rendered look (user report
          // 2026-06-11: "not even realistic furniture").
          guidance: 30,
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

    // Nano is the PRIMARY engine (promoted 2026-06-11 after the A/B: native
    // whole-frame staging preserved floors/windows/walls with none of the
    // composite-boundary defects). The fill inpaint pipeline remains as the
    // automatic failure fallback and as an explicit ?engine=fill override
    // while telemetry confirms nano's success rate — the mask/composite
    // stage gets deleted once that holds.
    const requestedEngine = String(body.engine || "nano").toLowerCase();
    let engine = "nano-banana";
    if (requestedEngine === "fill") engine = "flux-fill";
    else if (requestedEngine === "seedream") engine = "seedream";

    const generate = async (p: string = prompt): Promise<Buffer | null> => {
      if (engine === "nano-banana") {
        try {
          // Nano gets the FULL staging prompt (it is an instruction-following
          // editor) and ships RAW — the A/B measures native fidelity.
          const b = await generateNanoBanana(replicate, dataUrl, p);
          if (b) return b;
          throw new Error("nano returned no image");
        } catch (e: any) {
          const fb = furnished ? "seedream" : "flux-fill";
          console.warn(
            `[flux-staging] nano engine failed (${e?.message}) — falling back to ${fb}`,
          );
          engine = fb;
        }
      }
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

    if (furnished && engine === "flux-fill")
      console.warn(
        "[flux-staging] replace mode requested with the fill engine — fill cannot remove furniture; output may collide with existing pieces",
      );
    console.log(
      `[flux-staging] Starting staging (engine: ${engine}, mode: ${furnished ? "replace" : "add"})...`,
    );
    let resultBuf = await generate();
    if (!resultBuf) {
      await refundQuota(quota.refundHandle);
      json(res, 200, { ok: false, error: "staging engine returned no image" });
      return;
    }
    console.log(
      `[flux-staging] ${engine} generation done in ${Date.now() - t0}ms`,
    );

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

    // ORIENTATION gate: nano places the primary seating backwards (sofa's back
    // to the fireplace) on its tail. The prompt already forbids it and the model
    // ignores it; the small VQA models can't judge it. A frontier VLM (Gemini
    // 2.5 Flash) can — one corrective regeneration when it flags BACKWARDS.
    // Room-gated to seating rooms; fails open (needs GEMINI_API_KEY, else skips).
    const orientRoom = orientationRoomFor(prompt);
    if (orientRoom) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const verdict = await judgeOrientation(
          `data:image/jpeg;base64,${resultBuf.toString("base64")}`,
        );
        if (verdict !== "backwards") {
          if (attempt > 0 && verdict === "ok")
            console.log(
              `[flux-staging] orientation retry ${attempt} PASSED (seating faces the room)`,
            );
          break;
        }
        if (attempt === 1) {
          console.warn(
            "[flux-staging] seating still backwards after 1 retry — shipping last frame",
          );
          break;
        }
        console.warn(
          "[flux-staging] orientation flagged BACKWARDS — corrective retry",
        );
        const retryPrompt =
          "RETRY — your previous attempt FAILED because the main sofa was placed BACKWARDS, " +
          "with its back to the fireplace or a window and facing a blank wall. Orient the primary " +
          "seating so its SEAT faces INTO the room toward the focal point (fireplace, TV wall, or " +
          "the seating group). This facing is the single most important requirement.\n\n" +
          prompt;
        const second = await generate(retryPrompt);
        if (!second) break;
        resultBuf = second;
      }
    }

    // COMPOSITE — engine-specific contract, fails open to the raw frame.
    // nano-banana intentionally ships RAW (no composite): the A/B question is
    // whether its native preservation makes the composite stage unnecessary.
    if (engine !== "nano-banana") {
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
                  text_prompt:
                    "window, door, doorway, glass door, french doors, ceiling, ceiling fan, light fixture, chandelier",
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
          resultBuf = await furnitureLockComposite(
            originalBuf,
            resultBuf,
            maskBuf,
          );
          console.log(
            `[flux-staging] furniture-lock composite done in ${Date.now() - tComp}ms`,
          );
        }
      } catch (compErr: any) {
        console.warn(
          `[flux-staging] composite failed (${compErr?.message}) — returning raw staged frame`,
        );
      }
    } else if (protectArchitecture) {
      // NANO ARCHITECTURE PROTECT — narrow, deterministic. nano keeps its RAW
      // furniture (no furniture-lock composite), but the ORIGINAL's windows,
      // doors, and fixtures are restored where nano re-rendered them. Two
      // lang-sam passes: doors/windows in the ORIGINAL (what to restore), and
      // furniture in the RESULT (what to keep on top). floorRestoreComposite
      // with an all-zero floor mask means restore = protect AND NOT furniture,
      // so a sofa placed in front of a window is never cut through. Fails open
      // to the raw nano frame.
      try {
        const tProt = Date.now();
        const resultDataUrl = `data:image/jpeg;base64,${resultBuf.toString("base64")}`;

        const protectOut = await replicate.run(
          LANG_SAM as `${string}/${string}:${string}`,
          {
            input: {
              image: `data:image/jpeg;base64,${originalBuf.toString("base64")}`,
              text_prompt:
                "window, door, doorway, glass door, french doors, sliding glass door, window blinds, ceiling fan, light fixture, chandelier",
            },
          },
        );
        const protectUrl = await extractUrl(protectOut);
        const protectRes = protectUrl ? await fetch(protectUrl) : null;
        if (!protectRes || !protectRes.ok)
          throw new Error("architecture protect mask unavailable");
        const protectBuf = Buffer.from(await protectRes.arrayBuffer());

        const furnOut = await replicate.run(
          LANG_SAM as `${string}/${string}:${string}`,
          {
            input: { image: resultDataUrl, text_prompt: FURNITURE_MASK_PROMPT },
          },
        );
        const furnUrl = await extractUrl(furnOut);
        const furnRes = furnUrl ? await fetch(furnUrl) : null;
        if (!furnRes || !furnRes.ok)
          throw new Error("furniture mask unavailable");
        const furnMaskBuf = Buffer.from(await furnRes.arrayBuffer());

        resultBuf = await floorRestoreComposite(
          originalBuf,
          resultBuf,
          Buffer.alloc(oW * oH), // no floor restore — nano keeps its own floor + furniture
          furnMaskBuf,
          protectBuf,
          oW,
          oH,
        );
        console.log(
          `[flux-staging] nano architecture-protect done in ${Date.now() - tProt}ms`,
        );
      } catch (protErr: any) {
        console.warn(
          `[flux-staging] architecture protect failed (${protErr?.message}) — returning raw nano frame`,
        );
      }
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
    console.log(
      `[flux-staging] Total: ${Date.now() - t0}ms (engine: ${engine})`,
    );
    json(res, 200, {
      ok: true,
      resultBase64,
      latencyMs: Date.now() - t0,
      engine,
      mode: furnished ? "replace" : "add",
    });
  } catch (err: any) {
    await refundQuota(quota.refundHandle);
    console.error("[flux-staging] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
