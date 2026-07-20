/**
 * api/lab-run.ts
 *
 * Generic Replicate proxy for the admin Model Lab.
 * Accepts a Replicate model slug (optionally :version-pinned) and an input
 * payload, runs the model, fetches the output image, returns base64.
 *
 * Input (POST JSON):
 *   { modelSlug: string, input: Record<string, unknown> }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number, modelSlug: string }
 *   { ok: false, error: string, latencyMs?: number }
 *
 * Auth: requires a verified session (requireSession) so this generic
 * Replicate proxy isn't an anonymous faucet. No quota decrement — Model Lab
 * is an internal admin surface, not user-visible paid generation.
 */
import Replicate from "replicate";
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors, requireSession } from "./_lib/auth-middleware.js";
import { isAdminEmail } from "../shared/monetization.js";

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
    if (typeof o.output === "string") return o.output;
    if (Array.isArray(o.output)) return extractUrl(o.output);
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  // Gate: verified session required. Closes the anonymous-access hole.
  const session = await requireSession(req, res);
  if (!session) return;

  // Model Lab runs arbitrary Replicate models with no quota reservation, so a
  // valid session is not sufficient authorization. Without this check any free
  // signup can pick an expensive model and bill the shared Replicate account.
  if (!isAdminEmail(session.email)) {
    console.warn(`[lab-run] denied non-admin ${session.email}`);
    json(res, 403, { ok: false, error: "not authorized", code: "forbidden" });
    return;
  }

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: "REPLICATE_API_TOKEN not configured" });
    return;
  }

  const body = parseBody(req.body);
  const modelSlug = String(body.modelSlug || "").trim();
  const input =
    body.input && typeof body.input === "object" ? body.input : null;

  if (!modelSlug) {
    json(res, 400, { ok: false, error: "modelSlug is required" });
    return;
  }
  if (!input) {
    json(res, 400, { ok: false, error: "input object is required" });
    return;
  }

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(`[lab-run] Starting ${modelSlug}`);
    const output = await replicate.run(
      modelSlug as `${string}/${string}` | `${string}/${string}:${string}`,
      { input },
    );
    const url = await extractUrl(output);
    if (!url) {
      json(res, 200, {
        ok: false,
        error: "Model returned no image URL",
        latencyMs: Date.now() - t0,
      });
      return;
    }
    console.log(`[lab-run] ${modelSlug} produced URL in ${Date.now() - t0}ms`);

    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      json(res, 200, {
        ok: false,
        error: `result fetch ${imgRes.status}`,
        latencyMs: Date.now() - t0,
      });
      return;
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
    const resultBase64 = `data:${mime};base64,${buf.toString("base64")}`;

    json(res, 200, {
      ok: true,
      resultBase64,
      latencyMs: Date.now() - t0,
      modelSlug,
    });
  } catch (err: any) {
    const msg = err?.message || "unknown";
    console.error(`[lab-run] ${modelSlug} failed: ${msg}`);
    json(res, 200, { ok: false, error: msg, latencyMs: Date.now() - t0 });
  }
}
