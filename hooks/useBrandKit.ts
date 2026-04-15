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
      return { ...DEFAULT_BRAND_KIT, ...parsed };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_BRAND_KIT;
}

function saveToStorage(kit: BrandKit): void {
  try {
    // Separate large images from text fields to handle localStorage limits
    const toSave = { ...kit };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // If full save fails (likely images too large), save without images
    console.warn('Brand kit save failed, retrying without images:', e);
    try {
      const textOnly = { ...kit, logo: null, headshot: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
      console.warn('Brand kit saved without images (localStorage full)');
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
