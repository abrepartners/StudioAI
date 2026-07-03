/**
 * api/classify-room.ts — Room-type + emptiness classification
 *
 * Server-side replacement for the purged browser-Gemini classifyScene (which
 * silently charged per upload from a client-exposed key). Runs moondream2 on
 * Replicate — a small VQA model that answers simple questions sub-second.
 * It can't follow JSON-output instructions, so we ask THREE one-word
 * questions in parallel and assemble the result server-side (validated
 * 2026-06-10 on real listing photos: location and room 5/5, furnished
 * living room caught).
 *
 * Powers the staging gate: staging is only enabled for EMPTY, stageable
 * interior rooms. Without this, every upload defaulted to "Living Room" and
 * staging would happily re-render kitchens, bathrooms, and backyards.
 *
 * Input (POST JSON):
 *   { imageBase64: string }
 *
 * Output (200 JSON):
 *   { ok: true, location: 'interior'|'exterior', room: string,  // canonical ROOM_TYPES label
 *     empty: boolean, latencyMs: number }
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

export const config = { runtime: "nodejs", maxDuration: 60 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const QUESTIONS = {
  location:
    "Is this photo taken indoors or outdoors? Answer with exactly one word: indoors or outdoors.",
  room: "What type of room or space is shown? Answer with one or two words, like: living room, dining room, kitchen, bedroom, bathroom, office, laundry room, garage, basement, foyer, hallway, closet, sunroom, patio, pool, backyard, front yard.",
  furniture:
    "Does this room contain any freestanding furniture such as sofas, beds, tables, or chairs? Built-in cabinets and fixtures do not count. Answer with exactly one word: yes or no.",
};

// Raw VQA answer → the app's canonical ROOM_TYPES label.
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

function mapRoom(raw: string, isExterior: boolean): string {
  const key = raw.trim().toLowerCase().replace(/[.!]/g, "");
  if (ROOM_MAP[key]) return ROOM_MAP[key];
  // Substring pass — answers like "a cozy living room" still map.
  for (const [k, v] of Object.entries(ROOM_MAP)) {
    if (key.includes(k)) return v;
  }
  // Unmapped: pick the safe default for the detected location. Staging stays
  // gated by the empty flag either way.
  return isExterior ? "Backyard" : "Living Room";
}

async function ask(
  replicate: Replicate,
  image: string,
  prompt: string,
): Promise<string> {
  const out = await replicate.run(MOONDREAM, { input: { image, prompt } });
  return (Array.isArray(out) ? out.join("") : String(out)).trim().toLowerCase();
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
  if (!imageBase64) {
    json(res, 400, { ok: false, error: "imageBase64 is required" });
    return;
  }

  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    const [locRaw, roomRaw, furnRaw] = await Promise.all([
      ask(replicate, dataUrl, QUESTIONS.location),
      ask(replicate, dataUrl, QUESTIONS.room),
      ask(replicate, dataUrl, QUESTIONS.furniture),
    ]);

    const isExterior = locRaw.includes("outdoor");
    const room = mapRoom(roomRaw, isExterior);
    // "no" freestanding furniture = empty. Unparseable → assume furnished
    // (safe default: the gate asks before staging rather than re-rendering).
    const empty = furnRaw.startsWith("no");

    console.log(
      `[classify-room] ${Date.now() - t0}ms loc=${locRaw} room="${roomRaw}"→${room} furniture=${furnRaw}`,
    );
    json(res, 200, {
      ok: true,
      location: isExterior ? "exterior" : "interior",
      room,
      empty,
      latencyMs: Date.now() - t0,
    });
  } catch (err: any) {
    console.error("[classify-room] unhandled:", err?.message || err);
    json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
