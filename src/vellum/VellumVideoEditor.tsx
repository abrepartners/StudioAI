import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { saveAs } from "file-saver";
import { Icon } from "./icons";
import { useBrandKit } from "../../hooks/useBrandKit";
import { loadPhotos, loadResults } from "./imageStore";
import {
  ReelEngine,
  type ReelScene,
  type ReelAspect,
  type ReelConfig,
  type ReelBrand,
} from "./reelEngine";

interface VideoEditorProps {
  setPage: (p: string) => void;
  credits: number;
  requestSpend: (amount: number, after?: (res: any) => void) => boolean;
  recordGeneration: (amount?: number) => void;
  activeProject?: {
    id: string;
    address: string;
    city: string;
    propertyType: string;
    beds: number | null;
    baths: number | null;
  } | null;
}

const REEL_COST = 4;

// Rotating Ken Burns motion so adjacent scenes never share the same move.
const KEN_BURNS: ReelScene["kenBurns"][] = [
  "zoomIn",
  "panRight",
  "zoomOut",
  "panLeft",
  "drift",
];

// Pace maps to per-scene hold + crossfade length.
const PACE_MAP: Record<string, { dur: number; transition: number }> = {
  gentle: { dur: 4.5, transition: 0.9 },
  medium: { dur: 3.5, transition: 0.6 },
  dynamic: { dur: 2.6, transition: 0.4 },
};

const ASPECT_TO_REEL: Record<string, ReelAspect> = {
  "9_16": "9:16",
  "1_1": "1:1",
  "16_9": "16:9",
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
};

const slugify = (s: string) =>
  (s || "listing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "listing";

const VellumVideoEditor: React.FC<VideoEditorProps> = ({
  setPage,
  requestSpend,
  recordGeneration,
  activeProject,
}) => {
  const { brandKit } = useBrandKit();

  const listingName = activeProject?.address || "New listing reel";
  const listingMeta = activeProject
    ? `${activeProject.city || ""}${activeProject.beds ? ` · ${activeProject.beds} BD` : ""}${activeProject.baths ? ` · ${activeProject.baths} BA` : ""}`
    : "";

  // ── Editor controls (drive ReelConfig) ──────────────────────────────────────
  const [aspect, setAspect] = useState<string>("9_16");
  const [pace, setPace] = useState<string>("medium");
  const [music, setMusic] = useState<string>("still-water");
  const [endCardOn, setEndCardOn] = useState(true);
  const [showLowerThirds, setShowLowerThirds] = useState(true);

  // ── Scene + transport state ─────────────────────────────────────────────────
  const [scenes, setScenes] = useState<ReelScene[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // ── Export state ─────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportSupported = useMemo(() => ReelEngine.isExportSupported(), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ReelEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const scrubRef = useRef(0);
  const playingRef = useRef(false);
  scrubRef.current = scrub;
  playingRef.current = playing;

  const reelAspect = ASPECT_TO_REEL[aspect];
  const paceCfg = PACE_MAP[pace] || PACE_MAP.medium;

  // ── 1) Load REAL project photos into scenes (no stock fallback) ──────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingPhotos(true);
    setScenes([]);
    if (!activeProject) {
      setLoadingPhotos(false);
      return;
    }
    (async () => {
      try {
        const [photos, results] = await Promise.all([
          loadPhotos(activeProject.id),
          loadResults(activeProject.id),
        ]);
        if (cancelled) return;
        const next: ReelScene[] = photos.map((p, i) => ({
          id: `scene_${p.photoId}`,
          // Prefer the refined/staged render; fall back to the original upload.
          dataUrl: results[p.photoId] || p.dataUrl,
          caption: p.label || "Listing",
          durationSec: paceCfg.dur,
          kenBurns: KEN_BURNS[i % KEN_BURNS.length],
        }));
        setScenes(next);
        setActiveIdx(0);
        setScrub(0);
      } catch {
        if (!cancelled) setScenes([]);
      } finally {
        if (!cancelled) setLoadingPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  // Re-time every scene when pace changes (keep order/photos intact).
  useEffect(() => {
    setScenes((prev) =>
      prev.length
        ? prev.map((s) => ({ ...s, durationSec: paceCfg.dur }))
        : prev,
    );
  }, [pace]);

  // ── Brand kit → ReelBrand ────────────────────────────────────────────────────
  const brand: ReelBrand = useMemo(
    () => ({
      brandName: brandKit.brokerageName || undefined,
      agentName: brandKit.agentName || undefined,
      phone: brandKit.phone || undefined,
      logoDataUrl: brandKit.logo || undefined,
      accent: "#d8c79a",
    }),
    [brandKit.brokerageName, brandKit.agentName, brandKit.phone, brandKit.logo],
  );

  // ── ReelConfig: every control flows in here so it drives the output ──────────
  const reelConfig: ReelConfig = useMemo(
    () => ({
      scenes,
      aspect: reelAspect,
      showLowerThirds,
      endCard: endCardOn,
      brand,
      fps: 30,
      transitionSec: paceCfg.transition,
    }),
    [scenes, reelAspect, showLowerThirds, endCardOn, brand, paceCfg.transition],
  );

  // ── 2) Build / reload the engine when config changes ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    setEngineReady(false);
    engineRef.current = null;
    if (!scenes.length) return;
    const engine = new ReelEngine(reelConfig);
    (async () => {
      try {
        await engine.load();
        if (cancelled) return;
        engineRef.current = engine;
        setEngineReady(true);
      } catch {
        if (!cancelled) setEngineReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reelConfig]);

  // durationSec is a getter on ReelEngine — access as a property, never call it.
  const totalDur =
    engineReady && engineRef.current
      ? engineRef.current.durationSec
      : scenes.reduce((a, s) => a + s.durationSec, 0) + (endCardOn ? 2.6 : 0);

  // ── 2) rAF render loop driving the preview canvas ────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (engine && canvas) {
        const ctx = canvas.getContext("2d");
        const dur = engine.durationSec;
        if (playingRef.current) {
          const dt = (t - last) / 1000;
          let next = scrubRef.current + dt;
          if (next >= dur) {
            next = 0;
            setPlaying(false);
          }
          scrubRef.current = next;
          setScrub(next);
          // Keep the active storyboard card synced to playhead.
          let acc = 0;
          for (let i = 0; i < scenes.length; i++) {
            acc += scenes[i].durationSec;
            if (next < acc) {
              setActiveIdx(i);
              break;
            }
          }
        }
        if (ctx) engine.drawFrame(ctx, Math.min(scrubRef.current, dur));
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineReady, scenes]);

  // ── Storyboard drag-to-reorder ───────────────────────────────────────────────
  const dragIdRef = useRef<string | null>(null);
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch (_) {}
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIdx(idx);
  };
  const onDragEnd = () => {
    dragIdRef.current = null;
    setOverIdx(null);
  };
  const onDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragIdRef.current;
    if (!id) return;
    setScenes((prev) => {
      const from = prev.findIndex((s) => s.id === id);
      if (from < 0) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      const insertAt = idx > from ? idx - 1 : idx;
      next.splice(insertAt, 0, m);
      // Re-assign Ken Burns so the new order keeps varied motion.
      return next.map((s, i) => ({
        ...s,
        kenBurns: KEN_BURNS[i % KEN_BURNS.length],
      }));
    });
    onDragEnd();
  };

  const seekTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(totalDur, t));
      scrubRef.current = clamped;
      setScrub(clamped);
      let acc = 0;
      for (let i = 0; i < scenes.length; i++) {
        acc += scenes[i].durationSec;
        if (clamped < acc) {
          setActiveIdx(i);
          break;
        }
      }
    },
    [totalDur, scenes],
  );

  // ── 3) REAL export: gate → encode → download → charge only on success ────────
  const handleExport = useCallback(() => {
    if (!exportSupported || exporting) return;
    const engine = engineRef.current;
    if (!engine) return;
    setExportError(null);

    // Gate ONLY — checks affordability / opens refill. Does NOT charge here.
    const affordable = requestSpend(REEL_COST);
    if (!affordable) return;

    setExporting(true);
    setExportProgress(0);
    setPlaying(false);

    (async () => {
      try {
        const blob = await engine.exportMP4((p) => setExportProgress(p));
        if (!blob || blob.size === 0) throw new Error("empty");
        const file = `studioai_reel_${slugify(activeProject?.address || "")}.mp4`;
        saveAs(blob, file);
        // ONLY now — a real MP4 file exists on disk — charge the credit.
        recordGeneration(REEL_COST);
      } catch (err) {
        setExportError(
          "Export failed before a file was created — no credit was used. Try again.",
        );
      } finally {
        setExporting(false);
        setExportProgress(0);
      }
    })();
  }, [
    exportSupported,
    exporting,
    requestSpend,
    recordGeneration,
    activeProject?.address,
  ]);

  const previewMax = aspect === "9_16" ? 320 : aspect === "1_1" ? 480 : 640;
  const previewRatio =
    aspect === "9_16" ? "9/16" : aspect === "1_1" ? "1/1" : "16/9";

  // ── Empty state: no project, or project has no photos ────────────────────────
  if (!activeProject || (!loadingPhotos && scenes.length === 0)) {
    return (
      <div className="v-screen v-video-editor">
        <div className="v-screen-head">
          <div>
            <div className="v-crumb">
              <a onClick={() => setPage("projects")}>Projects</a>
              <Icon name="chevron_right" size={11} /> <span>Listing reel</span>
            </div>
            <h1 className="v-display">Listing reel</h1>
          </div>
        </div>
        <div
          className="v-empty-state"
          style={{ margin: "0 auto", maxWidth: 480 }}
        >
          <div className="v-empty-icon">
            <Icon name="video" size={26} />
          </div>
          <h3>
            {activeProject
              ? "No photos in this listing yet"
              : "No active listing"}
          </h3>
          <p>
            {activeProject
              ? "Add and stage photos in the Photo editor first — your refined images become the cinematic reel."
              : "Open a listing from Projects, then add photos in the Photo editor to build a reel."}
          </p>
          <button
            className="v-btn v-btn--primary"
            style={{ marginTop: 18 }}
            onClick={() => setPage(activeProject ? "photo" : "projects")}
          >
            <Icon name={activeProject ? "image" : "folder"} size={13} />{" "}
            {activeProject ? "Go to Photo editor" : "Open Projects"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="v-screen v-video-editor">
      <div className="v-screen-head">
        <div>
          <div className="v-crumb">
            <a onClick={() => setPage("projects")}>Projects</a>
            <Icon name="chevron_right" size={11} /> {listingName}
            <Icon name="chevron_right" size={11} /> <span>Listing reel</span>
          </div>
          <h1 className="v-display">
            Listing reel
            {activeProject ? (
              <>
                {" "}
                <em>·</em>{" "}
                {activeProject.address.split(" ").slice(-2).join(" ")}
              </>
            ) : (
              ""
            )}
          </h1>
          <div className="v-meta-row">
            <span>
              <Icon name="play" size={11} /> {fmt(totalDur)}
            </span>
            <span className="v-dot-sep" />
            <span>
              {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
              {endCardOn ? " + end card" : ""}
            </span>
            <span className="v-dot-sep" />
            <span>
              {exportSupported
                ? "HD export ready"
                : "Preview only on this browser"}
            </span>
          </div>
        </div>
        <div className="v-head-actions">
          <button
            className="v-btn v-btn--ghost"
            onClick={() => setPage("photo")}
          >
            <Icon name="image" size={13} /> Switch to photos
          </button>
          <button
            className="v-btn v-btn--primary"
            onClick={handleExport}
            disabled={!exportSupported || exporting || !engineReady}
          >
            {exporting ? (
              `Exporting ${Math.round(exportProgress * 100)}%`
            ) : (
              <>
                Export reel <Icon name="download" size={13} />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="v-video-grid">
        <div className="v-video-stage">
          <div
            className="v-preview-frame"
            style={{ aspectRatio: previewRatio, maxWidth: previewMax }}
          >
            <canvas
              ref={canvasRef}
              width={
                reelAspect === "9:16"
                  ? 1080
                  : reelAspect === "1:1"
                    ? 1080
                    : 1920
              }
              height={
                reelAspect === "9:16"
                  ? 1920
                  : reelAspect === "1:1"
                    ? 1080
                    : 1080
              }
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {!engineReady && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#888580",
                  fontSize: 13,
                  letterSpacing: "0.04em",
                }}
              >
                {loadingPhotos ? "Loading photos…" : "Preparing preview…"}
              </div>
            )}
            <div className="v-aspect-badge">{aspect.replace("_", ":")}</div>
          </div>

          <div className="v-transport">
            <button
              className="v-play-btn"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
              disabled={!engineReady}
            >
              <Icon name={playing ? "pause" : "play"} size={14} />
            </button>
            <div className="v-time">{fmt(scrub)}</div>
            <div
              className="v-scrub-track"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                seekTo(x * totalDur);
              }}
            >
              {scenes.map((s, i) => {
                const start = scenes
                  .slice(0, i)
                  .reduce((a, x) => a + x.durationSec, 0);
                const w = (s.durationSec / totalDur) * 100;
                return (
                  <div
                    key={s.id}
                    className={"v-scrub-seg" + (i === activeIdx ? " on" : "")}
                    style={{
                      left: `${(start / totalDur) * 100}%`,
                      width: `${w}%`,
                    }}
                  />
                );
              })}
              <div
                className="v-scrub-head"
                style={{ left: `${(scrub / totalDur) * 100}%` }}
              />
            </div>
            <div className="v-time dim">{fmt(totalDur)}</div>
          </div>

          <div className="v-storyboard-head">
            <div>
              <div className="v-eyebrow">Storyboard</div>
              <div className="v-hint">
                Drag to reorder · click to scrub · {scenes.length} staged photos
                {endCardOn ? " + branded end card" : ""}
              </div>
            </div>
          </div>

          <div className="v-storyboard">
            {scenes.map((s, i) => (
              <React.Fragment key={s.id}>
                <div
                  className={"v-drop-slot" + (overIdx === i ? " over" : "")}
                  onDragOver={onDragOver(i)}
                  onDrop={onDrop(i)}
                />
                <div
                  className={"v-sb-card" + (i === activeIdx ? " active" : "")}
                  draggable
                  onDragStart={onDragStart(s.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => {
                    const start = scenes
                      .slice(0, i)
                      .reduce((a, x) => a + x.durationSec, 0);
                    seekTo(start);
                  }}
                >
                  <div className="v-sb-grip">
                    <Icon name="grip" size={14} />
                  </div>
                  <div className="v-sb-thumb">
                    <img src={s.dataUrl} alt={s.caption} />
                  </div>
                  <div className="v-sb-meta">
                    <div className="v-sb-num">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="v-sb-title">{s.caption}</div>
                    <div className="v-sb-dur">{s.durationSec.toFixed(1)}s</div>
                  </div>
                </div>
              </React.Fragment>
            ))}
            <div
              className={
                "v-drop-slot" + (overIdx === scenes.length ? " over" : "")
              }
              onDragOver={onDragOver(scenes.length)}
              onDrop={onDrop(scenes.length)}
            />
          </div>
        </div>

        <aside className="v-video-rail">
          <div className="v-rail-section">
            <div className="v-rail-label">Format</div>
            <div className="v-aspect-row">
              {[
                {
                  id: "9_16",
                  label: "9:16",
                  sub: "Reels · TikTok",
                  frame: { w: 18, h: 32 },
                },
                {
                  id: "1_1",
                  label: "1:1",
                  sub: "Instagram feed",
                  frame: { w: 26, h: 26 },
                },
                {
                  id: "16_9",
                  label: "16:9",
                  sub: "YouTube · MLS",
                  frame: { w: 32, h: 18 },
                },
              ].map((a) => (
                <button
                  key={a.id}
                  className={"v-aspect-btn" + (aspect === a.id ? " on" : "")}
                  onClick={() => setAspect(a.id)}
                >
                  <div
                    className="v-aspect-frame"
                    style={{ width: a.frame.w, height: a.frame.h }}
                  />
                  <div className="v-aspect-label">{a.label}</div>
                  <div className="v-aspect-sub">{a.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label">Pace</div>
            <div className="v-seg">
              {["gentle", "medium", "dynamic"].map((p) => (
                <button
                  key={p}
                  className={"v-seg-btn" + (pace === p ? " on" : "")}
                  onClick={() => setPace(p)}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label-row">
              <div className="v-rail-label">Music bed</div>
            </div>
            <div className="v-music-list">
              {[
                {
                  id: "still-water",
                  name: "Still Water",
                  mood: "Editorial · piano",
                },
                {
                  id: "linen-light",
                  name: "Linen Light",
                  mood: "Warm · strings",
                },
                { id: "dusk", name: "Dusk", mood: "Cinematic · low" },
                { id: "silent", name: "No music", mood: "Silent reel" },
              ].map((m) => (
                <button
                  key={m.id}
                  className={"v-music-row" + (music === m.id ? " on" : "")}
                  onClick={() => setMusic(m.id)}
                >
                  <span className="v-music-icon">
                    <Icon name={m.id === "silent" ? "x" : "music"} size={13} />
                  </span>
                  <span className="v-music-meta">
                    <span className="v-music-name">{m.name}</span>
                    <span className="v-music-mood">{m.mood}</span>
                  </span>
                  {music === m.id && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
            <div className="v-export-note" style={{ marginTop: 8 }}>
              In-app export is video-only for now — your music choice is saved
              and applied when you render with sound later.
            </div>
          </div>

          <div className="v-rail-section">
            <div className="v-rail-label">Overlays</div>
            <label className="v-check-row">
              <span>Lower-third captions</span>
              <button
                className={"v-switch" + (showLowerThirds ? " on" : "")}
                onClick={() => setShowLowerThirds((v) => !v)}
              >
                <span />
              </button>
            </label>
            <label className="v-check-row">
              <span>Branded end card</span>
              <button
                className={"v-switch" + (endCardOn ? " on" : "")}
                onClick={() => setEndCardOn((v) => !v)}
              >
                <span />
              </button>
            </label>
          </div>

          <div className="v-rail-section v-export-block">
            <div className="v-rail-label">Export</div>
            {!exportSupported ? (
              <div className="v-export-note">
                <Icon
                  name="help"
                  size={12}
                  style={{ verticalAlign: "-2px", marginRight: 6 }}
                />
                HD export needs Chrome or Edge — or connect a render box later.
                Your reel still plays in the preview here.
              </div>
            ) : (
              <>
                <button
                  className="v-export-row primary"
                  onClick={handleExport}
                  disabled={exporting || !engineReady}
                >
                  <span>
                    <Icon name="download" size={13} /> Export{" "}
                    <strong>{aspect.replace("_", ":")}</strong> MP4
                  </span>
                  <span className="dim">
                    {exporting
                      ? `${Math.round(exportProgress * 100)}%`
                      : `1080p · 30fps · ${REEL_COST} cr`}
                  </span>
                </button>
                {exporting && (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(exportProgress * 100)}%`,
                        background: "#d8c79a",
                        transition: "width 0.15s linear",
                      }}
                    />
                  </div>
                )}
                {exportError && (
                  <div className="v-export-note" style={{ color: "#e0857a" }}>
                    {exportError}
                  </div>
                )}
                <div className="v-export-note">
                  Export downloads an HD MP4 to your device. A credit is used
                  only when the file is created.
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default VellumVideoEditor;
