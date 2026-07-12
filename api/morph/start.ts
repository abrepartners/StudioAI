/**
 * POST /api/morph/start — begin a morph reel.
 * Body: { imageBase64 } (a front-facing listing photo, data URL or bare base64)
 * Returns: { ok, jobId }. Kicks off the reframe; the browser then polls /status.
 */
import { randomUUID } from "node:crypto";
import { json, parseBody } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  uploadToReplicate,
  startReframe,
  sbInsert,
} from "../_lib/morph-core.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const user = await requireMorphUser(req, res);
  if (!user) return;

  try {
    const body = parseBody(req.body);
    const raw: string = body.imageBase64 || "";
    if (!raw) return json(res, 400, { ok: false, error: "no image" });
    const buf = Buffer.from(
      raw.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );
    if (!buf.length) return json(res, 400, { ok: false, error: "empty image" });

    const srcUrl = await uploadToReplicate(buf);
    const realPred = await startReframe(srcUrl);
    const id = "job_" + randomUUID().slice(0, 8);
    await sbInsert({
      id,
      email: user.email,
      status: "reframing",
      step: "reframing to vertical (keeping the whole house)",
      src_url: srcUrl,
      real_pred: realPred,
    });
    return json(res, 200, { ok: true, jobId: id });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
