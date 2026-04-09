import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Type, Image as ImageIcon, Check } from 'lucide-react';

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
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ imageBase64, onClose }) => {
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
  const iconInputRef = useRef<HTMLInputElement>(null);

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
      let finalImage = imageBase64;
      if (settings.disclaimerEnabled) {
        const rendered = await renderWithDisclaimer(imageBase64, settings);
        if (rendered) finalImage = rendered;
      }

      const link = document.createElement('a');
      link.href = finalImage;
      link.download = `studio_export_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const update = (partial: Partial<ExportSettings>) => setSettings(prev => ({ ...prev, ...partial }));

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
      <div className="modal-panel w-full max-w-lg rounded-2xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-display text-lg font-bold text-white">Export Image</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
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
