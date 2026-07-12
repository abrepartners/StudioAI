/**
 * MorphRoute.tsx — Property Morph Engine (owner-only).
 *
 * Drop a front-facing listing photo -> it reframes to a full-house vertical and
 * builds the under-construction frame -> STOP for approval (both frames) ->
 * Approve -> morph real -> construction -> real into a 9:16 loop for Reels/TikTok.
 *
 * Gated to book@averyandbryant.com (same gate as the admin routes). The heavy
 * render runs through /api/morph/* (Replicate + Supabase); this page just drives
 * it: start -> poll -> approve -> download. Template button #1 = Under Construction.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { readGoogleUser } from "./authStorage";
import {
  Upload,
  Check,
  RefreshCw,
  Download,
  Loader2,
  HardHat,
} from "lucide-react";

const OWNER_EMAIL = "book@averyandbryant.com";
const isOwner = (email: string) => email === OWNER_EMAIL;
const BLUE = "#0A84FF";

type Phase = "idle" | "working" | "approval" | "rendering" | "done" | "error";

interface StatusView {
  status: string;
  step: string;
  realUrl: string | null;
  constructionUrl: string | null;
  videoUrl: string | null;
  error: string | null;
}

/** Downscale a picked photo to a JPEG data URL. Keeps the POST body well under
 *  Vercel's ~4.5MB request limit (and 1920px is ample for the reframe). */
function downscale(file: File, maxDim = 1920): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas context"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

const api = (path: string, body?: unknown) =>
  fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const MorphRoute: React.FC = () => {
  const navigate = useNavigate();
  const user = useMemo(() => readGoogleUser(), []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [view, setView] = useState<StatusView | null>(null);
  const [error, setError] = useState("");
  const jobId = useRef<string | null>(null);
  const finalizeSent = useRef(false);
  const polling = useRef(false);

  useEffect(() => {
    if (!user || !isOwner(user.email)) navigate("/", { replace: true });
  }, [user, navigate]);
  useEffect(() => {
    document.title = "Property Morph · Vellum";
  }, []);

  if (!user || !isOwner(user.email)) return null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await downscale(file);
      setImageData(dataUrl);
      setPreview(dataUrl);
      setPhase("idle");
      setError("");
    } catch {
      setError("Could not read that image. Try a JPG or PNG.");
    }
  }

  async function poll() {
    if (polling.current) return;
    polling.current = true;
    const tick = async () => {
      if (!jobId.current) {
        polling.current = false;
        return;
      }
      let v: StatusView & { ok?: boolean; error?: string };
      try {
        v = await api(`/api/morph/status?id=${jobId.current}`);
      } catch {
        setStep("reconnecting...");
        return setTimeout(tick, 3000);
      }
      setView(v);
      if (v.status === "awaiting_approval") {
        setPhase("approval");
        polling.current = false;
        return;
      }
      if (v.status === "done") {
        setPhase("done");
        polling.current = false;
        return;
      }
      if (v.status === "error") {
        setPhase("error");
        setError(v.error || "render failed");
        polling.current = false;
        return;
      }
      if (v.status === "stitching" && !finalizeSent.current) {
        finalizeSent.current = true;
        api("/api/morph/finalize", { jobId: jobId.current }).catch(() => {});
      }
      setStep(v.step || "working");
      setTimeout(tick, 3000);
    };
    tick();
  }

  async function onGenerate() {
    if (!imageData) return;
    setPhase("working");
    setError("");
    setStep("starting...");
    finalizeSent.current = false;
    const r = await api("/api/morph/start", { imageBase64: imageData });
    if (!r.ok) {
      setPhase("error");
      setError(r.error || "could not start");
      return;
    }
    jobId.current = r.jobId;
    poll();
  }

  async function onApprove() {
    setPhase("rendering");
    setStep("rendering the reel...");
    finalizeSent.current = false;
    await api("/api/morph/approve", { jobId: jobId.current });
    poll();
  }

  async function onRegenerate() {
    setPhase("working");
    setStep("regenerating frames...");
    await api("/api/morph/regenerate", { jobId: jobId.current });
    poll();
  }

  function onReset() {
    jobId.current = null;
    finalizeSent.current = false;
    polling.current = false;
    setPhase("idle");
    setPreview(null);
    setImageData(null);
    setView(null);
    setStep("");
    setError("");
  }

  const busy = phase === "working" || phase === "rendering";

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-display text-lg tracking-tight">
            Vellum
          </Link>
          <nav className="flex items-center gap-4 text-xs text-zinc-400">
            <Link to="/" className="hover:text-white transition">
              Studio
            </Link>
            <Link to="/listings" className="hover:text-white transition">
              Listings
            </Link>
            <span className="text-white font-semibold">Property Morph</span>
          </nav>
        </div>
        <span className="text-[11px] text-zinc-500">Owner tool</span>
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-1">
          <HardHat size={18} style={{ color: BLUE }} />
          <h1 className="text-xl font-semibold tracking-tight">
            Property Morph
          </h1>
        </div>
        <p className="text-sm text-zinc-400 mb-8">
          Drop a front-facing listing photo. It builds a vertical reel of the
          house morphing into an active build site and back — a seamless loop
          for Reels and TikTok.
        </p>

        {/* Step 1 — upload (hidden once we're deep in a job) */}
        {(phase === "idle" || phase === "working") && (
          <>
            <label className="block text-xs text-zinc-400 mb-2">
              1. Property photo
            </label>
            <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/[0.12] rounded-xl py-8 cursor-pointer hover:border-white/25 transition">
              {preview ? (
                <img
                  src={preview}
                  alt="source"
                  className="max-h-56 rounded-lg"
                />
              ) : (
                <>
                  <Upload size={22} className="text-zinc-500" />
                  <span className="text-sm text-zinc-400">
                    Choose a front-facing photo
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
                disabled={busy}
              />
            </label>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400">2. The look</span>
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ background: BLUE, color: "#000" }}
              >
                Under construction
              </span>
            </div>

            <button
              onClick={onGenerate}
              disabled={!imageData || busy}
              className="w-full mt-6 py-3 rounded-lg font-semibold text-sm text-black disabled:opacity-40 transition"
              style={{ background: BLUE }}
            >
              {phase === "working" ? "Working..." : "Generate frames"}
            </button>
          </>
        )}

        {/* Progress line */}
        {(phase === "working" || phase === "rendering") && (
          <div
            className="mt-6 flex items-center gap-2 text-sm"
            style={{ color: BLUE }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>{step}</span>
          </div>
        )}

        {/* Step 3 — approval: both frames, one screen */}
        {phase === "approval" && view && (
          <div className="mt-2">
            <h2 className="text-base font-semibold">Do these look right?</h2>
            <p className="text-xs text-zinc-400 mt-1 mb-4">
              Check the reframed house looks like the real property and the
              build site reads right. Nothing renders until you approve.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <figure className="rounded-xl overflow-hidden border border-white/[0.08] bg-zinc-900">
                <img
                  src={view.realUrl || ""}
                  alt="reframed real"
                  className="w-full aspect-[2/3] object-cover"
                />
                <figcaption className="text-[11px] text-zinc-400 text-center py-2">
                  Reframed real house
                </figcaption>
              </figure>
              <figure className="rounded-xl overflow-hidden border border-white/[0.08] bg-zinc-900">
                <img
                  src={view.constructionUrl || ""}
                  alt="under construction"
                  className="w-full aspect-[2/3] object-cover"
                />
                <figcaption className="text-[11px] text-zinc-400 text-center py-2">
                  Under construction
                </figcaption>
              </figure>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={onApprove}
                className="flex-1 py-3 rounded-lg font-semibold text-sm text-black flex items-center justify-center gap-2"
                style={{ background: BLUE }}
              >
                <Check size={16} /> Approve &amp; build reel
              </button>
              <button
                onClick={onRegenerate}
                className="flex-1 py-3 rounded-lg font-semibold text-sm bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center gap-2 transition"
              >
                <RefreshCw size={16} /> Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Done — the reel */}
        {phase === "done" && view?.videoUrl && (
          <div className="mt-2 flex flex-col items-center">
            <video
              src={view.videoUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-w-[320px] rounded-2xl border border-white/[0.08]"
            />
            <div className="flex gap-3 mt-5 w-full">
              <a
                href={view.videoUrl}
                download
                className="flex-1 py-3 rounded-lg font-semibold text-sm text-black flex items-center justify-center gap-2"
                style={{ background: BLUE }}
              >
                <Download size={16} /> Download reel
              </a>
              <button
                onClick={onReset}
                className="flex-1 py-3 rounded-lg font-semibold text-sm bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition"
              >
                Make another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="mt-6">
            <p className="text-sm" style={{ color: "#FF375F" }}>
              Error: {error}
            </p>
            <button
              onClick={onReset}
              className="mt-4 px-4 py-2 rounded-lg text-sm bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition"
            >
              Start over
            </button>
          </div>
        )}

        <p className="mt-10 text-[11px] text-zinc-600">
          Frames take ~2-4 min. After you approve, the reel renders in ~6-10
          min. Keep this tab open.
        </p>
      </main>
    </div>
  );
};

export default MorphRoute;
