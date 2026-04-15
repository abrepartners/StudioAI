import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, X, Type, Image as ImageIcon, Check, Share2, Heart, Video, Loader2 } from 'lucide-react';
import { compositePreserve } from '../utils/compositePreserve';
import type { BrandKit } from '../hooks/useBrandKit';

const STORAGE_KEY = 'studioai_export_settings';

interface ExportSettings {
  disclaimerEnabled: boolean;
  disclaimerType: 'text' | 'icon';
  disclaimerText: string;
  disclaimerIcon: string | null; // base64
  position: 'bottom-left' | 'bottom-right' | 'bottom-center';
  opacity: number;
}

const DEFAULT_SETTINGS: ExportSettings = {
  disclaimerEnabled: false,
  disclaimerType: 'text',
  disclaimerText: 'Virtually Staged',
  disclaimerIcon: null,
  position: 'bottom-left',
  opacity: 0.7,
};

interface ExportModalProps {
  imageBase64: string;
  originalImage?: string;
  editHistory?: string[];
  onClose: () => void;
  onShare?: () => void;
  brandKit?: BrandKit;
}

const ExportModal: React.FC<ExportModalProps> = ({ imageBase64, originalImage, editHistory = [], onClose, onShare, brandKit }) => {
  const [settings, setSettings] = useState<ExportSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [exporting, setExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shareToGallery, setShareToGallery] = useState(false);
  const [shared, setShared] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoAspect, setVideoAspect] = useState<'original' | '1:1' | '4:5' | '9:16'>('original');
  const iconInputRef = useRef<HTMLInputElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Save settings whenever they change
  useEffect(() => {
    try {
      const toSave = { ...settings };
      // Don't save icon base64 to localStorage (too large) — save flag only
      const saveObj = { ...toSave, disclaimerIcon: toSave.disclaimerIcon ? '__saved__' : null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveObj));
    } catch {}
  }, [settings]);

  // Generate preview
  useEffect(() => {
    if (!settings.disclaimerEnabled) {
      setPreviewUrl(null);
      return;
    }
    renderWithDisclaimer(imageBase64, settings).then(setPreviewUrl);
  }, [imageBase64, settings]);

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSettings(prev => ({ ...prev, disclaimerIcon: reader.result as string, disclaimerType: 'icon' }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Composite: preserve original sharpness in unchanged areas
      let finalImage = imageBase64;
      if (originalImage) {
        finalImage = await compositePreserve(originalImage, imageBase64);
      }

      // Apply disclaimer if enabled
      if (settings.disclaimerEnabled) {
        const rendered = await renderWithDisclaimer(finalImage, settings);
        if (rendered) finalImage = rendered;
      }

      const link = document.createElement('a');
      link.href = finalImage;
      // Build filename from edit history: studioai_staging+cleanup+twilight_1234.png
      const toolSlug = editHistory.length > 0
        ? `_${[...new Set(editHistory)].join('+')}`
        : '';
      link.download = `studioai${toolSlug}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Share to gallery if opted in
      if (shareToGallery && onShare) {
        onShare();
        setShared(true);
      }

      onClose();
    } finally {
      setExporting(false);
    }
  };

  const generateRevealVideo = useCallback(async () => {
    if (!originalImage) return;
    setVideoGenerating(true);
    setVideoProgress(0);

    try {
      // Load both images first (needed for 'original' aspect ratio)
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`;
        });

      const [beforeImg, afterImg] = await Promise.all([
        loadImg(originalImage),
        loadImg(imageBase64),
      ]);

      // Canvas dimensions — 'original' matches the photo's native ratio
      let canvasWidth = 1080;
      let canvasHeight: number;
      if (videoAspect === 'original') {
        const ratio = beforeImg.naturalHeight / beforeImg.naturalWidth;
        canvasWidth = Math.min(beforeImg.naturalWidth, 1920); // cap at 1920 wide
        canvasHeight = Math.round(canvasWidth * ratio);
      } else {
        canvasHeight = videoAspect === '1:1' ? 1080 : videoAspect === '4:5' ? 1350 : 1920;
      }

      // Determine if we have a usable brand kit
      const hasBrand = !!(brandKit && brandKit.agentName.trim());
      const brandBarHeight = hasBrand ? 80 : 0;

      // Pre-load brand logo if available
      let brandLogoImg: HTMLImageElement | null = null;
      if (hasBrand && brandKit?.logo) {
        brandLogoImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = brandKit.logo!;
        });
      }

      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      videoCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d')!;

      // Helper: draw image covering canvas (cover fit)
      const drawCover = (img: HTMLImageElement) => {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = canvasWidth / canvasHeight;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (imgAspect > canvasAspect) {
          sw = img.naturalHeight * canvasAspect;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / canvasAspect;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
      };

      // Helper: draw brand kit bar
      const drawBrandBar = () => {
        if (!hasBrand || !brandKit) return;
        ctx.save();
        const barY = canvasHeight - brandBarHeight;

        // Semi-transparent dark bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, barY, canvasWidth, brandBarHeight);

        const padX = 20;
        let textStartX = padX;

        // Logo on far left
        if (brandLogoImg) {
          const logoSize = 40;
          const logoY = barY + (brandBarHeight - logoSize) / 2;
          ctx.drawImage(brandLogoImg, padX, logoY, logoSize, logoSize);
          textStartX = padX + logoSize + 12;
        }

        // Agent name (bold, 16px) + brokerage name below (12px, lighter)
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.font = `700 16px Inter, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(brandKit.agentName, textStartX, barY + brandBarHeight / 2 - (brandKit.brokerageName ? 8 : 0));

        if (brandKit.brokerageName) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = `400 12px Inter, -apple-system, sans-serif`;
          ctx.fillText(brandKit.brokerageName, textStartX, barY + brandBarHeight / 2 + 12);
        }

        // Phone on right side
        if (brandKit.phone) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = `400 12px Inter, -apple-system, sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(brandKit.phone, canvasWidth - padX, barY + brandBarHeight / 2);
        }

        ctx.restore();
      };

      // Helper: draw watermark — label adapts to what tool was used
      const drawWatermark = () => {
        const fontSize = 14;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`;
        const lastTool = editHistory.length > 0 ? editHistory[editHistory.length - 1] : 'staging';
        const toolLabel =
          lastTool === 'cleanup' ? 'Cleaned up' :
          lastTool === 'twilight' ? 'Twilight by' :
          lastTool === 'sky' ? 'Sky replaced by' :
          lastTool === 'renovation' ? 'Renovated by' :
          'Staged with';
        const text = `${toolLabel} StudioAI`;
        const metrics = ctx.measureText(text);
        const padX = 12;
        const padY = 6;
        const pillW = metrics.width + padX * 2;
        const pillH = fontSize + padY * 2;
        const x = (canvasWidth - pillW) / 2;
        // If brand bar exists, position pill above the bar; otherwise at bottom
        const y = hasBrand
          ? canvasHeight - brandBarHeight - 12 - pillH
          : canvasHeight - 24 - pillH;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.roundRect(x, y, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + padX, y + pillH / 2);
        ctx.restore();
      };

      // Helper: draw the wipe divider line
      const drawDivider = (xPos: number) => {
        ctx.save();
        // White line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, canvasHeight);
        ctx.stroke();

        // Before/After labels near the line
        const labelY = canvasHeight / 2;
        ctx.font = `700 13px Inter, -apple-system, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;

        // "BEFORE" label left of line
        if (xPos > 80) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          const bw = 62, bh = 24, br = 12;
          ctx.beginPath();
          ctx.roundRect(xPos - bw - 12, labelY - bh / 2, bw, bh, br);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.fillText('BEFORE', xPos - bw / 2 - 12, labelY);
        }

        // "AFTER" label right of line
        if (xPos < canvasWidth - 80) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          const aw = 52, ah = 24, ar = 12;
          ctx.beginPath();
          ctx.roundRect(xPos + 12, labelY - ah / 2, aw, ah, ar);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.fillText('AFTER', xPos + aw / 2 + 12, labelY);
        }

        ctx.restore();
      };

      // Set up MediaRecorder with MP4 preference
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')
        ? 'video/mp4;codecs=avc1.42E01E'
        : MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
      const fileExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const downloadPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `studioai_reveal_${Date.now()}.${fileExt}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      // Smooth reveal animation:
      // Starts on BEFORE → wipe to 80% (after) → ease back to 25% → all the way across to 100% → hold AFTER
      // Total: 7 seconds
      const durationMs = 7000;

      // Timeline — wipeAmount: 0 = BEFORE (original), 1 = AFTER (result)
      // 0-600:       hold BEFORE
      // 600-2100:    wipe forward to 80% (reveal after)
      // 2100-3400:   ease back to 25%
      // 3400-5800:   continue all the way across to 100%
      // 5800-7000:   hold AFTER (full result revealed)

      // Start recording with timeslice to force data collection every 100ms
      recorder.start(100);

      // Easing function (cubic ease in-out)
      const easeInOut = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      // Draw a frame based on elapsed time
      const drawFrame = (elapsed: number) => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        let wipeAmount = 0; // 0 = AFTER (result), 1 = BEFORE (original)

        if (elapsed < 600) {
          // Hold AFTER
          wipeAmount = 0;
        } else if (elapsed < 2100) {
          // Wipe forward to 80%
          const p = (elapsed - 600) / 1500;
          wipeAmount = easeInOut(p) * 0.80;
        } else if (elapsed < 3400) {
          // Ease back to 25%
          const p = (elapsed - 2100) / 1300;
          wipeAmount = 0.80 - easeInOut(p) * 0.55;
        } else if (elapsed < 5800) {
          // Continue all the way across — 25% → 100%
          const p = (elapsed - 3400) / 2400;
          wipeAmount = 0.25 + easeInOut(p) * 0.75;
        } else {
          // Hold BEFORE (full original revealed)
          wipeAmount = 1;
        }

        if (wipeAmount <= 0) {
          drawCover(beforeImg);
        } else if (wipeAmount >= 1) {
          drawCover(afterImg);
        } else {
          const wipeX = wipeAmount * canvasWidth;
          drawCover(beforeImg);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, wipeX, canvasHeight);
          ctx.clip();
          drawCover(afterImg);
          ctx.restore();
          drawDivider(wipeX);
        }
        drawWatermark();
        drawBrandBar();
      };

      // Draw the first frame immediately so frame 0 isn't blank
      drawFrame(0);

      const animateAndRecord = (): Promise<void> => {
        return new Promise((resolveAnim) => {
          const startTime = performance.now();

          const tick = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / durationMs, 1);

            drawFrame(elapsed);
            setVideoProgress(Math.round(t * 100));

            if (elapsed < durationMs) {
              requestAnimationFrame(tick);
            } else {
              setTimeout(() => {
                recorder.stop();
                resolveAnim();
              }, 200);
            }
          };

          requestAnimationFrame(tick);
        });
      };

      await animateAndRecord();
      await downloadPromise;
    } catch (err) {
      console.error('Reveal video generation failed:', err);
    } finally {
      setVideoGenerating(false);
      setVideoProgress(0);
      videoCanvasRef.current = null;
    }
  }, [originalImage, imageBase64, videoAspect, brandKit, editHistory]);

  const update = (partial: Partial<ExportSettings>) => setSettings(prev => ({ ...prev, ...partial }));

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
      <div className="modal-panel w-full max-w-lg rounded-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-display text-lg font-bold text-white">Export Image</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Preview */}
          <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-black">
            <img
              src={previewUrl || imageBase64}
              alt="Export preview"
              className="w-full aspect-[16/10] object-contain bg-black"
            />
          </div>

          {/* Disclaimer Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Add Disclaimer</p>
              <p className="text-[10px] text-zinc-500">Watermark or badge on exported image</p>
            </div>
            <button
              type="button"
              onClick={() => update({ disclaimerEnabled: !settings.disclaimerEnabled })}
              className={`relative w-11 h-6 rounded-full transition-all ${settings.disclaimerEnabled ? 'bg-[var(--color-primary)]' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.disclaimerEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {settings.disclaimerEnabled && (
            <>
              {/* Type selector */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update({ disclaimerType: 'text' })}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all border ${
                    settings.disclaimerType === 'text'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  <Type size={14} /> Text
                </button>
                <button
                  type="button"
                  onClick={() => update({ disclaimerType: 'icon' })}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all border ${
                    settings.disclaimerType === 'icon'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  <ImageIcon size={14} /> Logo / Icon
                </button>
              </div>

              {/* Text input */}
              {settings.disclaimerType === 'text' && (
                <input
                  value={settings.disclaimerText}
                  onChange={(e) => update({ disclaimerText: e.target.value })}
                  placeholder="Virtually Staged"
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-black/60 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                />
              )}

              {/* Icon upload */}
              {settings.disclaimerType === 'icon' && (
                <div className="flex items-center gap-3">
                  {settings.disclaimerIcon ? (
                    <div className="h-10 w-10 rounded-lg border border-[var(--color-border)] overflow-hidden bg-white/5">
                      <img src={settings.disclaimerIcon} alt="Disclaimer icon" className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-lg border border-dashed border-zinc-600 flex items-center justify-center text-zinc-600">
                      <ImageIcon size={16} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => iconInputRef.current?.click()}
                    className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {settings.disclaimerIcon ? 'Change' : 'Upload'} icon or logo
                  </button>
                  <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconUpload} className="hidden" />
                </div>
              )}

              {/* Position */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Position</p>
                <div className="flex gap-2">
                  {([['bottom-left', 'Left'], ['bottom-center', 'Center'], ['bottom-right', 'Right']] as const).map(([pos, label]) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => update({ position: pos })}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-all border ${
                        settings.position === pos
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-zinc-500 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Opacity</p>
                  <span className="text-[10px] text-zinc-500">{Math.round(settings.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.1"
                  value={settings.opacity}
                  onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
                  className="w-full accent-[var(--color-primary)]"
                />
              </div>
            </>
          )}
        </div>

        {/* Create Reveal Video */}
        {originalImage && (
          <div className="px-5 pb-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <Video size={16} className="text-[var(--color-primary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Create Reveal Video</p>
                  <p className="text-[10px] text-zinc-500">Before/after wipe for Instagram & TikTok</p>
                </div>
              </div>

              {/* Aspect ratio selector */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVideoAspect('original')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all border ${
                    videoAspect === 'original'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setVideoAspect('1:1')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all border ${
                    videoAspect === '1:1'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  1:1
                </button>
                <button
                  type="button"
                  onClick={() => setVideoAspect('4:5')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all border ${
                    videoAspect === '4:5'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  4:5 Portrait
                </button>
                <button
                  type="button"
                  onClick={() => setVideoAspect('9:16')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all border ${
                    videoAspect === '9:16'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] text-zinc-400 hover:text-white'
                  }`}
                >
                  9:16 Reels
                </button>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={generateRevealVideo}
                disabled={videoGenerating}
                className="w-full rounded-xl py-3 text-sm font-bold inline-flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-[var(--color-primary)] to-[#0066CC] text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {videoGenerating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Generating... {videoProgress}%
                  </>
                ) : (
                  <>
                    <Video size={15} />
                    Create Reveal Video
                  </>
                )}
              </button>

              {/* Progress bar */}
              {videoGenerating && (
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-150"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share to Gallery */}
        {onShare && (
          <div className="px-5 pb-3">
            <button
              type="button"
              onClick={() => setShareToGallery(!shareToGallery)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                shareToGallery
                  ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5'
                  : 'border-[var(--color-border)] bg-white/[0.02] hover:border-white/[0.10]'
              }`}
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                shareToGallery
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                  : 'border-zinc-600'
              }`}>
                {shareToGallery && <Check size={12} className="text-white" />}
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-semibold text-white">Share to community gallery</p>
                <p className="text-[10px] text-zinc-500">Help other agents see what's possible</p>
              </div>
              <Heart size={14} className={shareToGallery ? 'text-[var(--color-primary)]' : 'text-zinc-600'} />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t border-[var(--color-border)] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 cta-secondary rounded-xl py-3 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 cta-primary rounded-xl py-3 text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            {exporting ? 'Exporting...' : <><Download size={14} /> Export</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Render the image with disclaimer overlay using Canvas */
async function renderWithDisclaimer(imageBase64: string, settings: ExportSettings): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      const padding = Math.max(img.naturalWidth * 0.02, 16);
      const fontSize = Math.max(img.naturalWidth * 0.018, 14);

      if (settings.disclaimerType === 'text' && settings.disclaimerText) {
        ctx.font = `bold ${fontSize}px Inter, -apple-system, sans-serif`;
        ctx.globalAlpha = settings.opacity;

        const text = settings.disclaimerText;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        // Background pill
        const pillPadX = fontSize * 0.6;
        const pillPadY = fontSize * 0.35;
        const pillW = textWidth + pillPadX * 2;
        const pillH = textHeight + pillPadY * 2;

        let x: number;
        const y = img.naturalHeight - padding - pillH;

        if (settings.position === 'bottom-left') x = padding;
        else if (settings.position === 'bottom-right') x = img.naturalWidth - padding - pillW;
        else x = (img.naturalWidth - pillW) / 2;

        // Draw pill background
        const radius = pillH / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(x, y, pillW, pillH, radius);
        ctx.fill();

        // Draw text
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + pillPadX, y + pillH / 2);
      } else if (settings.disclaimerType === 'icon' && settings.disclaimerIcon) {
        const icon = new Image();
        icon.onload = () => {
          ctx.globalAlpha = settings.opacity;
          const iconH = Math.max(img.naturalHeight * 0.06, 32);
          const iconW = (icon.naturalWidth / icon.naturalHeight) * iconH;

          let x: number;
          const y = img.naturalHeight - padding - iconH;

          if (settings.position === 'bottom-left') x = padding;
          else if (settings.position === 'bottom-right') x = img.naturalWidth - padding - iconW;
          else x = (img.naturalWidth - iconW) / 2;

          ctx.drawImage(icon, x, y, iconW, iconH);
          ctx.globalAlpha = 1;
          resolve(canvas.toDataURL('image/png'));
        };
        icon.onerror = () => resolve(canvas.toDataURL('image/png'));
        icon.src = settings.disclaimerIcon;
        return; // wait for icon load
      }

      ctx.globalAlpha = 1;
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageBase64);
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  });
}

export default ExportModal;
