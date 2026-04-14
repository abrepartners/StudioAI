
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface ColorData {
  name: string;
  value: number;
  fill: string;
}

export type RenovationCategory =
  | 'Flooring'
  | 'Walls & Trim'
  | 'Ceiling'
  | 'Kitchen'
  | 'Bathroom';

export type FurnitureRoomType =
  | 'Living Room'
  | 'Bedroom'
  | 'Dining Room'
  | 'Office'
  | 'Kitchen'
  | 'Primary Bedroom'
  | 'Bathroom'
  | 'Laundry Room'
  | 'Closet'
  | 'Garage'
  | 'Patio'
  | 'Basement'
  | 'Nursery'
  | 'Exterior';

export type StylePreset =
  | 'Coastal Modern'
  | 'Urban Loft'
  | 'Farmhouse Chic'
  | 'Minimalist'
  | 'Mid-Century Modern'
  | 'Scandinavian'
  | 'Bohemian';

export interface StagedFurniture {
  id: string;
  name: string;
  orientation: 'Default' | 'Angled Left' | 'Angled Right' | 'Facing Away' | 'Profile View';
}

export interface SavedLayout {
  id: string;
  name: string;
  roomType: FurnitureRoomType;
  items: StagedFurniture[];
  timestamp: number;
}

export interface SavedStage {
  id: string;
  name: string;
  originalImage: string;
  generatedImage: string;
  timestamp: number;
}

export interface HistoryState {
  generatedImage: string | null;
  stagedFurniture: StagedFurniture[];
  selectedRoom: FurnitureRoomType;
  colors: ColorData[];
}

export interface RenovationSelection {
  category: RenovationCategory;
  item: string;
}

export interface GenerationConfig {
  prompt: string;
  maskImage?: string; // Base64 of the mask
}

// ─── Brand Kit ──────────────────────────────────────────────────────────────

export interface BrandKit {
  logo: string | null;
  headshot: string | null;
  primaryColor: string;
  secondaryColor: string;
  agentName: string;
  brokerageName: string;
  phone: string;
  email: string;
  website: string;
  tagline: string;
}

// ─── MLS Export ─────────────────────────────────────────────────────────────

export interface WatermarkConfig {
  type: 'text' | 'logo';
  text?: string;
  logoBase64?: string;
  opacity?: number;
  position?: 'bottom-right' | 'bottom-left';
}

export interface MLSPreset {
  label: string;
  width: number;
  height: number;
}

// ─── Listing Description ────────────────────────────────────────────────────

export interface PropertyDetails {
  address?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  price?: number;
  notes?: string;
}

export interface ListingDescriptions {
  luxury: string;
  casual: string;
  investment: string;
}
