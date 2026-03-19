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

export function useBrandKit(): UseBrandKitReturn {
  const [brandKit, setBrandKit] = useState<BrandKit>(DEFAULT_BRAND_KIT);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BrandKit>;
        setBrandKit({ ...DEFAULT_BRAND_KIT, ...parsed });
      }
    } catch {
      // Corrupt data — reset silently
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  // Save to localStorage whenever brandKit changes (after initial load)
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(brandKit));
      } catch {
        // localStorage full or unavailable — degrade silently
        console.warn('Failed to persist brand kit to localStorage');
      }
    }
  }, [brandKit, isLoading]);

  const updateBrandKit = useCallback((partial: Partial<BrandKit>) => {
    setBrandKit((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetBrandKit = useCallback(() => {
    setBrandKit(DEFAULT_BRAND_KIT);
    localStorage.removeItem(STORAGE_KEY);
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
