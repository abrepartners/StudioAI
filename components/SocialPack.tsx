/**
 * SocialPack.tsx — Social Media Content Pack
 * Task 1.6 — Platform-specific crops, AI captions, hashtags, zip download
 *
 * Depends on: imageExport.ts (cropToAspect, exportAsZip, downloadBlob)
 */

import React, { useState, useCallback } from 'react';
import {
  Download,
  Check,
  Instagram,
  Facebook,
  Twitter,
  Loader2,
  Copy,
  Sparkles,
} from 'lucide-react';
import {
  cropToAspect,
  resizeImage,
  exportAsZip,
  downloadBlob,
  dataURLtoBlob,
  type ExportFile,
} from '../utils/imageExport';
import { getActiveApiKey } from '../services/geminiService';
import { generateSocialCaptionsPrompt } from '../src/prompts/socialCaptions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialPackProps {
  images: { id: string; source: string; label: string }[];
  propertyDetails?: {
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    price: number;
  };
}

interface PlatformConfig {
  name: string;
  icon: React.ElementType;
  width: number;
  height: number;
  aspectW: number;
  aspectH: number;
  label: string;
}

const PLATFORMS: PlatformConfig[] = [
  { name: 'instagram-feed', icon: Instagram, width: 1080, height: 1080, aspectW: 1, aspectH: 1, label: 'Instagram Feed' },
  { name: 'instagram-story', icon: Instagram, width: 1080, height: 1920, aspectW: 9, aspectH: 16, label: 'Instagram Story' },
  { name: 'facebook-post', icon: Facebook, width: 1200, height: 630, aspectW: 1200, aspectH: 630, label: 'Facebook Post' },
  { name: 'facebook-cover', icon: Facebook, width: 820, height: 312, aspectW: 820, aspectH: 312, label: 'Facebook Cover' },
  { name: 'twitter-post', icon: Twitter, width: 1200, height: 675, aspectW: 16, aspectH: 9, label: 'Twitter / X Post' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const SocialPack: React.FC<SocialPackProps> = ({ images, propertyDetails }) => {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(['instagram-feed', 'instagram-story', 'facebook-post'])
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const togglePlatform = (name: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Generate AI captions
  const generateCaptions = useCallback(async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey || !propertyDetails) return;

    setIsGeneratingCaptions(true);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = generateSocialCaptionsPrompt({
        address: propertyDetails.address,
        beds: propertyDetails.beds,
        baths: propertyDetails.baths,
        sqft: propertyDetails.sqft,
        price: propertyDetails.price,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { temperature: 0.8 },
      });

      const text = response.text || '';
      const parsed: Record<string, string> = {};

      const sections = text.split(/---([A-Z_]+)---/).filter(s => s.trim());
      for (let i = 0; i < sections.length - 1; i += 2) {
        const key = sections[i].trim().toLowerCase().replace(/_/g, '-');
        parsed[key] = sections[i + 1].trim();
      }
      // Map linkedin-post to match the platform key used in PLATFORMS
      if (parsed['linkedin-post'] && !parsed['linkedin']) {
        parsed['linkedin'] = parsed['linkedin-post'];
      }

      setCaptions(parsed);
    } catch (err) {
      console.error('Caption generation failed:', err);
    } finally {
      setIsGeneratingCaptions(false);
    }
  }, [propertyDetails]);

  const copyCaption = (platform: string) => {
    const text = captions[platform];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  };

  // Export cropped images as zip
  const handleExport = useCallback(async () => {
    if (images.length === 0 || selectedPlatforms.size === 0) return;

    setIsExporting(true);
    setExportDone(false);

    try {
      const files: ExportFile[] = [];

      for (const platform of PLATFORMS) {
        if (!selectedPlatforms.has(platform.name)) continue;

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          // Crop to platform aspect ratio
          const cropped = await cropToAspect(img.source, platform.aspectW, platform.aspectH);
          // Resize to exact platform dimensions
          const resized = await resizeImage(cropped, platform.width, platform.height, 0.92);

          const safeName = img.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          files.push({
            name: `${platform.name}/${String(i + 1).padStart(2, '0')}_${safeName}.jpg`,
            blob: resized,
          });
        }
      }

      // Include captions as text files
      for (const [platform, caption] of Object.entries(captions) as [string, string][]) {
        if (selectedPlatforms.has(platform)) {
          files.push({
            name: `${platform}/caption.txt`,
            blob: new Blob([caption as string], { type: 'text/plain' }),
          });
        }
      }

      const zipBlob = await exportAsZip(files);
      downloadBlob(zipBlob, 'studioai_social_pack.zip');
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      console.error('Social pack export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [images, selectedPlatforms, captions]);

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-5">
      <div>
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Instagram className="w-5 h-5 text-[#0A84FF]" />
          Social Media Pack
        </h3>
        <p className="text-zinc-400 text-sm mt-0.5">
          Platform-sized images + AI captions + hashtags in one download
        </p>
      </div>

      {/* Platform Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            const selected = selectedPlatforms.has(p.name);
            return (
              <button
                key={p.name}
                onClick={() => togglePlatform(p.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  selected
                    ? 'bg-[#0A84FF] text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {p.label}
                <span className="text-[10px] opacity-60">{p.width}x{p.height}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Captions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300">AI Captions</label>
          <button
            onClick={generateCaptions}
            disabled={isGeneratingCaptions || !propertyDetails}
            className="text-xs text-[#0A84FF] hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            {isGeneratingCaptions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isGeneratingCaptions ? 'Generating...' : 'Generate Captions'}
          </button>
        </div>

        {Object.keys(captions).length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {Object.entries(captions).map(([platform, caption]) => (
              <div key={platform} className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#0A84FF] uppercase font-medium">
                    {platform.replace(/-/g, ' ')}
                  </span>
                  <button
                    onClick={() => copyCaption(platform)}
                    className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
                  >
                    {copiedPlatform === platform ? <Check className="w-3 h-3 text-[#30D158]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-300 line-clamp-3">{caption}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button
        onClick={handleExport}
        disabled={isExporting || selectedPlatforms.size === 0 || images.length === 0}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
          exportDone
            ? 'bg-[#30D158] text-white'
            : isExporting
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
        }`}
      >
        {exportDone ? (
          <><Check className="w-4 h-4" /> Downloaded</>
        ) : isExporting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Creating pack...</>
        ) : (
          <><Download className="w-4 h-4" /> Download Social Pack ({selectedPlatforms.size} platforms)</>
        )}
      </button>
    </div>
  );
};

export default SocialPack;
