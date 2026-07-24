/**
 * POST /api/listing-copy — generate MLS listing description and social captions.
 * Body: { rooms: string, propertyDetails?: { beds?, baths?, sqft?, price? } }
 * Returns: { ok, listing_copy: { headline, description, social_caption, hashtags } }
 *
 * Text generation runs on Gemini (gemini-2.5-flash via GEMINI_API_KEY), the
 * app's existing server-side text pattern (see api/_lib/orientation-judge.ts).
 * This is the endpoint the old geminiService.generateListingCopy TODO pointed
 * at: the copy step comes back online without a browser key.
 */
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors, requireServiceOrSession } from "./_lib/auth-middleware.js";
import {
  buildListingCopyPrompt,
  generateCopyText,
  parseListingCopy,
} from "./_lib/listing-copy-core.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;
  const session = await requireServiceOrSession(req, res);
  if (!session) return;
  if (!GEMINI_API_KEY)
    return json(res, 500, { ok: false, error: "GEMINI_API_KEY not configured" });

  const body = parseBody(req.body);
  const rooms = String(body.rooms || "").trim();
  const details = body.propertyDetails || {};
  if (!rooms) return json(res, 400, { ok: false, error: "rooms is required" });

  const beds = details.beds ? `${details.beds} bed, ` : "";
  const baths = details.baths ? `${details.baths} bath, ` : "";
  const sqft = details.sqft ? `${details.sqft} sqft, ` : "";
  const price = details.price
    ? `$${Number(details.price).toLocaleString()}`
    : "";
  const size = `${beds}${baths}${sqft}`.replace(/, $/, "");

  const prompt = buildListingCopyPrompt(rooms, [
    size ? `Size: ${size}` : "",
    price ? `Price: ${price}` : "",
    "The photos have been professionally edited and staged.",
  ]);

  try {
    const raw = await generateCopyText(prompt);
    return json(res, 200, { ok: true, listing_copy: parseListingCopy(raw) });
  } catch (err: any) {
    console.error("[listing-copy] error:", err?.message);
    return json(res, 200, { ok: false, error: err?.message || "unknown" });
  }
}
