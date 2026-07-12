/**
 * api/listing-copy.ts — AI listing-description text generation
 *
 * Server-side replacement for the purged browser-Gemini copy path (which
 * shipped a Gemini key in the client bundle). Runs a Replicate-hosted text
 * model with the SAME REPLICATE_API_TOKEN every image tool already uses — one
 * provider, one key, nothing new to configure.
 *
 * The client builds the full tone prompt with the shared
 * generate{Luxury,Casual,Investment}TonePrompt builders (src/prompts/
 * listingDescription.ts) and POSTs it here; this endpoint just runs it and
 * returns the finished copy. No images, no vision — pure text.
 *
 * Input (POST JSON):
 *   { prompt: string, tone?: string }
 *
 * Output (200 JSON):
 *   { ok: true, text: string, latencyMs: number }
 *   { ok: false, error: string, latencyMs?: number }
 */
import Replicate from "replicate";
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors, requireSession } from "./_lib/auth-middleware.js";
import { reserveQuota, refundQuota } from "./_lib/quota.js";

export const config = { runtime: "nodejs", maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

// Listing copy runs on a Replicate-hosted text model (single-provider: same
// token as every image tool). Swap this one line to change models. Text-only —
// registered in scripts/check-api-contract.mjs as { text: true }.
const LISTING_COPY_MODEL = "meta/meta-llama-3.1-405b-instruct";

// Our tone prompts land ~3-4k chars; cap well above that but bounded so the
// endpoint can't be turned into a general-purpose LLM faucet.
const MAX_PROMPT_CHARS = 12000;

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  // Gate: verified session (agent-facing surface, not a machine service).
  const session = await requireSession(req, res);
  if (!session) return;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: "REPLICATE_API_TOKEN not configured" });
    return;
  }

  const body = parseBody(req.body);
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    json(res, 400, { ok: false, error: "prompt is required" });
    return;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    json(res, 400, { ok: false, error: "prompt too long" });
    return;
  }

  // Reserve AFTER validation, BEFORE the paid Replicate call — one unit per
  // description, same accounting as the image tools (unlimited plans skip it;
  // free tier is capped). Refunded on any failure below so a user is never
  // charged for copy they didn't get.
  const quota = await reserveQuota(session.email, session.sub, 1);
  if (!quota.allowed) {
    json(res, 402, {
      ok: false,
      error: "generation quota reached",
      code: quota.reason || "quota_exhausted",
    });
    return;
  }

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // The tone prompt already embeds the full system persona + assignment, so
    // we pass it as `prompt` and use `system_prompt` only to strip any preamble
    // ("Here is the description:") so agents get paste-ready copy. max_tokens is
    // lifted well above the model's 512 default — descriptions target ~1200 words.
    const output = await replicate.run(LISTING_COPY_MODEL, {
      input: {
        prompt,
        system_prompt:
          "You are an expert real estate copywriter. Output ONLY the finished MLS description text — no preamble, no headings like 'Description:', no closing commentary.",
        max_tokens: 2560,
        temperature: 0.75,
        top_p: 0.9,
      },
    });

    // Replicate LLMs stream token arrays; join to a single string.
    const text = (Array.isArray(output) ? output.join("") : String(output)).trim();
    if (!text) {
      await refundQuota(quota.refundHandle);
      json(res, 200, {
        ok: false,
        error: "model returned empty text",
        latencyMs: Date.now() - t0,
      });
      return;
    }

    console.log(
      `[listing-copy] ${Date.now() - t0}ms tone=${String(body.tone || "?")} ${text.length} chars`,
    );
    json(res, 200, { ok: true, text, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    await refundQuota(quota.refundHandle);
    console.error("[listing-copy] failed:", err?.message || err);
    json(res, 200, {
      ok: false,
      error: err?.message || "unknown",
      latencyMs: Date.now() - t0,
    });
  }
}
