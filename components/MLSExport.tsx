/**
 * MLSExport.tsx — MLS-Ready Image Export Panel
 * Task 1.1 — Resize, strip EXIF, watermark, zip download
 *
 * Usage: Render inside staging result view or batch view.
 * <MLSExport images={stagedImages} />
 */

import React, { useState, useCallback } from 'react';
import {
  Download,
  Check,
  Image as ImageIcon,
  Shield,
  Package,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {
  MLS_PRESETS,
  processForMLS,
  batchExportMLS,
  downloadBlob,
  stripExif,
  resizeImage,
  type MLSPreset,
  type WatermarkConfig,
} from '../utils/imageExport';
import { useBrandKit } from '../hooks/useBrandKit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StagedImage {
  id: string;
  source: string;      // data URL or blob URL
  label: string;       // e.g. "Living Room"
  roomType?: string;
}

interface MLSExportProps {
  images: StagedImage[];
  mode?: 'single' | 'batch';   // single = one image, batch = multi-select
}

// ─── Component ────────────────────────────────────────────────────────────────

const MLSExport: React.FC<MLSExportProps> = ({ images, mode = 'batch' }) => {
  const { brandKit, hasBrandKit } = useBrandKit();

  const [selectedPreset, setSelectedPreset] = useState<MLSPreset>(MLS_PRESETS[0]);
  const [watermarkType, setWatermarkType] = useState<'none' | 'logo' | 'text'>('none');
  const [watermarkText, setWatermarkText] = useState('Virtually Staged');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(
    new Set(images.map((img) => img.id))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showPresets, setShowPresets] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);

  // Build watermark config from state + brand kit
  const getWatermarkConfig = useCallback((): WatermarkConfig | undefined => {
    if (watermarkType === 'none') return undefined;
    if (watermarkType === 'logo' && hasBrandKit && brandKit.logo) {
      return {
        type: 'logo',
        content: brandKit.logo,
        position: 'bottom-right',
        opacity: 0.7,
      };
    }
    return {
      type: 'text',
      content: watermarkText,
      position: 'bottom-right',
      opacity: 0.6,
    };
  }, [watermarkType, watermarkText, brandKit, hasBrandKit]);

  // Toggle image selection
  const toggleImage = (id: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedImages(new Set(images.map((img) => img.id)));
  const selectNone = () => setSelectedImages(new Set());

  // Export handler
  const handleExport = useCallback(async () => {
    const toExport = images.filter((img) => selectedImages.has(img.id));
    if (toExport.length === 0) return;

    setIsExporting(true);
    setExportComplete(false);
    setProgress({ current: 0, total: toExport.length });

    try {
      const watermark = getWatermarkConfig();

      if (toExport.length === 1) {
        // Single image — download directly (no zip)
        const processed = await processForMLS(toExport[0].source, selectedPreset, watermark);
        const safeName = toExport[0].label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        downloadBlob(processed, `${safeName}_mls_${selectedPreset.width}x${selectedPreset.height}.jpg`);
      } else {
        // Batch — zip download
        await batchExportMLS(
          toExport.map((img) => ({ source: img.source, label: img.label })),
          selectedPreset,
          watermark,
          (current, total) => setProgress({ current, total })
        );
      }

      setExportComplete(true);
      setTimeout(() => setExportComplete(false), 3000);
    } catch (err) {
      console.error('MLS export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [images, selectedImages, selectedPreset, getWatermarkConfig]);

  return (
    <div className="premium-surface rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0A84FF]" />
            Export for MLS
          </h3>
          <p className="text-zinc-400 text-sm mt-0.5">
            Resize, clean metadata, and download MLS-ready files
          </p>
        </div>
        <span className="text-xs text-zinc-500 premium-surface-strong px-2 py-1 rounded-lg">
          {selectedImages.size} of {images.length} selected
        </span>
      </div>

      {/* Preset Selector */}
      <div>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white hover:border-zinc-600 transition-all duration-200"
        >
          <div className="text-left">
            <div className="font-medium text-sm">{selectedPreset.name}</div>
            <div className="text-xs text-zinc-400">{selectedPreset.description}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>

        {showPresets && (
          <div className="mt-2 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
            {MLS_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => { setSelectedPreset(preset); setShowPresets(false); }}
                className={`w-full text-left px-4 py-3 hover:bg-zinc-700 transition-colors ${
                  preset.name === selectedPreset.name ? 'bg-zinc-700 border-l-2 border-[#0A84FF]' : ''
                }`}
              >
                <div className="font-medium text-sm text-white">{preset.name}</div>
                <div className="text-xs text-zinc-400">{preset.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Watermark Options */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">Watermark</label>
        <div className="flex gap-2">
          {(['none', 'text', 'logo'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setWatermarkType(type)}
              disabled={type === 'logo' && !hasBrandKit}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                watermarkType === type
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              } ${type === 'logo' && !hasBrandKit ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {type === 'none' ? 'None' : type === 'text' ? '"Virtually Staged"' : 'Brand Logo'}
            </button>
          ))}
        </div>
        {watermarkType === 'text' && (
          <input
            type="text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:outline-none transition-colors"
            placeholder="Custom watermark text..."
          />
        )}
        {watermarkType === 'logo' && !hasBrandKit && (
          <p className="text-xs text-zinc-500">Set up your Brand Kit in Settings to use logo watermarks.</p>
        )}
      </div>

      {/* Image Selection (batch mode) */}
      {mode === 'batch' && images.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300">Images</label>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-[#0A84FF] hover:text-blue-300 transition-colors">
                Select all
              </button>
              <button onClick={selectNone} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 max-h-[160px] overflow-y-auto">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => toggleImage(img.id)}
                className={`relative rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  selectedImages.has(img.id)
                    ? 'border-[#0A84FF] ring-1 ring-[#0A84FF]/30'
                    : 'border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <img src={img.source} alt={img.label} className="w-full h-16 object-cover" />
                {selectedImages.has(img.id) && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-[#0A84FF] rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                  <span className="text-[10px] text-white truncate block">{img.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EXIF Notice */}
      <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
        <Shield className="w-4 h-4 text-[#30D158] flex-shrink-0" />
        <span className="text-xs text-zinc-400">
          EXIF metadata (GPS, camera info, timestamps) is automatically stripped from all exports.
        </span>
      </div>

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={isExporting || selectedImages.size === 0}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
          exportComplete
            ? 'bg-[#30D158] text-white'
            : isExporting
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : selectedImages.size === 0
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
        }`}
      >
        {exportComplete ? (
          <><Check className="w-4 h-4" /> Downloaded</>
        ) : isExporting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Processing {progress.current}/{progress.total}...</>
        ) : (
          <><Download className="w-4 h-4" /> Export {selectedImages.size} {selectedImages.size === 1 ? 'Image' : 'Images'}</>
        )}
      </button>
    </div>
  );
};

export default MLSExport;
