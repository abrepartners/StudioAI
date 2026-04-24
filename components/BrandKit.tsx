/**
 * BrandKit.tsx — Agent Brand Kit Settings Page
 * Task 1.2 — Upload brand assets, persist via useBrandKit hook
 *
 * Add to App.tsx sidebar nav as "Settings" or "Brand Kit"
 * Route: /settings or render as panel when activePanel === 'settings'
 */

import React, { useRef, useCallback, useState } from 'react';
import {
  Upload,
  X,
  Check,
  Palette,
  User,
  Building2,
  Phone,
  Mail,
  Globe,
  Quote,
  Camera,
  Trash2,
  Save,
} from 'lucide-react';
import { useBrandKit, readFileAsDataURL } from '../hooks/useBrandKit';
import PanelHeader from './PanelHeader';
import { Badge, Button } from './ui';

// ─── Component ────────────────────────────────────────────────────────────────

interface BrandKitProps {
  /** F8: fire a parent-managed toast when the brand kit is saved */
  onSaved?: () => void;
}

const BrandKit: React.FC<BrandKitProps> = ({ onSaved }) => {
  const { brandKit, updateBrandKit, resetBrandKit, hasBrandKit } = useBrandKit();
  const [showSaved, setShowSaved] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const logoRef = useRef<HTMLInputElement>(null);
  const headshotRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'headshot') => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataURL = await readFileAsDataURL(file);
        updateBrandKit({ [field]: dataURL });
      } catch (err) {
        console.error(`Failed to read ${field}:`, err);
      }
      // Reset input so same file can be re-uploaded
      e.target.value = '';
    },
    [updateBrandKit]
  );

  const handleSave = () => {
    // Data is already persisted via hook effect, this is just UX feedback
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    onSaved?.();
  };

  const handleReset = () => {
    if (showReset) {
      resetBrandKit();
      setShowReset(false);
    } else {
      setShowReset(true);
      setTimeout(() => setShowReset(false), 3000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6">
      {/* Header */}
      <PanelHeader
        icon={<Palette className="w-5 h-5" />}
        title="Brand Kit"
        subtitle="Set up your brand once. Every export, website, and print piece will use it automatically."
        subtitleStyle="plain"
      />

      {/* Status Badge */}
      {hasBrandKit ? (
        <div className="flex items-center gap-2 bg-[#30D158]/10 border border-[#30D158]/20 rounded-lg px-3 py-2">
          <Check className="w-4 h-4 text-[#30D158]" />
          <span className="text-sm text-[#30D158]">Brand kit active — your exports will be branded</span>
          <Badge tone="success" className="ml-auto">Active</Badge>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
          <Palette className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Add your name and logo to activate branding</span>
          <Badge tone="neutral" className="ml-auto">Empty</Badge>
        </div>
      )}

      {/* Logo & Headshot */}
      <div className="grid grid-cols-2 gap-4">
        {/* Logo Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Logo</label>
          <div
            onClick={() => logoRef.current?.click()}
            className="relative cursor-pointer bg-zinc-800 border-2 border-dashed border-zinc-700 rounded-xl h-32 flex items-center justify-center hover:border-[#0A84FF] hover:bg-zinc-800/80 transition-all duration-200 overflow-hidden"
          >
            {brandKit.logo ? (
              <>
                <img src={brandKit.logo} alt="Logo" className="max-h-24 max-w-full object-contain" />
                <button
                  onClick={(e) => { e.stopPropagation(); updateBrandKit({ logo: null }); }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500/80 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </>
            ) : (
              <div className="text-center">
                <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                <span className="text-xs text-zinc-500">Upload logo</span>
              </div>
            )}
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'logo')} />
        </div>

        {/* Headshot Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Headshot</label>
          <div
            onClick={() => headshotRef.current?.click()}
            className="relative cursor-pointer bg-zinc-800 border-2 border-dashed border-zinc-700 rounded-xl h-32 flex items-center justify-center hover:border-[#0A84FF] hover:bg-zinc-800/80 transition-all duration-200 overflow-hidden"
          >
            {brandKit.headshot ? (
              <>
                <img src={brandKit.headshot} alt="Headshot" className="h-24 w-24 object-cover rounded-full" />
                <button
                  onClick={(e) => { e.stopPropagation(); updateBrandKit({ headshot: null }); }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500/80 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </>
            ) : (
              <div className="text-center">
                <Camera className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                <span className="text-xs text-zinc-500">Upload headshot</span>
              </div>
            )}
          </div>
          <input ref={headshotRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'headshot')} />
        </div>
      </div>

      {/* Brand Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Primary Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandKit.primaryColor}
              onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
              className="w-10 h-10 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={brandKit.primaryColor}
              onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-[#0A84FF] focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Secondary Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandKit.secondaryColor}
              onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
              className="w-10 h-10 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={brandKit.secondaryColor}
              onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-[#0A84FF] focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Text Fields */}
      <div className="space-y-4">
        {[
          { key: 'agentName' as const, label: 'Agent Name', icon: User, placeholder: 'Jane Smith' },
          { key: 'brokerageName' as const, label: 'Brokerage', icon: Building2, placeholder: 'Keller Williams Realty' },
          { key: 'phone' as const, label: 'Phone', icon: Phone, placeholder: '(555) 123-4567' },
          { key: 'email' as const, label: 'Email', icon: Mail, placeholder: 'jane@example.com' },
          { key: 'website' as const, label: 'Website', icon: Globe, placeholder: 'www.janesmith.com' },
          { key: 'tagline' as const, label: 'Tagline', icon: Quote, placeholder: 'Your dream home, realized.' },
        ].map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 text-zinc-500" />
              {label}
            </label>
            <input
              type="text"
              value={brandKit[key]}
              onChange={(e) => updateBrandKit({ [key]: e.target.value })}
              placeholder={placeholder}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:outline-none transition-colors"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
            showSaved
              ? 'bg-[#30D158] text-white'
              : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
          }`}
        >
          {showSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Brand Kit</>}
        </button>
        <button
          onClick={handleReset}
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-200 ${
            showReset
              ? 'bg-[#FF375F] text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          {showReset ? 'Confirm Reset' : 'Reset'}
        </button>
      </div>
    </div>
  );
};

export default BrandKit;
