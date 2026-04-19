/**
 * ListingDescription.tsx — AI Listing Description Generator
 * Task 1.4 — 3 tones, char counts, copy button, save to listing
 *
 * Uses existing Gemini API patterns from geminiService.ts
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  FileText,
  Loader2,
  ChevronDown,
  RotateCcw,
  Gem,
  Coffee,
  TrendingUp,
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { getActiveApiKey } from '../services/geminiService';
import {
  generateLuxuryTonePrompt,
  generateCasualTonePrompt,
  generateInvestmentTonePrompt,
  type ListingDescriptionInput,
  type PropertyDetails,
} from '../src/prompts/listingDescription';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = 'luxury' | 'casual' | 'investment';

interface Description {
  tone: Tone;
  text: string;
  charCount: number;
}

const TONE_CONFIG = {
  luxury: { label: 'Luxury', icon: Gem, description: 'Sophisticated, elevated language for premium properties', color: '#FFD60A' },
  casual: { label: 'Casual', icon: Coffee, description: 'Warm and approachable for broad buyer appeal', color: '#0A84FF' },
  investment: { label: 'Investment', icon: TrendingUp, description: 'Data-driven focus on ROI and market position', color: '#30D158' },
} as const;

const MLS_CHAR_LIMITS = [
  { name: 'Zillow', limit: 5000, color: '#0A84FF' },
  { name: 'Realtor.com', limit: 4000, color: '#30D158' },
  { name: 'Generic MLS', limit: 1000, color: '#FFD60A' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface ListingDescriptionProps {
  roomTypes?: string[];
  initialDetails?: Partial<PropertyDetails>;
  onSave?: (description: string, tone: Tone) => void;
}

const ListingDescription: React.FC<ListingDescriptionProps> = ({
  roomTypes = [],
  initialDetails,
  onSave,
}) => {
  // Property details form
  const [details, setDetails] = useState<PropertyDetails>({
    beds: initialDetails?.beds ?? 3,
    baths: initialDetails?.baths ?? 2,
    sqft: initialDetails?.sqft ?? 2000,
    price: initialDetails?.price ?? 450000,
    address: initialDetails?.address ?? '',
    yearBuilt: initialDetails?.yearBuilt ?? 2000,
    propertyType: initialDetails?.propertyType ?? 'Single Family',
  });
  const [agentNotes, setAgentNotes] = useState('');
  const [showDetails, setShowDetails] = useState(true);

  // Generation state
  const [activeTone, setActiveTone] = useState<Tone>('luxury');
  const [descriptions, setDescriptions] = useState<Record<Tone, string>>({
    luxury: '',
    casual: '',
    investment: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedTone, setCopiedTone] = useState<Tone | null>(null);

  // Generate description for a tone
  const generateDescription = useCallback(async (tone: Tone) => {
    const apiKey = getActiveApiKey();
    if (!apiKey) return;

    setIsGenerating(true);
    setActiveTone(tone);

    const input: ListingDescriptionInput = {
      roomTypes: roomTypes.length > 0 ? roomTypes : ['Living Room', 'Kitchen', 'Primary Bedroom'],
      propertyDetails: details,
      agentNotes: agentNotes || undefined,
    };

    const promptFn = {
      luxury: generateLuxuryTonePrompt,
      casual: generateCasualTonePrompt,
      investment: generateInvestmentTonePrompt,
    }[tone];

    const prompt = promptFn(input);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const text = response.text || '';
      setDescriptions((prev) => ({ ...prev, [tone]: text }));
    } catch (err) {
      console.error(`Description generation failed (${tone}):`, err);
      setDescriptions((prev) => ({
        ...prev,
        [tone]: 'Generation failed. Please check your API key and try again.',
      }));
    } finally {
      setIsGenerating(false);
    }
  }, [details, agentNotes, roomTypes]);

  // Generate all 3 tones
  const generateAll = useCallback(async () => {
    for (const tone of ['luxury', 'casual', 'investment'] as Tone[]) {
      await generateDescription(tone);
    }
  }, [generateDescription]);

  // Copy to clipboard
  const copyToClipboard = (tone: Tone) => {
    const text = descriptions[tone];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTone(tone);
    setTimeout(() => setCopiedTone(null), 2000);
  };

  const currentText = descriptions[activeTone];
  const charCount = currentText.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0A84FF]" />
          Listing Description
        </h3>
        <p className="text-zinc-400 text-sm mt-0.5">
          AI-generated MLS descriptions in three professional tones
        </p>
      </div>

      {/* Property Details (Collapsible) */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-zinc-300">Property Details</span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>

        {showDetails && (
          <div className="px-4 pb-4 space-y-3">
            {/* Address */}
            <input
              type="text"
              value={details.address}
              onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))}
              placeholder="Property address"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:outline-none"
            />

            {/* Grid: beds, baths, sqft, price */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: 'beds', label: 'Beds', type: 'number' },
                { key: 'baths', label: 'Baths', type: 'number' },
                { key: 'sqft', label: 'Sq Ft', type: 'number' },
                { key: 'price', label: 'Price', type: 'number' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">{label}</label>
                  <input
                    type={type}
                    value={details[key as keyof PropertyDetails] as number}
                    onChange={(e) => setDetails((d) => ({ ...d, [key]: Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#0A84FF] focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Year built + Property type */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Year Built</label>
                <input
                  type="number"
                  value={details.yearBuilt}
                  onChange={(e) => setDetails((d) => ({ ...d, yearBuilt: Number(e.target.value) }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Type</label>
                <select
                  value={details.propertyType}
                  onChange={(e) => setDetails((d) => ({ ...d, propertyType: e.target.value as PropertyDetails['propertyType'] }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#0A84FF] focus:outline-none"
                >
                  {['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agent Notes */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Agent Notes (optional)</label>
              <textarea
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="Recently renovated kitchen, new HVAC, pool was added in 2023..."
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tone Tabs */}
      <div className="flex gap-2">
        {(Object.entries(TONE_CONFIG) as [Tone, typeof TONE_CONFIG[Tone]][]).map(([tone, cfg]) => {
          const Icon = cfg.icon;
          const hasContent = descriptions[tone].length > 0;
          return (
            <button
              key={tone}
              onClick={() => setActiveTone(tone)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${
                activeTone === tone
                  ? 'bg-zinc-800 text-white border border-zinc-600'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" style={activeTone === tone ? { color: cfg.color } : {}} />
              {cfg.label}
              {hasContent && <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />}
            </button>
          );
        })}
      </div>

      {/* Generate Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => generateDescription(activeTone)}
          disabled={isGenerating || !details.address}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
            isGenerating
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : !details.address
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
          }`}
        >
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate {TONE_CONFIG[activeTone].label}</>
          )}
        </button>
        <button
          onClick={generateAll}
          disabled={isGenerating || !details.address}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          All 3
        </button>
      </div>

      {/* Description Output */}
      {currentText && (
        <div className="space-y-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
              {currentText}
            </div>
          </div>

          {/* Char Count Bars */}
          <div className="space-y-1.5">
            {MLS_CHAR_LIMITS.map(({ name, limit, color }) => {
              const pct = Math.min((charCount / limit) * 100, 100);
              const over = charCount > limit;
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-20 text-right">{name}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: over ? '#FF375F' : color,
                      }}
                    />
                  </div>
                  <span className={`text-xs w-16 ${over ? 'text-[#FF375F] font-medium' : 'text-zinc-500'}`}>
                    {charCount.toLocaleString()}/{limit.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(activeTone)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${
                copiedTone === activeTone
                  ? 'bg-[#30D158] text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {copiedTone === activeTone ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
            {onSave && (
              <button
                onClick={() => onSave(currentText, activeTone)}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-all duration-200"
              >
                Save to Listing
              </button>
            )}
            <button
              onClick={() => generateDescription(activeTone)}
              disabled={isGenerating}
              className="px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all duration-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListingDescription;
