
import React, { useState } from 'react';
import { FurnitureRoomType, StylePreset, StagedFurniture, SavedLayout } from '../types';
import { 
  Wand2, 
  Home, 
  PaintBucket, 
  Hammer, 
  Sofa, 
  Sparkles,
  Palmtree,
  Factory,
  Wheat,
  RotateCw,
  Plus,
  Library,
  Layers,
  Cloud,
  Flower2,
  Settings2,
  Layout,
  Dices,
  Eraser,
  Sun,
  Leaf,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckCircle2,
  Undo2,
  ShieldCheck,
  Mountain,
  Trees,
  Zap,
  Info,
  Scale,
  FilePenLine
} from 'lucide-react';

interface RenovationControlsProps {
  activeMode: 'cleanup' | 'design';
  hasGenerated: boolean;
  onGenerate: (prompt: string) => void;
  onReroll: () => void;
  isGenerating: boolean;
  hasMask: boolean;
  stagedFurniture: StagedFurniture[];
  addFurniture: (name: string) => void;
  removeFurniture: (id: string) => void;
  rotateFurniture: (id: string) => void;
  onAutoArrange: () => void;
  isAutoArranging: boolean;
  savedLayouts: SavedLayout[];
  saveCurrentLayout: (name: string) => void;
  loadLayout: (layout: SavedLayout) => void;
  selectedRoom: FurnitureRoomType;
  setSelectedRoom: (room: FurnitureRoomType) => void;
}

const RenovationControls: React.FC<RenovationControlsProps> = ({ 
  activeMode,
  hasGenerated,
  onGenerate, 
  onReroll,
  isGenerating, 
  hasMask,
  stagedFurniture,
  addFurniture,
  removeFurniture,
  rotateFurniture,
  onAutoArrange,
  isAutoArranging,
  selectedRoom,
  setSelectedRoom
}) => {
  const [activeTab, setActiveTab] = useState<'renovate' | 'stage' | 'landscape'>('stage');
  const [selectedPreset, setSelectedPreset] = useState<StylePreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [grassLevel, setGrassLevel] = useState<string | null>(null);

  const presets: Array<{ id: StylePreset, icon: React.ReactNode, description: string }> = [
    { id: 'Coastal Modern', icon: <Palmtree size={18} />, description: 'Light & Airy' },
    { id: 'Urban Loft', icon: <Factory size={18} />, description: 'Industrial' },
    { id: 'Farmhouse Chic', icon: <Wheat size={18} />, description: 'Rustic Modern' },
    { id: 'Minimalist', icon: <Sparkles size={18} />, description: 'Clean Lines' },
    { id: 'Traditional', icon: <Library size={18} />, description: 'Rich Woods' },
    { id: 'Mid-Century Modern', icon: <Layers size={18} />, description: 'Retro 50s' },
    { id: 'Scandinavian', icon: <Cloud size={18} />, description: 'Hygge & Ash' },
    { id: 'Bohemian', icon: <Flower2 size={18} />, description: 'Eclectic' },
  ];

  const grassLevels = [
    { id: 'field', name: 'Field Green (Natural Thatch)', desc: 'Organic 4-tone blend with brown root layers' },
    { id: 'estate', name: 'Estate Emerald (Luxury Pile)', desc: 'Dense, deep green with natural texture' },
    { id: 'spring', name: 'Spring Blend (Multi-Tonal)', desc: 'Vibrant, mixed-blade height for realism' }
  ];

  const furnitureSuggestions: Record<FurnitureRoomType, string[]> = {
    'Living Room': ['Sectional Sofa', 'Coffee Table', 'TV Stand', 'Armchair', 'Area Rug', 'Wall Art'],
    'Bedroom': ['King Bed', 'Nightstands', 'Dresser', 'Lamps', 'Bench'],
    'Dining Room': ['Dining Table', 'Chairs', 'Sideboard', 'Chandelier'],
    'Office': ['Executive Desk', 'Chair', 'Bookshelf', 'Floor Lamp'],
    'Kitchen': ['Bar Stools', 'Fruit Bowl', 'Pendant Lights'],
    'Primary Bedroom': ['Cal King Bed', 'Chaise Lounge', 'Vanity', 'Mirror'],
    'Exterior': ['Patio Set', 'Outdoor Grill', 'Sun Loungers', 'Fire Pit', 'Potted Palms']
  };

  const handleApplyCleanup = () => {
    onGenerate("Architectural Restoration: Precisely remove only the masked items. Keep all doors, ceiling lights, and structural openings exactly as they appear in the original. Reveal the floor or hallway behind the mask. DO NOT cover hallways with new walls.");
  };

  const buildPrompt = () => {
    let prompt = "";
    if (activeTab === 'landscape') {
      prompt = `Exterior Landscaping: Replace the ground/grass area with ${grassLevel || 'high-quality natural artificial turf'}. Include realistic blade variation, brown thatch roots, and directional texture. Ensure soft shadows and organic edges.`;
    } else if (activeTab === 'renovate') {
      prompt = `Professional Renovation of this ${selectedRoom} in ${selectedPreset || 'Modern'} style. Preserving existing doors and light fixtures.`;
    } else {
      const itemsDesc = stagedFurniture.map(f => `${f.name} (${f.orientation})`).join(', ');
      prompt = `Virtually stage as a ${selectedRoom} in ${selectedPreset || 'Modern'} style. IMPORTANT: Do not change any of the original items of the room like the curtains. Preserving architecture. Add: ${itemsDesc}.`;
    }
    
    if (customPrompt) prompt += `. ${customPrompt}`;
    if (hasMask) prompt += ". ONLY update the masked area, keeping the rest of the image identical.";
    
    onGenerate(prompt);
  };

  if (activeMode === 'cleanup') {
    return (
      <div className="space-y-6">
        {/* Section 1: Info */}
        <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
              <Eraser size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Architectural Cleanup</h3>
              <p className="text-xs text-slate-500">Remove items to reveal the space behind.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Use the selection tool on the image to mask unwanted objects. The AI will intelligently remove them and restore the original architecture like floors and walls.
          </p>
        </div>

        {/* Section 2: AI Protection Info */}
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-3">
          <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-800 font-medium">
            <strong>AI Protection:</strong> Doors, windows, and light fixtures are automatically preserved during cleanup.
          </p>
        </div>

        {/* Section 3: Generate Action */}
        <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl text-white sticky bottom-6">
          <div className="flex flex-col gap-3">
            <button
              onClick={handleApplyCleanup}
              disabled={isGenerating || !hasMask}
              className="w-full bg-white text-slate-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Remove & Reveal</span>
                </>
              )}
            </button>
            <p className="text-xs text-slate-400 text-center px-4">
              {hasMask ? 'Ready to process your selection.' : 'Draw on the image to select an area to remove.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Main Prompt */}
      <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
            <FilePenLine size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Design Prompt</h3>
            <p className="text-xs text-slate-500">Add notes or specific requests.</p>
          </div>
        </div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g., 'add a large fiddle leaf fig in the corner', 'use a light oak wood tone for the flooring'..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 resize-none"
          rows={3}
        />
      </div>

      {/* Section 2: Virtual Staging */}
      <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
            <Sofa size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">Add or remove furniture items.</p>
          </div>
        </div>
        
        {/* Furniture Suggestions */}
        <div className="flex flex-wrap gap-2 pt-2">
          {furnitureSuggestions[selectedRoom]?.map(item => (
            <button
              key={item}
              onClick={() => addFurniture(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 text-xs font-medium text-slate-700 hover:bg-indigo-100 hover:text-indigo-700 transition-all border border-slate-200"
            >
              <Plus size={12} /> {item}
            </button>
          ))}
        </div>

        {/* Staged Furniture List */}
        {stagedFurniture.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-slate-100">
             <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Staged Items</h4>
             {stagedFurniture.map(f => (
               <div key={f.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 group border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                     <button onClick={() => rotateFurniture(f.id)} title="Rotate" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-lg transition-all"><RotateCw size={12} /></button>
                     <button onClick={() => removeFurniture(f.id)} title="Remove" className="p-1.5 text-slate-500 hover:bg-white hover:text-red-500 rounded-lg transition-all"><X size={12} /></button>
                  </div>
               </div>
             ))}
          </div>
        )}
      </div>

      {/* Section 3: Style Palette */}
      <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
            <Wand2 size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Style Palette</h3>
            <p className="text-xs text-slate-500">Select a design aesthetic.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedPreset(preset.id)}
              className={`p-3 rounded-2xl border text-left transition-all ${
                selectedPreset === preset.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${selectedPreset === preset.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>
                  {preset.icon}
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-900">{preset.id}</span>
                  <p className="text-xs text-slate-500">{preset.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Section 4: Generate Action */}
      <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl space-y-4 text-white sticky bottom-6">
         <div className="flex flex-col gap-3">
             <button
               onClick={buildPrompt}
               disabled={isGenerating}
               className="w-full bg-white text-slate-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
             >
               {isGenerating ? (
                 <div className="flex items-center gap-2">
                   <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                   <span>Rendering...</span>
                 </div>
               ) : (
                 <>
                   <Wand2 size={18} />
                   <span>{hasGenerated ? 'Re-generate Design' : 'Generate Design'}</span>
                 </>
               )}
             </button>
             <button
               onClick={onReroll}
               disabled={isGenerating || (!selectedPreset && !stagedFurniture.length && !customPrompt && !grassLevel)}
               className="w-full bg-slate-800 text-slate-300 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-700 hover:text-white transition-all border border-slate-700 disabled:opacity-40"
             >
               <Dices size={16} />
               <span className="text-sm">Explore Variation</span>
             </button>
          </div>
      </div>
    </div>
  );
};

export default RenovationControls;
