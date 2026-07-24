/**
 * api/_lib/listing-batch-core.ts — shared engine for the Listing Batch Pipeline.
 *
 * One module owns classification, tool routing, photo processing, and listing
 * copy so api/listing-batch/start.ts and api/listing-batch/status.ts cannot
 * drift apart (status re-runs the exact same processPhoto the start endpoint
 * ran on photo 0).
 *
 * Listing copy runs on Gemini text (gemini-2.5-flash via GEMINI_API_KEY), the
 * same server-only pattern as api/_lib/orientation-judge.ts. Replicate's image
 * models cannot return prose, and the app's single text-capable provider is
 * already Google — no second AI provider is introduced.
 */
import Replicate from "replicate";
import sharp from "sharp";
import { MOONDREAM } from "../utils.js";
import {
  buildListingCopyPrompt,
  generateCopyText,
  parseListingCopy,
  type ListingCopy,
} from "./listing-copy-core.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

export const MAX_PHOTOS = 30;
export const CLASSIFY_MAX_EDGE = 768;
export const PROCESS_MAX_EDGE = 1280;

// ── Room classification via moondream2 (mirrors api/classify-room.ts) ────────
export const QUESTIONS = {
  location:
    "Is this photo taken indoors or outdoors? Answer with exactly one word: indoors or outdoors.",
  room: "What type of room or space is shown? Answer with one or two words, like: living room, dining room, kitchen, bedroom, bathroom, office, media room, home theater, bonus room, laundry room, garage, basement, foyer, hallway, closet, sunroom, patio, pool, backyard, front yard.",
  furniture:
    "Does this room contain any freestanding furniture such as sofas, beds, tables, or chairs? Built-in cabinets and fixtures do not count. Answer with exactly one word: yes or no.",
};

const ROOM_MAP: Record<string, string> = {
  "living room": "Living Room",
  "family room": "Living Room",
  lounge: "Living Room",
  "great room": "Living Room",
  "dining room": "Dining Room",
  dining: "Dining Room",
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  "master bedroom": "Bedroom",
  "primary bedroom": "Bedroom",
  bathroom: "Bathroom",
  office: "Office",
  study: "Office",
  "laundry room": "Laundry Room",
  laundry: "Laundry Room",
  garage: "Garage",
  "bonus room": "Bonus Room",
  "media room": "Media Room",
  "home theater": "Media Room",
  theater: "Media Room",
  theatre: "Media Room",
  nursery: "Nursery",
  basement: "Basement",
  foyer: "Foyer",
  entryway: "Foyer",
  hallway: "Hallway",
  closet: "Closet",
  sunroom: "Sunroom",
  patio: "Patio",
  deck: "Patio",
  pool: "Pool",
  backyard: "Backyard",
  yard: "Backyard",
  garden: "Backyard",
  "front yard": "Front Yard",
  "front of house": "Front Yard",
  house: "Front Yard",
  "house exterior": "Front Yard",
};

export function mapRoom(raw: string, isExterior: boolean): string {
  const key = raw.trim().toLowerCase().replace(/[.!]/g, "");
  if (ROOM_MAP[key]) return ROOM_MAP[key];
  for (const [k, v] of Object.entries(ROOM_MAP)) {
    if (key.includes(k)) return v;
  }
  return isExterior ? "Backyard" : "Living Room";
}

const EXTERIOR_ROOMS = new Set([
  "Patio",
  "Pool",
  "Backyard",
  "Front Yard",
  "Exterior",
]);

export interface PhotoClassification {
  location: "interior" | "exterior";
  room: string;
  empty: boolean;
}

/**
 * Per-photo metadata stored in batch_jobs.photos. Deliberately NO base64 here:
 * results live in batch_photos.result_data so the jsonb this array is
 * re-written into on every state change stays small.
 */
export interface PhotoMeta {
  index: number;
  status: "queued" | "processing" | "completed" | "failed";
  location: string | null;
  room: string | null;
  empty: boolean | null;
  tool: string | null;
  has_result: boolean;
  error: string | null;
  /** ISO timestamp set when a poll claims this photo — stale-claim recovery. */
  processing_started?: string | null;
}

export function pickTool(photo: PhotoClassification): string {
  if (EXTERIOR_ROOMS.has(photo.room)) return "exterior";
  if (photo.empty) return "staging";
  if (photo.room === "Bathroom" || photo.room === "Kitchen") return "whiten";
  return "declutter";
}

export function resizeToBase64(buf: Buffer, maxEdge: number): Promise<string> {
  return sharp(buf)
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
    .then((b) => `data:image/jpeg;base64,${b.toString("base64")}`);
}

/** Classify one photo: three parallel one-word moondream questions. */
export async function classifyPhoto(
  replicate: Replicate,
  dataUrl: string,
): Promise<PhotoClassification> {
  const [locRaw, roomRaw, furnRaw] = await Promise.all([
    replicate.run(MOONDREAM, {
      input: { image: dataUrl, prompt: QUESTIONS.location },
    }),
    replicate.run(MOONDREAM, {
      input: { image: dataUrl, prompt: QUESTIONS.room },
    }),
    replicate.run(MOONDREAM, {
      input: { image: dataUrl, prompt: QUESTIONS.furniture },
    }),
  ]);
  const loc = String(Array.isArray(locRaw) ? locRaw.join("") : locRaw)
    .trim()
    .toLowerCase();
  const room = String(Array.isArray(roomRaw) ? roomRaw.join("") : roomRaw)
    .trim()
    .toLowerCase();
  const furn = String(Array.isArray(furnRaw) ? furnRaw.join("") : furnRaw)
    .trim()
    .toLowerCase();
  const isExterior = loc.includes("outdoor");
  return {
    location: isExterior ? "exterior" : "interior",
    room: mapRoom(room, isExterior),
    empty: furn.startsWith("no"),
  };
}

// ── Supabase REST helpers (service-role, server-only) ─────────────────────────
const sbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

export async function sbPost(path: string, body: unknown): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(`sbPost ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function sbPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(`sbPatch ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function sbSelect(path: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET",
    headers: sbHeaders,
  });
  if (!r.ok)
    throw new Error(`sbSelect ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Patch batch_jobs by id, stamping updated_at. */
export async function patchJob(jobId: string, body: Record<string, unknown>) {
  await sbPatch(`batch_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    ...body,
    updated_at: new Date().toISOString(),
  });
}

/** Store a processed result against its batch_photos row. */
export async function storeResult(
  jobId: string,
  index: number,
  resultBase64: string,
) {
  await sbPatch(
    `batch_photos?batch_id=eq.${encodeURIComponent(jobId)}&photo_index=eq.${index}`,
    { result_data: resultBase64 },
  );
}

// ── Photo processing ──────────────────────────────────────────────────────────
export async function processPhoto(
  replicate: Replicate,
  dataUrl: string,
  photo: PhotoMeta,
): Promise<string> {
  if (photo.location === "exterior" || photo.tool === "exterior") {
    // Lawn repair, then sky replacement, then upscale.
    const lawnOutput = await replicate.run(
      "black-forest-labs/flux-kontext-pro",
      {
        input: {
          prompt:
            "Replace only the dead or brown grass with healthy green grass. Keep the house, driveway, pathways, trees, landscaping, and sky exactly as-is. Do not change the overall color grading or temperature. Do not add any new plants, flowers, or landscaping. Only the grass color changes to healthy green.",
          input_image: dataUrl,
          aspect_ratio: "match_input_image",
          output_format: "jpg",
          safety_tolerance: 2,
        },
      },
    );
    const lawnUrl = await extractUrl(lawnOutput);
    if (!lawnUrl) throw new Error("lawn returned no URL");
    const skyOutput = await replicate.run("google/nano-banana", {
      input: {
        image_input: [lawnUrl],
        prompt:
          "Replace ONLY the sky with a vivid, clean deep blue sky with a few soft scattered cumulus clouds. Bright, sunny, MLS-ready daytime look. Keep the house, landscaping, grass, and everything else pixel-identical. No ghost roofline, no duplicated structure in the sky.",
        output_format: "jpg",
      },
    });
    const skyUrl = await extractUrl(skyOutput);
    if (!skyUrl) throw new Error("sky replacement returned no URL");
    return await upscaleAndFetch(replicate, skyUrl);
  }

  if (photo.tool === "staging") {
    const output = await replicate.run("google/nano-banana-pro", {
      input: {
        prompt:
          "Virtually stage this empty room with tasteful, modern furniture appropriate for the room type. Add a sofa, coffee table, rug, lamp, and wall art for a living room; a bed, nightstands, and lamp for a bedroom; a dining table and chairs for a dining room. Make the room feel lived-in and welcoming. Keep the exact same architecture, lighting, and color palette. Photorealistic, natural lighting.",
        image_input: [dataUrl],
        resolution: "2K",
        aspect_ratio: "match_input_image",
        output_format: "jpg",
        allow_fallback_model: false,
      },
    });
    const url = await extractUrl(output);
    if (!url) throw new Error("staging returned no URL");
    return await upscaleAndFetch(replicate, url);
  }

  if (photo.tool === "whiten") {
    const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
      input: {
        prompt:
          "BRIGHTEN AND WHITEN this room. Increase overall brightness and exposure. Make white surfaces (walls, cabinets, countertops, tile, ceilings) clean white. Matte finish, no HDR effect. Keep all colors, furniture, fixtures, and architecture exactly as-is. Do not change the room's color scheme. Do not add or remove anything. Just brighten the entire space evenly.",
        input_image: dataUrl,
        aspect_ratio: "match_input_image",
        output_format: "jpg",
        safety_tolerance: 2,
      },
    });
    const url = await extractUrl(output);
    if (!url) throw new Error("whiten returned no URL");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }

  // Default: declutter via nano-banana-pro.
  const output = await replicate.run("google/nano-banana-pro", {
    input: {
      prompt: `Remove all clutter, personal items, and temporary objects from this ${photo.room || "room"}. Remove: remote controls, magazines, newspapers, tissue boxes, cups, bottles, phone chargers, shoes, slippers, pet toys, laundry, backpacks, mail, kids' toys, and any item that does not belong in a staged home. Keep all furniture, built-in fixtures, and architecture exactly as-is. Do not add anything. Reconstruct revealed surfaces naturally.`,
      image_input: [dataUrl],
      resolution: "2K",
      aspect_ratio: "match_input_image",
      output_format: "jpg",
      allow_fallback_model: false,
    },
  });
  const url = await extractUrl(output);
  if (!url) throw new Error("declutter returned no URL");
  return await upscaleAndFetch(replicate, url);
}

export async function upscaleAndFetch(
  replicate: Replicate,
  imageUrl: string,
): Promise<string> {
  const upOutput = await replicate.run("prunaai/p-image-upscale", {
    input: {
      image: imageUrl,
      factor: 2,
      upscale_mode: "factor",
      output_format: "jpg",
      output_quality: 95,
      enhance_details: true,
      enhance_realism: false,
    },
  });
  const finalUrl = (await extractUrl(upOutput)) || imageUrl;
  const r = await fetch(finalUrl);
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

export async function extractUrl(output: unknown): Promise<string | null> {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return extractUrl(output[0]);
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "function") {
      try {
        return String((o.url as () => unknown)());
      } catch {
        return null;
      }
    }
    if (typeof o.url === "string") return o.url;
  }
  return null;
}

// ── Listing copy (delegates to listing-copy-core) ─────────────────────────────
/** Batch flavor: derive the rooms line from the stored classifications. */
export async function generateListingCopy(
  classifications: Array<{
    room: string | null;
    location: string | null;
    empty: boolean | null;
  }>,
): Promise<ListingCopy> {
  const rooms = classifications
    .map((c) => `${c.room || "Room"} (${c.location || "interior"})`)
    .join(", ");
  const emptyCount = classifications.filter((c) => c.empty).length;
  const exteriorCount = classifications.filter(
    (c) => c.location === "exterior",
  ).length;
  const prompt = buildListingCopyPrompt(rooms, [
    `Mention that ${emptyCount > 0 ? "some rooms are freshly staged" : "rooms are professionally staged"} and that ${exteriorCount > 0 ? "the exterior has been digitally enhanced with lush landscaping and sky replacement" : "the interior has been professionally edited and brightened"}.`,
  ]);
  const raw = await generateCopyText(prompt);
  return parseListingCopy(raw);
}
