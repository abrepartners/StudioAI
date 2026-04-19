/**
 * SocialPack.tsx — Branded Social Templates
 *
 * Renders premium Satori-based templates (Just Listed, Before/After,
 * Open House, Tip Card) via /api/render-template. Auto-fills agent
 * info from the brand kit; user fills listing details inline.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Download,
  Check,
  Loader2,
  Sparkles,
  Home,
  ArrowRightLeft,
  CalendarDays,
  Lightbulb,
  Image as ImageIcon,
} from 'lucide-react';
import { useBrandKit } from '../hooks/useBrandKit';

interface StagedImage {
  id: string;
  source: string;
  label: string;
}

interface SocialPackProps {
  images: StagedImage[];
  propertyDetails?: {
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    price: number;
  };
}

type TemplateId = 'just-listed' | 'before-after' | 'open-house' | 'tip-card';
type FormatId = 'ig-post' | 'ig-story' | 'fb-post';

const TEMPLATES: Array<{
  id: TemplateId;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  { id: 'just-listed', label: 'Just Listed', icon: Home, description: 'Hero photo + price + stats' },
  { id: 'before-after', label: 'Before / After', icon: ArrowRightLeft, description: 'Staging transformation' },
  { id: 'open-house', label: 'Open House', icon: CalendarDays, description: 'Event invite card' },
  { id: 'tip-card', label: 'Market Tip', icon: Lightbulb, description: 'Stat or insight card' },
];

const FORMATS: Array<{ id: FormatId; label: string; dims: string }> = [
  { id: 'ig-post', label: 'IG Post', dims: '1080×1080' },
];

function formatPrice(n?: number): string {
  if (!n) return '';
  return `$${n.toLocaleString()}`;
}

function titleCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function toDataURL(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;
  const res = await fetch(source);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const SocialPack: React.FC<SocialPackProps> = ({ images, propertyDetails }) => {
  const { brandKit } = useBrandKit();

  const [template, setTemplate] = useState<TemplateId>('just-listed');
  const [format, setFormat] = useState<FormatId>('ig-post');
  const [heroId, setHeroId] = useState<string>(images[0]?.id || '');
  const [beforeId, setBeforeId] = useState<string>(images[0]?.id || '');
  const [afterId, setAfterId] = useState<string>(images[1]?.id || images[0]?.id || '');

  // Editable listing fields (seeded from propertyDetails)
  const [address, setAddress] = useState(propertyDetails?.address || '');
  const [city, setCity] = useState('');
  const [state, setStateField] = useState('');
  const [zip, setZip] = useState('');
  const [price, setPrice] = useState(formatPrice(propertyDetails?.price));
  const [beds, setBeds] = useState<string>(propertyDetails?.beds?.toString() || '');
  const [baths, setBaths] = useState<string>(propertyDetails?.baths?.toString() || '');
  const [sqft, setSqft] = useState<string>(propertyDetails?.sqft?.toString() || '');
  const [yearBuilt, setYearBuilt] = useState<string>('');

  // Open house specific
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  // Tip card specific
  const [headline, setHeadline] = useState('');
  const [tagline, setTagline] = useState('');

  const [isRendering, setIsRendering] = useState(false);
  const [renderedPng, setRenderedPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroImage = useMemo(() => images.find(i => i.id === heroId), [images, heroId]);
  const beforeImage = useMemo(() => images.find(i => i.id === beforeId), [images, beforeId]);
  const afterImage = useMemo(() => images.find(i => i.id === afterId), [images, afterId]);

  const handleRender = useCallback(async () => {
    setIsRendering(true);
    setError(null);
    setRenderedPng(null);
    try {
      const data: Record<string, any> = {
        agentName: brandKit.agentName || undefined,
        brokerageName: brandKit.brokerageName || undefined,
        phone: brandKit.phone || undefined,
        email: brandKit.email || undefined,
        website: brandKit.website || undefined,
        primaryColor: brandKit.primaryColor,
        logo: brandKit.logo || undefined,
        headshot: brandKit.headshot || undefined,
      };

      if (template === 'just-listed' || template === 'open-house') {
        if (address) data.address = titleCase(address);
        if (city) data.city = titleCase(city);
        if (state) data.state = state.trim().toUpperCase();
        if (zip) data.zip = zip.trim();
        if (price) data.price = price;
        if (beds) data.beds = parseInt(beds, 10);
        if (baths) data.baths = parseFloat(baths);
        if (sqft) data.sqft = parseInt(sqft, 10);
        if (yearBuilt) data.yearBuilt = parseInt(yearBuilt, 10);
        if (heroImage) data.heroImage = await toDataURL(heroImage.source);
      }
      if (template === 'open-house') {
        if (date) data.date = date;
        if (time) data.time = time;
      }
      if (template === 'before-after') {
        if (address) data.address = titleCase(address);
        if (city) data.city = titleCase(city);
        if (state) data.state = state.trim().toUpperCase();
        if (beforeImage) data.beforeImage = await toDataURL(beforeImage.source);
        if (afterImage) data.afterImage = await toDataURL(afterImage.source);
      }
      if (template === 'tip-card') {
        if (headline) data.headline = headline;
        if (tagline) data.tagline = tagline;
      }

      const res = await fetch('/api/render-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, format, data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Render failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setRenderedPng(URL.createObjectURL(blob));
    } catch (e: any) {
      console.error('Render failed:', e);
      setError(e.message || 'Render failed');
    } finally {
      setIsRendering(false);
    }
  }, [
    template, format, brandKit, address, city, state, zip, price, beds, baths, sqft, yearBuilt,
    date, time, headline, tagline, heroImage, beforeImage, afterImage,
  ]);

  const handleDownload = useCallback(() => {
    if (!renderedPng) return;
    const a = document.createElement('a');
    a.href = renderedPng;
    a.download = `${template}_${format}.png`;
    a.click();
  }, [renderedPng, template, format]);

  const needsHero = template === 'just-listed' || template === 'open-house';
  const needsBeforeAfter = template === 'before-after';
  const needsListingFields = template !== 'tip-card';

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
      <div>
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#0A84FF]" />
          Social Pack
        </h3>
        <p className="text-zinc-400 text-sm mt-0.5">
          Branded social templates powered by your brand kit
        </p>
        {!brandKit.agentName && (
          <p className="text-sm text-amber-400/80 mt-1.5">
            Tip: set your brand kit in Settings for auto-filled agent info
          </p>
        )}
      </div>

      {/* Template picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Template</label>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(t => {
            const Icon = t.icon;
            const selected = template === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`flex items-start gap-2 p-3 rounded-lg text-left transition-all duration-200 border ${
                  selected
                    ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-white'
                    : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selected ? 'text-[#0A84FF]' : ''}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs opacity-70">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Format picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Format</label>
        <div className="flex gap-2">
          {FORMATS.map(f => {
            const selected = format === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  selected ? 'bg-[#0A84FF] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div>{f.label}</div>
                <div className="text-xs opacity-60 mt-0.5">{f.dims}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Image picker(s) */}
      {needsHero && images.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Hero Photo</label>
          <div className="grid grid-cols-4 gap-2">
            {images.map(img => (
              <button
                key={img.id}
                onClick={() => setHeroId(img.id)}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  heroId === img.id ? 'border-[#0A84FF]' : 'border-transparent hover:border-zinc-700'
                }`}
              >
                <img src={img.source} alt={img.label} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {needsBeforeAfter && images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Before</label>
            <div className="grid grid-cols-2 gap-1.5">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => setBeforeId(img.id)}
                  className={`relative aspect-square rounded overflow-hidden border-2 ${
                    beforeId === img.id ? 'border-[#0A84FF]' : 'border-transparent'
                  }`}
                >
                  <img src={img.source} alt={img.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">After</label>
            <div className="grid grid-cols-2 gap-1.5">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => setAfterId(img.id)}
                  className={`relative aspect-square rounded overflow-hidden border-2 ${
                    afterId === img.id ? 'border-[#0A84FF]' : 'border-transparent'
                  }`}
                >
                  <img src={img.source} alt={img.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Listing fields */}
      {needsListingFields && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Listing Details</label>
          <input
            type="text"
            placeholder="Street address (e.g., 123 Main St)"
            value={address}
            onChange={e => setAddress(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none"
          />
          <div className="grid grid-cols-[1fr_60px_80px] gap-2">
            <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
            <input type="text" placeholder="State" maxLength={2} value={state} onChange={e => setStateField(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
            <input type="text" inputMode="numeric" placeholder="Zip" maxLength={5} value={zip} onChange={e => setZip(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
          </div>
          <input
            type="text"
            placeholder="Price (e.g., $425,000)"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none"
          />
          <div className="grid grid-cols-4 gap-2">
            <input type="text" inputMode="decimal" placeholder="Beds" value={beds} onChange={e => setBeds(e.target.value)} className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
            <input type="text" inputMode="decimal" placeholder="Baths" value={baths} onChange={e => setBaths(e.target.value)} className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
            <input type="text" inputMode="numeric" placeholder="Sq Ft" value={sqft} onChange={e => setSqft(e.target.value)} className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
            <input type="text" inputMode="numeric" placeholder="Year" value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
          </div>
        </div>
      )}

      {/* Open house date/time */}
      {template === 'open-house' && (
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Date (e.g., Saturday, April 19)" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
          <input type="text" placeholder="Time (e.g., 1–4 PM)" value={time} onChange={e => setTime(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
        </div>
      )}

      {/* Tip card fields */}
      {template === 'tip-card' && (
        <div className="space-y-2">
          <input type="text" placeholder="Headline (e.g., 'Rates just dropped')" value={headline} onChange={e => setHeadline(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none" />
          <textarea placeholder="Supporting line or stat" value={tagline} onChange={e => setTagline(e.target.value)} rows={2} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] outline-none resize-none" />
        </div>
      )}

      {/* Preview + Render */}
      {renderedPng && (
        <div className="rounded-lg overflow-hidden border border-zinc-800 bg-black">
          <img src={renderedPng} alt="Preview" className="w-full" />
        </div>
      )}

      {error && (
        <div className="text-xs text-[#FF375F] bg-[#FF375F]/10 border border-[#FF375F]/20 rounded-lg p-2">
          {error}
        </div>
      )}

      {needsHero && images.length === 0 && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          No staged photos yet. Generate at least one staged image first — otherwise the template renders with a blank "Property Photo" placeholder.
        </div>
      )}

      {needsHero && images.length > 0 && !heroImage && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          Pick a hero photo above.
        </div>
      )}

      {needsBeforeAfter && images.length < 2 && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          Need at least 2 generated images for before / after. Generate a staged version of this room first.
        </div>
      )}

      {!brandKit.agentName && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          Your agent name is blank. Fill in Brand Kit (Settings) so your name appears on every render.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleRender}
          disabled={isRendering}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
            isRendering
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
          }`}
        >
          {isRendering ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Rendering...</>
          ) : (
            <><ImageIcon className="w-4 h-4" /> {renderedPng ? 'Re-render' : 'Render'}</>
          )}
        </button>
        {renderedPng && (
          <button
            onClick={handleDownload}
            className="px-4 py-3 rounded-xl font-semibold text-sm bg-[#30D158] text-white hover:bg-[#30D158]/90 active:scale-[0.98] flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download
          </button>
        )}
      </div>
    </div>
  );
};

export default SocialPack;
