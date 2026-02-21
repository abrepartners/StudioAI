
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
  | 'Exterior';

export type StylePreset = 
  | 'Coastal Modern' 
  | 'Urban Loft' 
  | 'Farmhouse Chic' 
  | 'Minimalist' 
  | 'Traditional'
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
