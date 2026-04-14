import React, { useState } from 'react';
import {
    Sunset,
    Cloud,
    Trash2,
    Hammer,
    FileText,
    Sparkles,
    Loader2,
    Copy,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import {
    virtualTwilight,
    replaceSky,
    instantDeclutter,
    virtualRenovation,
    generateListingCopy,
    type ListingCopyTone,
} from '../services/geminiService';
import { FurnitureRoomType, SavedStage } from '../types';

const TONE_OPTIONS: { key: ListingCopyTone; label: string; color: string }[] = [
    { key: 'luxury', label: 'Luxury', color: '#FFD60A' },
    { key: 'casual', label: 'Casual', color: '#0A84FF' },
    { key: 'investment', label: 'Investment', color: '#30D158' },
];

const MLS_CHAR_LIMITS = [
    { name: 'Zillow', limit: 5000, color: '#0A84FF' },
    { name: 'Realtor.com', limit: 4000, color: '#30D158' },
    { name: 'Generic MLS', limit: 1000, color: '#FFD60A' },
];

interface SpecialModesPanelProps {
    originalImage: string | null;
    generatedImage: string | null;
    selectedRoom: FurnitureRoomType;
    onNewImage: (imageBase64: string, toolName?: string) => void;
    onRequireKey: () => void;
    savedStages?: SavedStage[];
    isPro?: boolean;
}

type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'stormy';

type SectionId = 'twilight' | 'sky' | 'declutter' | 'renovation' | 'listing';

// ─── Section (extracted to avoid re-mount on parent state change) ────────────
interface SectionProps {
    id: SectionId;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    isOpen: boolean;
    onToggle: (id: SectionId) => void;
}

const Section: React.FC<SectionProps> = ({ id, icon, title, subtitle, children, isOpen, onToggle }) => (
    <div className="premium-surface rounded-2xl overflow-hidden">
        <button
            type="button"
            onClick={() => onToggle(id)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left"
        >
            <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)] shrink-0">{icon}</div>
            <div className="flex-1">
                <p className="font-semibold text-sm text-[var(--color-ink)]">{title}</p>
                <p className="text-xs text-[var(--color-text)]/70">{subtitle}</p>
            </div>
            {isOpen ? <ChevronUp size={16} className="text-[var(--color-text)]/50" /> : <ChevronDown size={16} className="text-[var(--color-text)]/50" />}
        </button>
        {isOpen && <div className="px-5 pb-5 space-y-3 border-t border-[var(--color-border)] pt-4">{children}</div>}
    </div>
);

const SpecialModesPanel: React.FC<SpecialModesPanelProps> = ({
    originalImage,
    generatedImage,
    selectedRoom,
    onNewImage,
    onRequireKey,
    savedStages = [],
    isPro = false,
}) => {
    const [loading, setLoading] = useState<SectionId | null>(null);
    const [openSection, setOpenSection] = useState<SectionId | null>(null);
    const [error, setError] = useState<string>('');

    // Batch mode
    const [batchMode, setBatchMode] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: string[] } | null>(null);

    // Sky replacement
    const [skyStyle, setSkyStyle] = useState<SkyStyle>('blue');

    // Renovation
    const [cabinets, setCabinets] = useState('');
    const [countertops, setCountertops] = useState('');
    const [flooring, setFlooring] = useState('');
    const [walls, setWalls] = useState('');

    // Listing copy
    const [listingCopy, setListingCopy] = useState<{ headline: string; description: string; socialCaption: string; hashtags: string[] } | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [listingTone, setListingTone] = useState<ListingCopyTone>('casual');
    const [showPropertyDetails, setShowPropertyDetails] = useState(false);
    const [propertyAddress, setPropertyAddress] = useState('');
    const [propertyBeds, setPropertyBeds] = useState('');
    const [propertyBaths, setPropertyBaths] = useState('');
    const [propertySqft, setPropertySqft] = useState('');
    const [propertyPrice, setPropertyPrice] = useState('');

    const currentImage = generatedImage || originalImage;

    const run = async (id: SectionId, fn: () => Promise<void>) => {
        if (!currentImage) { setError('Upload a photo first.'); return; }
        setLoading(id);
        setError('');
        try {
            await fn();
        } catch (e: any) {
            if (e.message === 'API_KEY_REQUIRED') {
                onRequireKey();
            } else {
                setError(e?.message || 'Something went wrong. Try again.');
            }
        } finally {
            setLoading(null);
        }
    };

    const copyText = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    const toggleSection = (id: SectionId) => setOpenSection(prev => prev === id ? null : id);

    const batchImages = savedStages.map(s => s.generatedImage || s.originalImage);
    const canBatch = batchMode && batchImages.length > 0;

    const runBatch = async (id: SectionId, processFn: (img: string) => Promise<string>) => {
        if (!canBatch) return;
        setLoading(id);
        setError('');
        setBatchProgress({ current: 0, total: batchImages.length, results: [] });
        try {
            const results: string[] = [];
            for (let i = 0; i < batchImages.length; i++) {
                setBatchProgress({ current: i + 1, total: batchImages.length, results });
                const result = await processFn(batchImages[i]);
                results.push(result);
            }
            setBatchProgress({ current: batchImages.length, total: batchImages.length, results });
            // Apply the first result to the canvas
            if (results.length > 0) onNewImage(results[0]);
        } catch (e: any) {
            if (e.message === 'API_KEY_REQUIRED') {
                onRequireKey();
            } else {
                setError(e?.message || 'Batch processing failed.');
            }
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="space-y-2 sm:space-y-3">
            <div className="px-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Special Modes</p>
                <h3 className="font-display text-lg sm:text-xl mt-0.5">Pro AI Tools</h3>
                <p className="text-xs text-[var(--color-text)]/75 mt-1 hidden sm:block">Advanced tools that go beyond basic staging. These features work on uploaded photos.</p>
            </div>

            {/* Batch Mode Toggle */}
            {savedStages.length > 1 && (
                <div className="flex items-center justify-between px-1">
                    <div>
                        <p className="text-xs font-semibold text-[var(--color-text)]/80">Batch Mode</p>
                        <p className="text-[10px] text-[var(--color-text)]/50">Apply edits to all {savedStages.length} saved images</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setBatchMode(!batchMode); setBatchProgress(null); }}
                        className={`relative w-10 h-5 rounded-full transition-all ${batchMode ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${batchMode ? 'left-5.5' : 'left-0.5'}`} style={{ left: batchMode ? '22px' : '2px' }} />
                    </button>
                </div>
            )}

            {/* Batch Progress */}
            {batchProgress && (
                <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-primary)] font-semibold">Processing {batchProgress.current}/{batchProgress.total}</span>
                        {batchProgress.current === batchProgress.total && (
                            <span className="text-[#30D158] font-semibold">Complete</span>
                        )}
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        />
                    </div>
                    {batchProgress.results.length > 0 && batchProgress.current === batchProgress.total && (
                        <div className="grid grid-cols-3 gap-1.5 mt-2">
                            {batchProgress.results.map((img, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => onNewImage(img)}
                                    className="rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all"
                                >
                                    <img src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} alt={`Result ${i + 1}`} className="w-full aspect-[4/3] object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">{error}</div>
            )}

            {/* Virtual Twilight -> Twilight Compute */}
            <Section id="twilight" icon={<Sunset size={18} />} title="Day to Dusk" subtitle="Transform daytime photos into twilight shots" isOpen={openSection === 'twilight'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Turn any daytime exterior into a stunning twilight photo with warm interior glow and golden-hour lighting.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || (!currentImage && !canBatch)}
                    onClick={() => canBatch
                        ? runBatch('twilight', (img) => virtualTwilight(img, isPro))
                        : run('twilight', async () => { const result = await virtualTwilight(currentImage!, isPro); onNewImage(result, 'twilight'); })
                    }
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'twilight' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'twilight' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Converting...'}</> : <><Sunset size={15} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Create Twilight Shot'}</>}
                </button>
            </Section>

            {/* Sky Replacement -> Atmosphere Override */}
            <Section id="sky" icon={<Cloud size={18} />} title="Sky Replacement" subtitle="Replace dull skies with beautiful ones" isOpen={openSection === 'sky'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">Swap out overcast or dull skies with a beautiful replacement. Choose from four presets below.</p>
                <div className="grid grid-cols-2 gap-2">
                    {(['blue', 'dramatic', 'golden', 'stormy'] as SkyStyle[]).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSkyStyle(s)}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-all capitalize ${skyStyle === s ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'border-[var(--color-border-strong)] bg-black/40 text-[var(--color-text)] hover:bg-black hover:border-[var(--color-primary)]/40'}`}
                        >
                            {s === 'blue' && '☀️ '}
                            {s === 'dramatic' && '🌩️ '}
                            {s === 'golden' && '🌅 '}
                            {s === 'stormy' && '⛅ '}
                            {s.charAt(0).toUpperCase() + s.slice(1)} Sky
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    disabled={loading !== null || (!currentImage && !canBatch)}
                    onClick={() => canBatch
                        ? runBatch('sky', (img) => replaceSky(img, skyStyle, isPro))
                        : run('sky', async () => { const result = await replaceSky(currentImage!, skyStyle, isPro); onNewImage(result, 'sky'); })
                    }
                    className={`mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'sky' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'sky' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Replacing sky...'}</> : <><Cloud size={15} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Replace Sky'}</>}
                </button>
            </Section>

            {/* Instant Declutter -> Data Scrub */}
            <Section id="declutter" icon={<Trash2 size={18} />} title="Smart Cleanup" subtitle="Remove clutter and personal items automatically" isOpen={openSection === 'declutter'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Automatically remove personal items, clutter, and distractions to present a clean, show-ready space.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || (!currentImage && !canBatch)}
                    onClick={() => canBatch
                        ? runBatch('declutter', (img) => instantDeclutter(img, selectedRoom, isPro))
                        : run('declutter', async () => { const result = await instantDeclutter(currentImage!, selectedRoom, isPro); onNewImage(result, 'cleanup'); })
                    }
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'declutter' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'declutter' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Cleaning up...'}</> : <><Trash2 size={15} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Remove Clutter'}</>}
                </button>
            </Section>

            {/* Virtual Renovation -> Matter Reconstitution */}
            <Section id="renovation" icon={<Hammer size={18} />} title="Virtual Renovation" subtitle="Preview new finishes and materials" isOpen={openSection === 'renovation'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">Preview new cabinets, countertops, flooring, and wall colors on your listing photos before any work is done.</p>
                <div className="space-y-3 mb-3">
                    {[
                        { label: 'Cabinets', value: cabinets, set: setCabinets, placeholder: 'e.g. white shaker with brushed nickel' },
                        { label: 'Countertops', value: countertops, set: setCountertops, placeholder: 'e.g. Calacatta marble waterfall' },
                        { label: 'Flooring', value: flooring, set: setFlooring, placeholder: 'e.g. wide plank white oak' },
                        { label: 'Wall Color', value: walls, set: setWalls, placeholder: 'e.g. Benjamin Moore Simply White' },
                    ].map(({ label, value, set, placeholder }) => (
                        <div key={label}>
                            <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-primary)]/80">{label}</label>
                            <input
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                placeholder={placeholder}
                                className="mt-1 w-full rounded-xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2.5 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-text)]/30 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono"
                            />
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    disabled={loading !== null || ((!currentImage && !canBatch) || (!cabinets && !countertops && !flooring && !walls))}
                    onClick={() => canBatch
                        ? runBatch('renovation', (img) => virtualRenovation(img, { cabinets, countertops, flooring, walls }))
                        : run('renovation', async () => { const result = await virtualRenovation(currentImage!, { cabinets, countertops, flooring, walls }); onNewImage(result, 'renovation'); })
                    }
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'renovation' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'renovation' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Renovating...'}</> : <><Hammer size={15} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Preview Renovation'}</>}
                </button>
            </Section>

            {/* Listing Copy AI — unified with property details + tones */}
            <Section id="listing" icon={<FileText size={18} />} title="Listing Copy" subtitle="MLS descriptions, social captions & hashtags" isOpen={openSection === 'listing'} onToggle={toggleSection}>
                {/* Property Details (collapsible) */}
                <button
                    type="button"
                    onClick={() => setShowPropertyDetails(!showPropertyDetails)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold text-[var(--color-text)]/70 uppercase tracking-wider"
                >
                    Property Details (optional)
                    {showPropertyDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showPropertyDetails && (
                    <div className="space-y-2">
                        <input
                            value={propertyAddress}
                            onChange={(e) => setPropertyAddress(e.target.value)}
                            placeholder="Property address"
                            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2 text-sm text-white placeholder:text-[var(--color-text)]/30 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { value: propertyBeds, set: setPropertyBeds, placeholder: 'Beds', type: 'number' },
                                { value: propertyBaths, set: setPropertyBaths, placeholder: 'Baths', type: 'number' },
                                { value: propertySqft, set: setPropertySqft, placeholder: 'Sq Ft', type: 'number' },
                                { value: propertyPrice, set: setPropertyPrice, placeholder: 'Price', type: 'number' },
                            ].map(({ value, set, placeholder, type }) => (
                                <input
                                    key={placeholder}
                                    value={value}
                                    onChange={(e) => set(e.target.value)}
                                    placeholder={placeholder}
                                    type={type}
                                    className="w-full rounded-xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2 text-sm text-white placeholder:text-[var(--color-text)]/30 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Tone Tabs */}
                <div className="flex gap-1.5">
                    {TONE_OPTIONS.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setListingTone(t.key)}
                            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                                listingTone === t.key
                                    ? 'bg-black/80 border border-[var(--color-primary)] text-white'
                                    : 'bg-black/40 border border-[var(--color-border-strong)] text-[var(--color-text)]/60 hover:text-white'
                            }`}
                        >
                            <span style={listingTone === t.key ? { color: t.color } : {}}>{t.label}</span>
                        </button>
                    ))}
                </div>

                {/* Generate Button */}
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('listing', async () => {
                        const details = (propertyAddress || propertyBeds || propertyBaths || propertySqft || propertyPrice) ? {
                            address: propertyAddress || undefined,
                            beds: propertyBeds ? Number(propertyBeds) : undefined,
                            baths: propertyBaths ? Number(propertyBaths) : undefined,
                            sqft: propertySqft ? Number(propertySqft) : undefined,
                            price: propertyPrice ? Number(propertyPrice) : undefined,
                        } : undefined;
                        const result = await generateListingCopy(currentImage!, selectedRoom, {
                            propertyDetails: details,
                            tone: listingTone,
                        });
                        setListingCopy(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'listing' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'listing' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Writing copy...</> : <><FileText size={15} /> Generate {TONE_OPTIONS.find(t => t.key === listingTone)?.label} Copy</>}
                </button>

                {/* Results */}
                {listingCopy && listingCopy.headline && (
                    <div className="space-y-3">
                        {[
                            { key: 'headline', label: 'MLS Headline', content: listingCopy.headline },
                            { key: 'description', label: 'Listing Description', content: listingCopy.description },
                            { key: 'social', label: 'Social Caption', content: listingCopy.socialCaption },
                        ].map(({ key, label, content }) => (
                            <div key={key} className="subtle-card rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">{label}</p>
                                    <button type="button" onClick={() => copyText(content, key)} className="text-[var(--color-primary)] hover:opacity-70 transition-opacity">
                                        {copied === key ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-sm text-[var(--color-ink)] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">{content}</p>
                                {/* Char count bars for description */}
                                {key === 'description' && (
                                    <div className="mt-2 space-y-1">
                                        {MLS_CHAR_LIMITS.map(({ name, limit, color }) => {
                                            const charCount = content.length;
                                            const pct = Math.min((charCount / limit) * 100, 100);
                                            const over = charCount > limit;
                                            return (
                                                <div key={name} className="flex items-center gap-2">
                                                    <span className="text-[9px] text-[var(--color-text)]/50 w-16 text-right">{name}</span>
                                                    <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: over ? '#FF375F' : color }} />
                                                    </div>
                                                    <span className={`text-[9px] w-14 ${over ? 'text-[#FF375F] font-medium' : 'text-[var(--color-text)]/50'}`}>
                                                        {charCount.toLocaleString()}/{limit.toLocaleString()}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                        {listingCopy.hashtags.length > 0 && (
                            <div className="subtle-card rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">Hashtags</p>
                                    <button type="button" onClick={() => copyText(listingCopy.hashtags.map(h => `#${h}`).join(' '), 'hashtags')} className="text-[var(--color-primary)] hover:opacity-70">
                                        {copied === 'hashtags' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-sm text-[var(--color-accent)] leading-relaxed">{listingCopy.hashtags.map(h => `#${h}`).join(' ')}</p>
                            </div>
                        )}
                    </div>
                )}
            </Section>
        </div>
    );
};

export default SpecialModesPanel;
