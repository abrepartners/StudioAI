/**
 * api/_lib/listing-copy-core.ts — listing copy text generation (server-only).
 *
 * Gemini text (gemini-2.5-flash via GEMINI_API_KEY), the same server-only
 * pattern as orientation-judge.ts. Shared by api/listing-copy.ts and the
 * listing batch pipeline so the prompt rules (Fair Housing, no em dashes)
 * are enforced in exactly one place.
 */
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export interface ListingCopy {
  headline: string;
  description: string;
  social_caption: string;
  hashtags: string[];
}

export const FALLBACK_COPY: ListingCopy = {
  headline: "Stunning Home, Move-In Ready",
  description:
    "This beautifully maintained home offers a perfect blend of comfort and style.",
  social_caption:
    "Dream home alert! ✨ This stunner is move-in ready. #JustListed #DreamHome #RealEstate",
  hashtags: ["#JustListed", "#DreamHome", "#RealEstate", "#HomeSweetHome"],
};

/** House rules folded into every copy prompt: Fair Housing + typography. */
const COPY_RULES =
  "Follow the Fair Housing Act strictly: describe the property only, never the buyer, never the neighborhood's demographics, and never language that steers toward or away from any protected class. Do not use em dashes anywhere; use commas, colons, or parentheses instead. Do not include any bracketed placeholders.";

export function buildListingCopyPrompt(
  roomsText: string,
  extraLines: string[] = [],
): string {
  return `You are a professional real estate copywriter. Generate a property listing for a home with these rooms: ${roomsText}.
${extraLines.filter(Boolean).join("\n")}
Write exactly three sections, separated by "---":

1. HEADLINE: One short, punchy headline (under 10 words) that grabs attention. Use emojis and numbers.

2. DESCRIPTION: A 2-3 paragraph MLS listing description in a warm, luxurious tone. Highlight the space, light, and potential.

3. SOCIAL CAPTION: A short Instagram caption (under 150 characters) with 3-5 relevant hashtags.

Keep it concise, professional, and buyer-focused. ${COPY_RULES}
Output only the three sections separated by "---", with no section labels.`;
}

/** Run the copy prompt through Gemini text. Throws on failure or missing key. */
export async function generateCopyText(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const text = (res.text || "").trim();
  if (!text) throw new Error("empty copy response");
  return text;
}

export function parseListingCopy(raw: string): ListingCopy {
  const parts = raw
    .split("---")
    .map((s) => s.trim())
    .filter(Boolean);
  const caption = parts[2] || FALLBACK_COPY.social_caption;
  const hashtags = caption.match(/#[A-Za-z0-9_]+/g) || FALLBACK_COPY.hashtags;
  return {
    headline: parts[0] || FALLBACK_COPY.headline,
    description: parts[1] || FALLBACK_COPY.description,
    social_caption: caption,
    hashtags,
  };
}
