/**
 * useListing.ts — Listing Data Hook
 * Task 1.7 — Central listing state management
 * Used by: 1.3 Property Website, 1.4 Listing Description, 1.5 Print Collateral, 1.7 Dashboard
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagedPhoto {
  id: string;
  originalUrl: string;        // data URL of original
  stagedUrl: string;          // data URL of staged version
  roomType: string;
  style: string;
  qualityScore?: number;
  createdAt: string;
}

export interface ListingAssets {
  mlsExported: boolean;
  descriptionGenerated: boolean;
  socialPackCreated: boolean;
  printCollateralCreated: boolean;
  propertyWebsitePublished: boolean;
  propertyWebsiteUrl: string | null;
}

export interface Listing {
  id: string;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  yearBuilt?: number;
  lotSize?: string;
  propertyType: string;
  photos: StagedPhoto[];
  description: string | null;
  descriptionTone: string | null;
  assets: ListingAssets;
  createdAt: string;
  updatedAt: string;
}

export interface UseListingReturn {
  listings: Listing[];
  currentListing: Listing | null;
  createListing: (data: Omit<Listing, 'id' | 'photos' | 'description' | 'descriptionTone' | 'assets' | 'createdAt' | 'updatedAt'>) => Listing;
  updateListing: (id: string, partial: Partial<Listing>) => void;
  deleteListing: (id: string) => void;
  setCurrentListing: (id: string | null) => void;
  addPhoto: (listingId: string, photo: Omit<StagedPhoto, 'id' | 'createdAt'>) => void;
  removePhoto: (listingId: string, photoId: string) => void;
  updateAssets: (listingId: string, assets: Partial<ListingAssets>) => void;
  getListingStats: () => ListingStats;
}

export interface ListingStats {
  totalListings: number;
  totalPhotos: number;
  avgPhotosPerListing: number;
  completedListings: number;       // All assets generated
  partialListings: number;         // Some assets generated
  recentActivity: Listing[];       // Last 5 updated
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'studioai_listings';

const DEFAULT_ASSETS: ListingAssets = {
  mlsExported: false,
  descriptionGenerated: false,
  socialPackCreated: false,
  printCollateralCreated: false,
  propertyWebsitePublished: false,
  propertyWebsiteUrl: null,
};

function generateId(): string {
  return `lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useListing(): UseListingReturn {
  const [listings, setListings] = useState<Listing[]>([]);
  const [currentListingId, setCurrentListingId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setListings(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
      } catch {
        console.warn('Failed to persist listings — localStorage may be full');
      }
    }
  }, [listings, isLoaded]);

  const currentListing = listings.find(l => l.id === currentListingId) || null;

  const createListing = useCallback((data: Omit<Listing, 'id' | 'photos' | 'description' | 'descriptionTone' | 'assets' | 'createdAt' | 'updatedAt'>): Listing => {
    const now = new Date().toISOString();
    const newListing: Listing = {
      ...data,
      id: generateId(),
      photos: [],
      description: null,
      descriptionTone: null,
      assets: { ...DEFAULT_ASSETS },
      createdAt: now,
      updatedAt: now,
    };
    setListings(prev => [newListing, ...prev]);
    setCurrentListingId(newListing.id);
    return newListing;
  }, []);

  const updateListing = useCallback((id: string, partial: Partial<Listing>) => {
    setListings(prev => prev.map(l =>
      l.id === id ? { ...l, ...partial, updatedAt: new Date().toISOString() } : l
    ));
  }, []);

  const deleteListing = useCallback((id: string) => {
    setListings(prev => prev.filter(l => l.id !== id));
    if (currentListingId === id) setCurrentListingId(null);
  }, [currentListingId]);

  const setCurrentListing = useCallback((id: string | null) => {
    setCurrentListingId(id);
  }, []);

  const addPhoto = useCallback((listingId: string, photo: Omit<StagedPhoto, 'id' | 'createdAt'>) => {
    const newPhoto: StagedPhoto = {
      ...photo,
      id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setListings(prev => prev.map(l =>
      l.id === listingId
        ? { ...l, photos: [...l.photos, newPhoto], updatedAt: new Date().toISOString() }
        : l
    ));
  }, []);

  const removePhoto = useCallback((listingId: string, photoId: string) => {
    setListings(prev => prev.map(l =>
      l.id === listingId
        ? { ...l, photos: l.photos.filter(p => p.id !== photoId), updatedAt: new Date().toISOString() }
        : l
    ));
  }, []);

  const updateAssets = useCallback((listingId: string, assets: Partial<ListingAssets>) => {
    setListings(prev => prev.map(l =>
      l.id === listingId
        ? { ...l, assets: { ...l.assets, ...assets }, updatedAt: new Date().toISOString() }
        : l
    ));
  }, []);

  const getListingStats = useCallback((): ListingStats => {
    const totalPhotos = listings.reduce((sum, l) => sum + l.photos.length, 0);
    const completed = listings.filter(l => {
      const a = l.assets;
      return a.mlsExported && a.descriptionGenerated && a.socialPackCreated;
    });
    const partial = listings.filter(l => {
      const a = l.assets;
      const assetCount = [a.mlsExported, a.descriptionGenerated, a.socialPackCreated, a.printCollateralCreated, a.propertyWebsitePublished].filter(Boolean).length;
      return assetCount > 0 && assetCount < 5;
    });

    return {
      totalListings: listings.length,
      totalPhotos,
      avgPhotosPerListing: listings.length > 0 ? Math.round(totalPhotos / listings.length) : 0,
      completedListings: completed.length,
      partialListings: partial.length,
      recentActivity: [...listings].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    };
  }, [listings]);

  return {
    listings,
    currentListing,
    createListing,
    updateListing,
    deleteListing,
    setCurrentListing,
    addPhoto,
    removePhoto,
    updateAssets,
    getListingStats,
  };
}
