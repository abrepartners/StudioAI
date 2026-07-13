/**
 * api/_lib/morph-finalize.ts — the ffmpeg concat, shared by /finalize (client
 * trigger) and /tick (cron). Kept in its OWN module so only those two functions
 * bundle the ffmpeg-static binary (via vercel.json includeFiles); the other
 * morph endpoints stay lean. Self-contained atomic claim (stitching ->
 * concatenating) so only one invocation ever runs the concat for a job.
 */
import { spawn } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { sbPatch, sbClaim, sbUploadReel, type MorphJob } from "./morph-core.js";

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

/** Stitch the two Seedance clips into the 9:16 loop, upload, mark the job done.
 *  No-op (returns current status) unless the job is at `stitching` and this
 *  caller wins the atomic claim. */
export async function finalizeJob(
  job: MorphJob,
): Promise<{ status: string; videoUrl?: string }> {
  if (job.status !== "stitching") return { status: job.status };
  if (!job.morph1_url || !job.morph2_url) return { status: job.status };

  const won = await sbClaim(job.id, "stitching", "concatenating");
  if (!won) return { status: "concatenating" };

  const dir = tmpdir();
  const p1 = path.join(dir, `${job.id}_1.mp4`);
  const p2 = path.join(dir, `${job.id}_2.mp4`);
  const out = path.join(dir, `${job.id}.mp4`);
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
    const videoUrl = await sbUploadReel(`${job.id}.mp4`, buf);
    await sbPatch(job.id, {
      video_url: videoUrl,
      status: "done",
      step: "done",
    });
    return { status: "done", videoUrl };
  } catch (e: any) {
    await sbPatch(job.id, {
      status: "error",
      error: "stitch failed: " + String(e?.message || e),
    });
    return { status: "error" };
  }
}
