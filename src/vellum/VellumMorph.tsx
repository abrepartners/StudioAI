/**
 * VellumMorph.tsx — Property Morph, as a NATIVE Vellum page (lives under Reels).
 *
 * Renders inside the Vellum app shell (v-main / v-page-head / v-btn / v-settings-card,
 * gold accent, Cormorant titles) — not a standalone route. Owner (book@averyandbryant.com)
 * gets the working tool; everyone else sees a Coming Soon panel. The render runs through
 * /api/morph/* (Replicate + Supabase); this page just drives start -> poll -> approve -> download.
 */
import React, { useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { readGoogleUser } from "../routes/authStorage";

const OWNER_EMAIL = "book@averyandbryant.com";

type Phase = "idle" | "working" | "approval" | "rendering" | "done" | "error";

interface StatusView {
  status: string;
  step: string;
  realUrl: string | null;
  constructionUrl: string | null;
  videoUrl: string | null;
  error: string | null;
}

/** Downscale a picked photo to a JPEG data URL, keeping the POST body well under
 *  Vercel's ~4.5MB limit (1920px is ample for the reframe). */
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

interface MorphProps {
  setPage: (p: string) => void;
}

const VellumMorph: React.FC<MorphProps> = () => {
  const isOwner = useMemo(() => readGoogleUser()?.email === OWNER_EMAIL, []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [view, setView] = useState<StatusView | null>(null);
  const [error, setError] = useState("");
  const jobId = useRef<string | null>(null);
  const finalizeSent = useRef(false);
  const polling = useRef(false);

  // ── Coming Soon for everyone but the owner ────────────────────────────────
  if (!isOwner) {
    return (
      <div className="v-main">
        <div className="v-page-head">
          <div>
            <div className="v-page-eyebrow">Video</div>
            <h1 className="v-page-title">
              Property <em>Morph</em>
            </h1>
            <p className="v-page-sub">
              Turn a single listing photo into a scroll-stopping vertical reel
              of the home transforming through its build.
            </p>
          </div>
        </div>
        <div
          className="v-settings-card"
          style={{ maxWidth: 520, marginTop: 8 }}
        >
          <div className="v-gold-rule" />
          <h3>Coming soon</h3>
          <p className="v-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Property Morph is in private testing. It's coming to your workspace
            soon.
          </p>
        </div>
      </div>
    );
  }

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
      let v: StatusView;
      try {
        v = await api(`/api/morph/status?id=${jobId.current}`);
      } catch {
        setStep("reconnecting...");
        return void setTimeout(tick, 3000);
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
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Video</div>
          <h1 className="v-page-title">
            Property <em>Morph</em>
          </h1>
          <p className="v-page-sub">
            Drop a front-facing listing photo. It builds a vertical reel of the
            house morphing into an active build site and back — a seamless loop
            for Reels and TikTok.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>
        {/* Upload + generate */}
        {(phase === "idle" || phase === "working") && (
          <>
            <label className="eyebrow" style={{ paddingLeft: 0 }}>
              1. Property photo
            </label>
            <label
              className="v-settings-card"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                padding: 28,
                cursor: busy ? "default" : "pointer",
                marginTop: 8,
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="source"
                  style={{ maxHeight: 220, borderRadius: "var(--radius-md)" }}
                />
              ) : (
                <>
                  <Icon name="upload" size={22} />
                  <span className="v-muted" style={{ fontSize: 13 }}>
                    Choose a front-facing photo
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={onPick}
                disabled={busy}
              />
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 16,
              }}
            >
              <span className="eyebrow" style={{ paddingLeft: 0 }}>
                2. The look
              </span>
              <span className="v-nav-badge">Under construction</span>
            </div>

            <button
              className="v-btn v-btn--primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
              onClick={onGenerate}
              disabled={!imageData || busy}
            >
              <Icon name="sparkles" size={14} />
              {phase === "working" ? "Working..." : "Generate frames"}
            </button>
          </>
        )}

        {(phase === "working" || phase === "rendering") && (
          <p className="v-muted" style={{ marginTop: 18, fontSize: 13 }}>
            {step}...
          </p>
        )}

        {/* Approval — both frames, one screen */}
        {phase === "approval" && view && (
          <div>
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                marginBottom: 4,
              }}
            >
              Do these look right?
            </h3>
            <p className="v-muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Check the reframed house looks like the real property and the
              build site reads right. Nothing renders until you approve.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                { src: view.realUrl, cap: "Reframed real house" },
                { src: view.constructionUrl, cap: "Under construction" },
              ].map((f) => (
                <div
                  key={f.cap}
                  className="v-settings-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <img
                    src={f.src || ""}
                    alt={f.cap}
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div
                    className="v-muted"
                    style={{
                      fontSize: 12,
                      textAlign: "center",
                      padding: "8px 0",
                    }}
                  >
                    {f.cap}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="v-btn v-btn--primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={onApprove}
              >
                <Icon name="sparkles" size={14} /> Approve &amp; build reel
              </button>
              <button
                className="v-btn v-btn--secondary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={onRegenerate}
              >
                <Icon name="video" size={14} /> Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Done — the reel */}
        {phase === "done" && view?.videoUrl && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <video
              src={view.videoUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: "100%",
                maxWidth: 320,
                borderRadius: "var(--radius-lg)",
              }}
            />
            <div
              style={{ display: "flex", gap: 10, marginTop: 18, width: "100%" }}
            >
              <a
                className="v-btn v-btn--primary"
                style={{ flex: 1, justifyContent: "center" }}
                href={view.videoUrl}
                download
              >
                <Icon name="image" size={14} /> Download reel
              </a>
              <button
                className="v-btn v-btn--secondary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={onReset}
              >
                Make another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div style={{ marginTop: 18 }}>
            <p style={{ color: "#c0402e", fontSize: 14 }}>Error: {error}</p>
            <button
              className="v-btn v-btn--secondary v-btn--sm"
              style={{ marginTop: 12 }}
              onClick={onReset}
            >
              Start over
            </button>
          </div>
        )}

        <p className="v-muted" style={{ marginTop: 36, fontSize: 11 }}>
          Frames take ~2-4 min. After you approve, the reel renders in ~6-10
          min. Keep this tab open.
        </p>
      </div>
    </div>
  );
};

export default VellumMorph;
