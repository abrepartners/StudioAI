/**
 * useBrandKit.ts — Agent Brand Kit Hook
 * Persists brand assets to localStorage. Used across:
 * 1.1 MLS Export (watermark), 1.3 Property Website, 1.5 Print Collateral, 1.6 Social Pack
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandKit {
  logo: string | null;           // base64 data URL
  headshot: string | null;       // base64 data URL
  primaryColor: string;          // hex
  secondaryColor: string;        // hex
  agentName: string;
  brokerageName: string;
  phone: string;
  email: string;
  website: string;
  tagline: string;
}

export interface UseBrandKitReturn {
  brandKit: BrandKit;
  updateBrandKit: (partial: Partial<BrandKit>) => void;
  resetBrandKit: () => void;
  hasBrandKit: boolean;          // true if at least name + logo are set
  isLoading: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'studioai_brand_kit';
const STORAGE_KEY_IMAGES = 'studioai_brand_kit_images';

const DEFAULT_BRAND_KIT: BrandKit = {
  logo: null,
  headshot: null,
  primaryColor: '#0A84FF',
  secondaryColor: '#1C1C1E',
  agentName: '',
  brokerageName: '',
  phone: '',
  email: '',
  website: '',
  tagline: '',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Track whether any instance has loaded — prevents race condition where
// multiple useBrandKit() instances overwrite localStorage with defaults
let _hasLoadedFromStorage = false;
let _sharedBrandKit: BrandKit | null = null;
const _listeners = new Set<(kit: BrandKit) => void>();

function loadFromStorage(): BrandKit {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<BrandKit>;
      const kit = { ...DEFAULT_BRAND_KIT, ...parsed };

      // Check for split images (fallback when images were saved separately)
      if (!kit.logo || !kit.headshot) {
        try {
          const imgData = localStorage.getItem(STORAGE_KEY_IMAGES);
          if (imgData) {
            const images = JSON.parse(imgData) as Record<string, string>;
            if (!kit.logo && images.logo) kit.logo = images.logo;
            if (!kit.headshot && images.headshot) kit.headshot = images.headshot;
          }
        } catch { /* ignore */ }
      }

      return kit;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_BRAND_KIT;
}

/**
 * Compress a base64 image to fit in localStorage.
 * Resizes to maxDim and converts to JPEG at given quality.
 */
function compressImage(dataURL: string, maxDim: number = 200, quality: number = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      // Use PNG for logos (transparency), JPEG for headshots
      const isPNG = dataURL.includes('image/png');
      resolve(canvas.toDataURL(isPNG ? 'image/png' : 'image/jpeg', quality));
    };
    img.onerror = () => resolve(dataURL); // fallback to original
    img.src = dataURL;
  });
}

async function saveToStorage(kit: BrandKit): Promise<void> {
  try {
    // Compress images before storing
    const compressedKit = { ...kit };
    if (kit.logo) {
      compressedKit.logo = await compressImage(kit.logo, 200, 0.85);
    }
    if (kit.headshot) {
      compressedKit.headshot = await compressImage(kit.headshot, 200, 0.8);
    }

    // Try saving everything in one key
    const json = JSON.stringify(compressedKit);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    // If still too large, split: text in one key, images in another
    console.warn('Brand kit single-key save failed, splitting:', e);
    try {
      const textOnly = { ...kit, logo: null, headshot: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
      // Try images separately (smaller keys = more likely to fit)
      const images: Record<string, string> = {};
      if (kit.logo) images.logo = await compressImage(kit.logo, 150, 0.7);
      if (kit.headshot) images.headshot = await compressImage(kit.headshot, 150, 0.7);
      if (Object.keys(images).length > 0) {
        localStorage.setItem(STORAGE_KEY_IMAGES, JSON.stringify(images));
      }
    } catch {
      console.error('Brand kit save completely failed');
    }
  }
}

export function useBrandKit(): UseBrandKitReturn {
  const [brandKit, setBrandKit] = useState<BrandKit>(() => {
    // Initialize from shared state or localStorage (synchronous, no flash)
    if (_sharedBrandKit) return _sharedBrandKit;
    const loaded = loadFromStorage();
    _sharedBrandKit = loaded;
    _hasLoadedFromStorage = true;
    return loaded;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Sync across multiple hook instances
  useEffect(() => {
    const listener = (kit: BrandKit) => setBrandKit(kit);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const updateBrandKit = useCallback((partial: Partial<BrandKit>) => {
    setBrandKit((prev) => {
      const updated = { ...prev, ...partial };
      _sharedBrandKit = updated;
      saveToStorage(updated);
      // Notify all other instances
      _listeners.forEach(fn => fn(updated));
      return updated;
    });
  }, []);

  const resetBrandKit = useCallback(() => {
    _sharedBrandKit = DEFAULT_BRAND_KIT;
    setBrandKit(DEFAULT_BRAND_KIT);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_IMAGES);
    _listeners.forEach(fn => fn(DEFAULT_BRAND_KIT));
  }, []);

  const hasBrandKit = Boolean(brandKit.agentName.trim() && brandKit.logo);

  return { brandKit, updateBrandKit, resetBrandKit, hasBrandKit, isLoading };
}

// ─── Utility: FileReader wrapper for image uploads ────────────────────────────

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
