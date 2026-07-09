/**
 * api/_lib/orientation-judge.ts — server-only staging orientation QC.
 *
 * nano-banana occasionally places the primary seating backwards — sofa's back
 * to the fireplace, facing a blank wall. The prompt already forbids this
 * (ORIENTATION & FACING rule) and the model ignores it on its tail. moondream
 * and the small open Replicate VLMs (qwen2-vl-7b, molmo, llava-13b) can't judge
 * it reliably — tested on real failures, they either miss the backwards sofa or
 * over-flag a correct one. A frontier VLM does judge it correctly, so this gate
 * asks Gemini 2.5 Flash (the app's primary engine is already a Google model).
 *
 * Server-only: GEMINI_API_KEY lives in Vercel env, never the browser bundle
 * (the reason browser-side Gemini was purged in the first place). Fails to
 * "unknown" so a missing key or an outage never blocks a delivery.
 */
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/** Rooms whose primary seating has a meaningful facing to judge. Bedrooms
 *  (headboard-on-longest-wall) are rarely reversed and harder to judge, so we
 *  gate to seating rooms where "sofa backwards" is the observed failure. */
export function orientationRoomFor(prompt: string): string | null {
  const m = prompt.match(/to this ([a-z &-]+?) to virtually stage/i);
  const room = (m?.[1] || "").toLowerCase();
  if (!room) return null;
  if (
    room.includes("living") ||
    room.includes("family") ||
    room.includes("great") ||
    room.includes("bonus") ||
    room.includes("sunroom") ||
    room.includes("basement")
  )
    return room;
  return null;
}

export type OrientationVerdict = "ok" | "backwards" | "unknown";

// The standard = the owner's bar: when a living room HAS a fireplace, the main
// sofa must anchor to it. A one-shot "is the sofa oriented correctly?" prompt
// rates a media-facing sofa OK (it is a valid arrangement in general), so it
// MISSES this failure — verified: gemini-2.5-flash called the real backwards
// living room "OK". Forcing the fireplace-anchor rule with explicit reasoning
// flags it reliably — verified 3/3 BACKWARDS on the real failure, OK on an
// empty (no-sofa) room. A sofa intentionally facing a media wall in a
// fireplace room gets one corrective retry, which for a listing is the better
// result anyway. If there is no fireplace, the verdict is OK (nothing to fail).
const PROMPT =
  "You are reviewing a virtually staged living room to a strict standard: when " +
  "the room has a FIREPLACE, the main sofa MUST be anchored to it — the sofa " +
  "should face the fireplace or sit directly alongside it facing the same area. " +
  "If the main sofa instead faces a different wall (a media console, art, or a " +
  "blank wall) so the fireplace is behind the sofa or off its back corner, that " +
  "FAILS this standard.\n" +
  "Step 1: is there a fireplace, and on which wall?\n" +
  "Step 2: does the main sofa face the fireplace, or a different wall with the " +
  "fireplace behind/off its back?\n" +
  "End with exactly: 'VERDICT: BACKWARDS' if the sofa is NOT anchored to the " +
  "fireplace, else 'VERDICT: OK'. If there is no fireplace, answer 'VERDICT: OK'.";

/**
 * Judge whether the staged room's primary seating is anchored to the fireplace.
 * Fails to "unknown" (never blocks). stagedInput may be a data URL or bare b64.
 */
export async function judgeOrientation(
  stagedInput: string,
): Promise<OrientationVerdict> {
  if (!GEMINI_API_KEY) return "unknown";
  const data = stagedInput.replace(/^data:image\/\w+;base64,/, "");
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: "image/jpeg", data } },
          ],
        },
      ],
    });
    const text = (res.text || "").trim();
    // Parse the trailing VERDICT line (fall back to the last mention).
    const m =
      text.match(/VERDICT:\s*(BACKWARDS|OK)\s*$/im) ||
      text.match(/VERDICT:\s*(BACKWARDS|OK)/i);
    if (!m) return "unknown";
    return m[1].toLowerCase() === "backwards" ? "backwards" : "ok";
  } catch (err: any) {
    console.warn(`[orientation-judge] error (${err?.message}) — skipping`);
    return "unknown";
  }
}
