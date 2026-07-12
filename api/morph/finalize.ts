/**
 * POST /api/morph/finalize — stitch the two Seedance clips into the 9:16 loop.
 * Body: { jobId }. The browser calls this once when /status reports "stitching".
 * Atomic status claim (stitching -> concatenating) guarantees only one concat
 * runs. Uses the bundled ffmpeg-static binary; uploads the reel to Supabase.
 */
import { spawn } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { json, parseBody } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  sbGet,
  sbPatch,
  sbClaim,
  sbUploadReel,
} from "../_lib/morph-core.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: "ignore" });
    p.on("close", (c) =>
      c === 0 ? resolve() : reject(new Error("ffmpeg exit " + c)),
    );
    p.on("error", reject);
  });
}

async function fetchTo(url: string, dest: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("download " + r.status);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const user = await requireMorphUser(req, res);
  if (!user) return;

  const { jobId } = parseBody(req.body);
  const job = await sbGet(jobId);
  if (!job) return json(res, 404, { ok: false, error: "unknown job" });
  // Already finished or being finished by another poll — nothing to do.
  if (job.status !== "stitching")
    return json(res, 200, { ok: true, status: job.status });
  if (!job.morph1_url || !job.morph2_url)
    return json(res, 409, { ok: false, error: "clips not ready" });

  // Only the invocation that wins this flip does the work.
  const won = await sbClaim(jobId, "stitching", "concatenating");
  if (!won) return json(res, 200, { ok: true, status: "concatenating" });

  const dir = tmpdir();
  const p1 = path.join(dir, `${jobId}_1.mp4`);
  const p2 = path.join(dir, `${jobId}_2.mp4`);
  const out = path.join(dir, `${jobId}.mp4`);
  try {
    await fetchTo(job.morph1_url, p1);
    await fetchTo(job.morph2_url, p2);
    // Normalize both to 1080x1920/24fps and concat in one pass (robust to any
    // per-clip param drift from Seedance).
    await run(String(ffmpegPath), [
      "-y",
      "-loglevel",
      "error",
      "-i",
      p1,
      "-i",
      p2,
      "-filter_complex",
      "[0:v]scale=1080:1920,setsar=1,fps=24[a];[1:v]scale=1080:1920,setsar=1,fps=24[b];[a][b]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      out,
    ]);
    const buf = await readFile(out);
    const videoUrl = await sbUploadReel(`${jobId}.mp4`, buf);
    await sbPatch(jobId, { video_url: videoUrl, status: "done", step: "done" });
    return json(res, 200, { ok: true, status: "done", videoUrl });
  } catch (e: any) {
    await sbPatch(jobId, {
      status: "error",
      error: "stitch failed: " + String(e?.message || e),
    });
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
