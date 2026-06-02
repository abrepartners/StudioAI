// reelEngine.ts — REAL cinematic reel renderer for Vellum "Video reels".
//
// Turns a listing's staged photos into a vertical (or square / wide) reel with
// eased Ken Burns motion, crossfades, a tasteful serif lower-third caption, and
// a branded end card. The SAME drawFrame() powers the live <canvas> preview in
// the editor and the offscreen HD export, so what you preview is what you get.
//
// Export is 100% in-browser: every frame is composited to an OffscreenCanvas,
// encoded to H.264 via the WebCodecs VideoEncoder, and muxed into a real MP4
// with mp4-muxer. No server, no fake delays. A credit should only be charged by
// the caller once exportMP4() resolves with an actual Blob.
//
// Dependency-light by design: only `mp4-muxer` + standard browser APIs.

import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// ---------------------------------------------------------------------------
// Public types (the editor imports ONLY this surface)
// ---------------------------------------------------------------------------

export type KenBurns = "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "drift";
export type ReelAspect = "9:16" | "1:1" | "16:9";

export interface ReelScene {
  id: string;
  dataUrl: string; // image source (data: URL, blob: URL, or http URL)
  caption: string; // room label / line shown in the lower-third
  durationSec: number; // how long this scene holds on screen
  kenBurns: KenBurns; // motion applied across the scene
}

export interface ReelBrand {
  brandName?: string;
  agentName?: string;
  phone?: string;
  logoDataUrl?: string;
  accent?: string; // hex accent; defaults to gold #d8c79a
}

export interface ReelConfig {
  scenes: ReelScene[];
  aspect: ReelAspect;
  showLowerThirds: boolean;
  endCard: boolean;
  brand: ReelBrand;
  fps?: number; // default 30
  transitionSec?: number; // crossfade overlap between scenes, default 0.6s
  // NOTE: music/audio is intentionally NOT rendered here in v1. It can be
  // carried alongside ReelConfig for a future server-side render that muxes a
  // soundtrack; the in-browser export below is video-only on purpose.
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = "#d8c79a"; // brand gold
const INK = "#0d0d0d"; // near-black surface
const TEXT = "#f7f6f2"; // warm off-white
const DEFAULT_FPS = 30;
const DEFAULT_TRANSITION = 0.6; // seconds of crossfade overlap
const END_CARD_SEC = 2.6; // duration of the branded end card
const SERIF =
  'Cormorant Garamond, "Cormorant Garamond", Georgia, "Times New Roman", serif';

const DIMS: Record<ReelAspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// easeInOutSine — buttery, symmetric easing for premium Ken Burns motion.
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Decode any source (data:, blob:, http:) into a bitmap we can draw cheaply.
async function decodeImage(
  src: string,
): Promise<ImageBitmap | HTMLImageElement> {
  // Prefer createImageBitmap — fast, works off the main thread, no <img> needed.
  if (typeof createImageBitmap === "function") {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    } catch {
      // fall through to <img> (e.g. some data: URLs / CORS quirks)
    }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load image: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

function imgW(b: ImageBitmap | HTMLImageElement): number {
  return (b as ImageBitmap).width || (b as HTMLImageElement).naturalWidth;
}
function imgH(b: ImageBitmap | HTMLImageElement): number {
  return (b as ImageBitmap).height || (b as HTMLImageElement).naturalHeight;
}

// ---------------------------------------------------------------------------
// ReelEngine
// ---------------------------------------------------------------------------

interface SceneRuntime {
  scene: ReelScene;
  bitmap: ImageBitmap | HTMLImageElement | null;
  start: number; // cumulative start time (seconds) on the timeline
}

export class ReelEngine {
  private cfg: ReelConfig;
  private fps: number;
  private transition: number;
  private accent: string;
  private dims: { w: number; h: number };
  private runtime: SceneRuntime[] = [];
  private logo: ImageBitmap | HTMLImageElement | null = null;
  private loaded = false;

  constructor(cfg: ReelConfig) {
    this.cfg = cfg;
    this.fps = cfg.fps && cfg.fps > 0 ? cfg.fps : DEFAULT_FPS;
    this.transition =
      cfg.transitionSec != null
        ? Math.max(0, cfg.transitionSec)
        : DEFAULT_TRANSITION;
    this.accent = cfg.brand.accent || DEFAULT_ACCENT;
    this.dims = DIMS[cfg.aspect] || DIMS["9:16"];
  }

  // load — decode every photo (and the logo) up front so drawFrame is sync/fast.
  async load(): Promise<void> {
    let cursor = 0;
    this.runtime = [];
    for (const scene of this.cfg.scenes) {
      let bitmap: ImageBitmap | HTMLImageElement | null = null;
      try {
        bitmap = await decodeImage(scene.dataUrl);
      } catch {
        bitmap = null; // a failed photo renders as the ink backdrop, never crashes
      }
      this.runtime.push({ scene, bitmap, start: cursor });
      cursor += Math.max(0.1, scene.durationSec);
    }
    if (this.cfg.brand.logoDataUrl) {
      try {
        this.logo = await decodeImage(this.cfg.brand.logoDataUrl);
      } catch {
        this.logo = null;
      }
    }
    this.loaded = true;
  }

  // durationSec — total timeline length, including the end card if enabled.
  get durationSec(): number {
    const scenesDur = this.runtime.length
      ? this.runtime[this.runtime.length - 1].start +
        Math.max(0.1, this.runtime[this.runtime.length - 1].scene.durationSec)
      : this.cfg.scenes.reduce((a, s) => a + Math.max(0.1, s.durationSec), 0);
    return scenesDur + (this.cfg.endCard ? END_CARD_SEC : 0);
  }

  // -------------------------------------------------------------------------
  // Frame compositing
  // -------------------------------------------------------------------------

  // drawFrame — composite the frame at time t onto ctx. Pure read of state, so
  // it is safe to call from rAF (preview) and from the export loop alike.
  drawFrame(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const { w, h } = this.dims;
    ctx.save();

    // Backdrop (also the letterbox color behind any non-covering frame).
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    const scenesDur = this.runtime.length
      ? this.runtime[this.runtime.length - 1].start +
        Math.max(0.1, this.runtime[this.runtime.length - 1].scene.durationSec)
      : 0;

    // End card phase.
    if (this.cfg.endCard && timeSec >= scenesDur) {
      const cardT = clamp((timeSec - scenesDur) / END_CARD_SEC, 0, 1);
      // Hold the last scene faintly behind, fading to ink, then reveal the card.
      const last = this.runtime[this.runtime.length - 1];
      if (last && last.bitmap) {
        const fade = clamp(1 - cardT * 1.6, 0, 1);
        if (fade > 0) {
          ctx.globalAlpha = fade * 0.5;
          this.drawScene(ctx, last, 1);
          ctx.globalAlpha = 1;
        }
      }
      this.drawEndCard(ctx, cardT);
      ctx.restore();
      return;
    }

    // Active scene at time t (cumulative-duration lookup).
    const idx = this.activeIndex(timeSec);
    const active = this.runtime[idx];
    if (!active) {
      ctx.restore();
      return;
    }

    const localT = timeSec - active.start;
    const activeDur = Math.max(0.1, active.scene.durationSec);
    const activeProgress = clamp(localT / activeDur, 0, 1);

    // Crossfade: during the last `transition` seconds, blend in the next scene.
    const next = this.runtime[idx + 1];
    const fadeWindowStart = activeDur - this.transition;
    const inCrossfade =
      next && this.transition > 0 && localT >= fadeWindowStart;

    if (inCrossfade && next) {
      const mix = clamp((localT - fadeWindowStart) / this.transition, 0, 1);
      const eased = easeInOutSine(mix);
      // Outgoing scene fades out.
      ctx.globalAlpha = 1 - eased;
      this.drawScene(ctx, active, activeProgress);
      // Incoming scene fades in (its motion has effectively just begun).
      ctx.globalAlpha = eased;
      this.drawScene(ctx, next, 0);
      ctx.globalAlpha = 1;
    } else {
      this.drawScene(ctx, active, activeProgress);
    }

    // Lower-third caption belongs to whichever scene currently dominates.
    if (this.cfg.showLowerThirds) {
      const showNext =
        inCrossfade &&
        next &&
        (localT - fadeWindowStart) / this.transition > 0.5;
      const capScene = showNext && next ? next.scene : active.scene;
      // Gentle fade of the caption near scene edges so it never pops.
      const capAlpha = this.captionAlpha(showNext ? 0.02 : activeProgress);
      this.drawLowerThird(ctx, capScene.caption, capAlpha);
    }

    ctx.restore();
  }

  private activeIndex(timeSec: number): number {
    for (let i = 0; i < this.runtime.length; i++) {
      const s = this.runtime[i];
      const end = s.start + Math.max(0.1, s.scene.durationSec);
      if (timeSec < end) return i;
    }
    return this.runtime.length - 1;
  }

  // captionAlpha — fade caption in over the first ~0.4 of progress, out at the end.
  private captionAlpha(progress: number): number {
    const fadeIn = clamp(progress / 0.12, 0, 1);
    const fadeOut = clamp((1 - progress) / 0.12, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  // drawScene — cover-fit the photo and apply its eased Ken Burns transform.
  private drawScene(
    ctx: CanvasRenderingContext2D,
    rt: SceneRuntime,
    progress: number,
  ): void {
    const { w, h } = this.dims;
    if (!rt.bitmap) {
      // Missing image: subtle vignette over the ink backdrop so it still reads.
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.1,
        w / 2,
        h / 2,
        h * 0.7,
      );
      g.addColorStop(0, "#1b1b1b");
      g.addColorStop(1, INK);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const bw = imgW(rt.bitmap);
    const bh = imgH(rt.bitmap);

    // Cover-fit scale (fills frame, preserves aspect, crops overflow — no distortion).
    const coverScale = Math.max(w / bw, h / bh);

    // Ken Burns: ease a slow 1.0 -> 1.08 zoom + directional pan across the scene.
    const e = easeInOutSine(clamp(progress, 0, 1));
    const ZOOM = 0.08; // 8% travel
    const PAN = 0.06; // 6% of frame for pans
    let scaleMul = 1;
    let dxFrac = 0;
    let dyFrac = 0;

    switch (rt.scene.kenBurns) {
      case "zoomIn":
        scaleMul = 1 + ZOOM * e;
        break;
      case "zoomOut":
        scaleMul = 1 + ZOOM * (1 - e);
        break;
      case "panLeft":
        scaleMul = 1 + ZOOM * 0.5; // slight overscan so the pan has room
        dxFrac = PAN * (0.5 - e); // travel right -> left
        break;
      case "panRight":
        scaleMul = 1 + ZOOM * 0.5;
        dxFrac = PAN * (e - 0.5); // travel left -> right
        break;
      case "drift":
      default:
        scaleMul = 1 + ZOOM * 0.6 * e;
        dxFrac = PAN * 0.4 * (e - 0.5);
        dyFrac = PAN * 0.4 * (0.5 - e); // gentle diagonal drift
        break;
    }

    const scale = coverScale * scaleMul;
    const drawW = bw * scale;
    const drawH = bh * scale;
    // Center, then apply pan offset (in frame fractions).
    const dx = (w - drawW) / 2 + dxFrac * w;
    const dy = (h - drawH) / 2 + dyFrac * h;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(rt.bitmap as CanvasImageSource, dx, dy, drawW, drawH);

    // Editorial bottom scrim so captions always have contrast (only when needed).
    if (this.cfg.showLowerThirds) {
      const scrim = ctx.createLinearGradient(0, h * 0.62, 0, h);
      scrim.addColorStop(0, "rgba(13,13,13,0)");
      scrim.addColorStop(1, "rgba(13,13,13,0.72)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
    }
  }

  // drawLowerThird — gold hairline + serif room label, AD-magazine restraint.
  private drawLowerThird(
    ctx: CanvasRenderingContext2D,
    caption: string,
    alpha: number,
  ): void {
    const text = (caption || "").trim();
    if (!text || alpha <= 0.01) return;

    const { w, h } = this.dims;
    const padX = Math.round(w * 0.075);
    const baseY = Math.round(h * 0.9);
    const hairlineLen = Math.round(w * 0.12);
    const fontSize = Math.round(w * 0.052);

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);

    // Gold hairline above the caption.
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = Math.max(2, Math.round(w * 0.0022));
    ctx.beginPath();
    ctx.moveTo(padX, baseY - fontSize - Math.round(h * 0.018));
    ctx.lineTo(padX + hairlineLen, baseY - fontSize - Math.round(h * 0.018));
    ctx.stroke();

    // Serif room label.
    ctx.fillStyle = TEXT;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = `400 ${fontSize}px ${SERIF}`;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(w * 0.01);
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, padX, baseY);

    ctx.restore();
  }

  // drawEndCard — near-black brand card with gold name/agent/phone + optional logo.
  private drawEndCard(ctx: CanvasRenderingContext2D, t: number): void {
    const { w, h } = this.dims;
    const brand = this.cfg.brand;
    const reveal = easeInOutSine(clamp(t / 0.5, 0, 1)); // ease the content in

    ctx.save();
    // Solid ink card layered over the fading last frame.
    ctx.globalAlpha = easeInOutSine(clamp(t / 0.45, 0, 1));
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    const cx = w / 2;
    let cy = h * 0.42;

    // Optional logo, cover-fit into a centered box above the text.
    if (this.logo) {
      const box = Math.min(w, h) * 0.22;
      const lw = imgW(this.logo);
      const lh = imgH(this.logo);
      const s = Math.min(box / lw, box / lh);
      const dw = lw * s;
      const dh = lh * s;
      ctx.globalAlpha = reveal;
      ctx.drawImage(
        this.logo as CanvasImageSource,
        cx - dw / 2,
        cy - dh - h * 0.04,
        dw,
        dh,
      );
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = reveal;

    // Brand name — gold, display serif.
    if (brand.brandName) {
      const fs = Math.round(w * 0.078);
      ctx.fillStyle = this.accent;
      ctx.font = `500 ${fs}px ${SERIF}`;
      ctx.fillText(brand.brandName, cx, cy);
      cy += fs * 0.95;
    }

    // Gold hairline divider.
    const lineW = w * 0.16;
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = Math.max(2, Math.round(w * 0.0022));
    ctx.beginPath();
    ctx.moveTo(cx - lineW / 2, cy);
    ctx.lineTo(cx + lineW / 2, cy);
    ctx.stroke();
    cy += h * 0.045;

    // Agent name — off-white serif.
    if (brand.agentName) {
      const fs = Math.round(w * 0.044);
      ctx.fillStyle = TEXT;
      ctx.font = `400 ${fs}px ${SERIF}`;
      ctx.fillText(brand.agentName, cx, cy);
      cy += fs * 1.2;
    }

    // Phone — muted, letter-spaced sans for legibility.
    if (brand.phone) {
      const fs = Math.round(w * 0.034);
      ctx.fillStyle = TEXT;
      ctx.font = `300 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.fillText(this.spaceOut(brand.phone), cx, cy);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Light letter-spacing for the phone line (canvas has no native tracking).
  private spaceOut(s: string): string {
    return s.split("").join(" ");
  }

  // -------------------------------------------------------------------------
  // Export support + HD MP4 encode
  // -------------------------------------------------------------------------

  // isExportSupported — WebCodecs VideoEncoder must exist (Chrome/Edge). The
  // editor uses this to show a graceful "Use Chrome for HD export" message
  // instead of failing at click time.
  static isExportSupported(): boolean {
    return (
      typeof VideoEncoder !== "undefined" &&
      typeof VideoFrame !== "undefined" &&
      (typeof OffscreenCanvas !== "undefined" ||
        (typeof document !== "undefined" &&
          typeof document.createElement === "function"))
    );
  }

  // exportMP4 — render every frame offscreen, encode H.264 via WebCodecs, mux to
  // an MP4 Blob entirely in the browser. Resolves with a real file or throws;
  // the caller charges a credit only on a resolved Blob.
  async exportMP4(onProgress?: (p: number) => void): Promise<Blob> {
    if (!ReelEngine.isExportSupported()) {
      throw new Error("HD export requires WebCodecs (use Chrome or Edge).");
    }
    if (!this.loaded) await this.load();

    const { w, h } = this.dims;
    const fps = this.fps;
    const totalFrames = Math.max(1, Math.round(this.durationSec * fps));

    // Offscreen drawing surface (fall back to a detached <canvas> if needed).
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(w, h);
    } else {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      canvas = c;
    }
    const ctx = canvas.getContext("2d", { alpha: false }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx)
      throw new Error("Could not acquire a 2D canvas context for export.");

    // Bitrate scales with pixel area; ~10 Mbps baseline at 1080x1920.
    const baseArea = 1080 * 1920;
    const bitrate = Math.round((10_000_000 * (w * h)) / baseArea);

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: w, height: h, frameRate: fps },
      // Fast Start: clean, seekable, broadly compatible MP4 held in memory.
      fastStart: "in-memory",
    });

    let encodeError: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });

    encoder.configure({
      codec: "avc1.640028", // H.264 High profile, level 4.0
      width: w,
      height: h,
      bitrate,
      framerate: fps,
      latencyMode: "quality",
    });

    const frameDurUs = Math.round(1_000_000 / fps);
    const keyEvery = Math.max(1, Math.round(fps * 2)); // keyframe ~every 2s

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (encodeError) throw encodeError;

        const t = i / fps;
        // Composite this frame (same code path as the live preview).
        this.drawFrame(ctx as CanvasRenderingContext2D, t);

        const frame = new VideoFrame(canvas as CanvasImageSource, {
          timestamp: i * frameDurUs,
          duration: frameDurUs,
        });
        encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
        frame.close();

        // Don't let the encoder queue balloon — keeps memory flat on long reels.
        if (encoder.encodeQueueSize > 8) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }

        if (onProgress) onProgress(((i + 1) / totalFrames) * 0.97);
      }

      await encoder.flush();
      if (encodeError) throw encodeError;
      muxer.finalize();
    } finally {
      try {
        encoder.close();
      } catch {
        /* already closed / errored */
      }
    }

    if (onProgress) onProgress(1);

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Export produced no data — no MP4 was created.");
    }
    return new Blob([buffer], { type: "video/mp4" });
  }
}
