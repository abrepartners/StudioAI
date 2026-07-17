/**
 * ListingDescription.tsx — AI Listing Description Generator
 * Task 1.4 — 3 tones, char counts, copy button, save to listing
 *
 * Mountable standalone inside the Vellum editor as a dark-editorial overlay
 * via the shared [GEN-PROPS] contract:
 *   <ListingDescription open onClose={…} images={…} listingMeta={…} />
 *
 * Copy generation runs SERVER-SIDE via POST /api/listing-copy (a Replicate-
 * hosted text model, same REPLICATE_API_TOKEN as the image tools). The old
 * browser Gemini path (in-bundle key) is gone for good. generateDescription()
 * builds the tone prompt with the generate{Luxury,Casual,Investment}TonePrompt
 * builders below and POSTs it — no browser key, no client-side model.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Copy,
  Check,
  FileText,
  ChevronDown,
  RotateCcw,
  Gem,
  Coffee,
  TrendingUp,
} from "lucide-react";
import {
  generateLuxuryTonePrompt,
  generateCasualTonePrompt,
  generateInvestmentTonePrompt,
  type ListingDescriptionInput,
  type PropertyDetails,
} from "../src/prompts/listingDescription";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = "luxury" | "casual" | "investment";

interface Description {
  tone: Tone;
  text: string;
  charCount: number;
}

const TONE_CONFIG = {
  luxury: {
    label: "Luxury",
    icon: Gem,
    description: "Sophisticated, elevated language for premium properties",
    color: "#d8c79a",
  },
  casual: {
    label: "Casual",
    icon: Coffee,
    description: "Warm and approachable for broad buyer appeal",
    color: "#d8c79a",
  },
  investment: {
    label: "Investment",
    icon: TrendingUp,
    description: "Data-driven focus on ROI and market position",
    color: "#30D158",
  },
} as const;

const MLS_CHAR_LIMITS = [
  { name: "Zillow", limit: 5000, color: "#d8c79a" },
  { name: "Realtor.com", limit: 4000, color: "#c4b485" },
  { name: "Generic MLS", limit: 1000, color: "#a99a6f" },
];

// ─── Component ────────────────────────────────────────────────────────────────

/** Shared [GEN-PROPS] contract — the image shape the Vellum editor passes in. */
interface GenImage {
  id: string;
  dataUrl: string;
  label?: string;
  isRefined?: boolean;
}

interface ListingDescriptionProps {
  open: boolean;
  onClose: () => void;
  images: GenImage[];
  projectName?: string;
  listingMeta?: {
    address?: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    price?: number;
  };
  onSave?: (description: string, tone: Tone) => void;
}

const ListingDescription: React.FC<ListingDescriptionProps> = ({
  open,
  images,
  projectName,
  listingMeta,
  onSave,
}) => {
  // Derive room types from the passed-in image labels (the editor labels each
  // refined photo with its room). Falls back to sensible defaults at gen time.
  const roomTypes = useMemo<string[]>(
    () =>
      Array.from(
        new Set(
          (images || []).map((img) => (img.label || "").trim()).filter(Boolean),
        ),
      ),
    [images],
  );

  // Seed the property form from the [GEN-PROPS] listingMeta.
  const initialDetails = listingMeta;

  // Property details form
  const [details, setDetails] = useState<PropertyDetails>({
    beds: initialDetails?.beds ?? 3,
    baths: initialDetails?.baths ?? 2,
    sqft: initialDetails?.sqft ?? 2000,
    price: initialDetails?.price ?? 450000,
    address: initialDetails?.address ?? "",
    yearBuilt: initialDetails?.yearBuilt ?? 2000,
    propertyType: initialDetails?.propertyType ?? "Single Family",
  });
  const [agentNotes, setAgentNotes] = useState("");
  const [showDetails, setShowDetails] = useState(true);

  // Generation state
  const [activeTone, setActiveTone] = useState<Tone>("luxury");
  const [descriptions, setDescriptions] = useState<Record<Tone, string>>({
    luxury: "",
    casual: "",
    investment: "",
  });
  const [generatingTone, setGeneratingTone] = useState<Tone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isGenerating = generatingTone !== null;
  const [copiedTone, setCopiedTone] = useState<Tone | null>(null);

  // Build the tone prompt for the active inputs. This is the server payload the
  // future /api/listing-copy endpoint will receive — kept wired so re-enabling
  // is a one-line swap. Returns the prompt string (no AI call here).
  const buildTonePrompt = useCallback(
    (tone: Tone): string => {
      const input: ListingDescriptionInput = {
        roomTypes:
          roomTypes.length > 0
            ? roomTypes
            : ["Living Room", "Kitchen", "Primary Bedroom"],
        propertyDetails: details,
        agentNotes: agentNotes || undefined,
      };
      const promptFn = {
        luxury: generateLuxuryTonePrompt,
        casual: generateCasualTonePrompt,
        investment: generateInvestmentTonePrompt,
      }[tone];
      return promptFn(input);
    },
    [details, agentNotes, roomTypes],
  );

  // Generate the description for a tone: build the prompt with the shared tone
  // builder, POST it to the server text endpoint, and store the result. No
  // browser key — /api/listing-copy runs the Replicate text model server-side.
  const generateDescription = useCallback(
    async (tone: Tone) => {
      setActiveTone(tone);
      setError(null);
      setGeneratingTone(tone);
      try {
        const res = await fetch("/api/listing-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: buildTonePrompt(tone), tone }),
        });
        if (!res.ok) throw new Error(`listing-copy HTTP ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "generation failed");
        const text = String(data.text || "").trim();
        if (!text) throw new Error("empty description");
        setDescriptions((prev) => ({ ...prev, [tone]: text }));
      } catch (e: any) {
        setError(e?.message || "Couldn't generate — try again.");
      } finally {
        setGeneratingTone(null);
      }
    },
    [buildTonePrompt],
  );

  // Generate all 3 tones, one after another (sequential keeps the Replicate
  // account gentle and the UI legible — each tab flips green as it lands).
  const generateAll = useCallback(async () => {
    for (const tone of ["luxury", "casual", "investment"] as Tone[]) {
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

  if (!open) return null;

  return (
    <div className="space-y-5">
      {/* Panel intro (the host .v-gen-overlay supplies the modal shell + title + close) */}
      <div>
        <h3
          className="text-[#f7f6f2] text-xl font-medium flex items-center gap-2"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          <FileText className="w-5 h-5 text-[#d8c79a]" />
          Listing Description
        </h3>
        <p className="text-zinc-400 text-sm mt-0.5">
          {projectName
            ? `${projectName} — AI-generated MLS descriptions in three tones`
            : "AI-generated MLS descriptions in three professional tones"}
        </p>
      </div>

      {/* Property Details (Collapsible) */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-zinc-300">
            Property Details
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform ${showDetails ? "rotate-180" : ""}`}
          />
        </button>

        {showDetails && (
          <div className="px-4 pb-4 space-y-3">
            {/* Address */}
            <input
              type="text"
              value={details.address}
              onChange={(e) =>
                setDetails((d) => ({ ...d, address: e.target.value }))
              }
              placeholder="Property address"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#d8c79a] focus:outline-none"
            />

            {/* Grid: beds, baths, sqft, price */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "beds", label: "Beds", type: "number" },
                { key: "baths", label: "Baths", type: "number" },
                { key: "sqft", label: "Sq Ft", type: "number" },
                { key: "price", label: "Price", type: "number" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">
                    {label}
                  </label>
                  <input
                    type={type}
                    value={details[key as keyof PropertyDetails] as number}
                    onChange={(e) =>
                      setDetails((d) => ({
                        ...d,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#d8c79a] focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Year built + Property type */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Year Built
                </label>
                <input
                  type="number"
                  value={details.yearBuilt}
                  onChange={(e) =>
                    setDetails((d) => ({
                      ...d,
                      yearBuilt: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#d8c79a] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Type
                </label>
                <select
                  value={details.propertyType}
                  onChange={(e) =>
                    setDetails((d) => ({
                      ...d,
                      propertyType: e.target
                        .value as PropertyDetails["propertyType"],
                    }))
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#d8c79a] focus:outline-none"
                >
                  {[
                    "Single Family",
                    "Condo",
                    "Townhouse",
                    "Multi-Family",
                    "Land",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agent Notes */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider">
                Agent Notes (optional)
              </label>
              <textarea
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="Recently renovated kitchen, new HVAC, pool was added in 2023..."
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#d8c79a] focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tone Tabs */}
      <div className="flex gap-2">
        {(
          Object.entries(TONE_CONFIG) as [Tone, (typeof TONE_CONFIG)[Tone]][]
        ).map(([tone, cfg]) => {
          const Icon = cfg.icon;
          const hasContent = descriptions[tone].length > 0;
          return (
            <button
              key={tone}
              onClick={() => setActiveTone(tone)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${
                activeTone === tone
                  ? "bg-zinc-800 text-white border border-zinc-600"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700"
              }`}
            >
              <Icon
                className="w-3.5 h-3.5"
                style={activeTone === tone ? { color: cfg.color } : {}}
              />
              {cfg.label}
              {hasContent && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Generate — copy runs server-side via /api/listing-copy. The address
          gates generation (it anchors every tone prompt). */}
      <div className="flex gap-2">
        <button
          onClick={() => generateDescription(activeTone)}
          disabled={isGenerating || !details.address}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
            isGenerating || !details.address
              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              : "bg-[#d8c79a] text-black hover:bg-[#e3d4ab] active:scale-[0.98]"
          }`}
        >
          {generatingTone === activeTone
            ? "Generating…"
            : `Generate ${TONE_CONFIG[activeTone].label}`}
        </button>
        <button
          onClick={generateAll}
          disabled={isGenerating || !details.address}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? "…" : "All 3"}
        </button>
      </div>

      {!details.address && (
        <p className="text-xs text-zinc-500 -mt-2">
          Add the property address above to generate copy.
        </p>
      )}
      {error && (
        <p className="text-xs text-[#FF375F] -mt-2">
          Couldn't generate — {error}. Try again.
        </p>
      )}

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
                  <span className="text-xs text-zinc-500 w-20 text-right">
                    {name}
                  </span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: over ? "#FF375F" : color,
                      }}
                    />
                  </div>
                  <span
                    className={`text-xs w-16 ${over ? "text-[#FF375F] font-medium" : "text-zinc-500"}`}
                  >
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
                  ? "bg-[#30D158] text-white"
                  : "bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700"
              }`}
            >
              {copiedTone === activeTone ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
              )}
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
