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
} from '../services/geminiService';
import { FurnitureRoomType } from '../types';

interface SpecialModesPanelProps {
    originalImage: string | null;
    generatedImage: string | null;
    selectedRoom: FurnitureRoomType;
    onNewImage: (imageBase64: string) => void;
    onRequireKey: () => void;
}

type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'stormy';

type SectionId = 'twilight' | 'sky' | 'declutter' | 'renovation' | 'listing';

const SpecialModesPanel: React.FC<SpecialModesPanelProps> = ({
    originalImage,
    generatedImage,
    selectedRoom,
    onNewImage,
    onRequireKey,
}) => {
    const [loading, setLoading] = useState<SectionId | null>(null);
    const [openSection, setOpenSection] = useState<SectionId | null>(null);
    const [error, setError] = useState<string>('');

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

    const Section = ({
        id, icon, title, subtitle, children,
    }: {
        id: SectionId; icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
    }) => {
        const open = openSection === id;
        return (
            <div className="premium-surface rounded-2xl overflow-hidden">
                <button
                    type="button"
                    onClick={() => setOpenSection(open ? null : id)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left"
                >
                    <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)] shrink-0">{icon}</div>
                    <div className="flex-1">
                        <p className="font-semibold text-sm text-[var(--color-ink)]">{title}</p>
                        <p className="text-xs text-[var(--color-text)]/70">{subtitle}</p>
                    </div>
                    {open ? <ChevronUp size={16} className="text-[var(--color-text)]/50" /> : <ChevronDown size={16} className="text-[var(--color-text)]/50" />}
                </button>
                {open && <div className="px-5 pb-5 space-y-3 border-t border-[var(--color-border)] pt-4">{children}</div>}
            </div>
        );
    };

    const RunButton = ({ id, label }: { id: SectionId; label: string }) => (
        <button
            type="button"
            disabled={loading !== null || !currentImage}
            onClick={() => {/* handled per-section */ }}
            className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
            {loading === id ? <><Loader2 size={15} className="animate-spin" /> Processing...</> : <><Sparkles size={15} /> {label}</>}
        </button>
    );

    return (
        <div className="space-y-3">
            <div className="px-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Special Modes</p>
                <h3 className="font-display text-xl mt-0.5">Pro AI Tools</h3>
                <p className="text-xs text-[var(--color-text)]/75 mt-1">Advanced tools that go beyond basic staging. These features work on uploaded photos.</p>
            </div>

            {error && (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">{error}</div>
            )}

            {/* Virtual Twilight -> Twilight Compute */}
            <Section id="twilight" icon={<Sunset size={18} />} title="Day to Dusk" subtitle="Transform daytime photos into twilight shots">
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Turn any daytime exterior into a stunning twilight photo with warm interior glow and golden-hour lighting.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('twilight', async () => {
                        const result = await virtualTwilight(currentImage!);
                        onNewImage(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'twilight' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'twilight' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Converting...</> : <><Sunset size={15} /> Create Twilight Shot</>}
                </button>
            </Section>

            {/* Sky Replacement -> Atmosphere Override */}
            <Section id="sky" icon={<Cloud size={18} />} title="Sky Replacement" subtitle="Replace dull skies with beautiful ones">
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
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('sky', async () => {
                        const result = await replaceSky(currentImage!, skyStyle);
                        onNewImage(result);
                    })}
                    className={`mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'sky' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'sky' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Replacing sky...</> : <><Cloud size={15} /> Replace Sky</>}
                </button>
            </Section>

            {/* Instant Declutter -> Data Scrub */}
            <Section id="declutter" icon={<Trash2 size={18} />} title="Smart Cleanup" subtitle="Remove clutter and personal items automatically">
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Automatically remove personal items, clutter, and distractions to present a clean, show-ready space.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('declutter', async () => {
                        const result = await instantDeclutter(currentImage!, selectedRoom);
                        onNewImage(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'declutter' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'declutter' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Cleaning up...</> : <><Trash2 size={15} /> Remove Clutter</>}
                </button>
            </Section>

            {/* Virtual Renovation -> Matter Reconstitution */}
            <Section id="renovation" icon={<Hammer size={18} />} title="Virtual Renovation" subtitle="Preview new finishes and materials">
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
                    disabled={loading !== null || !currentImage || (!cabinets && !countertops && !flooring && !walls)}
                    onClick={() => run('renovation', async () => {
                        const result = await virtualRenovation(currentImage!, { cabinets, countertops, flooring, walls });
                        onNewImage(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'renovation' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'renovation' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Renovating...</> : <><Hammer size={15} /> Preview Renovation</>}
                </button>
            </Section>

            {/* Listing Copy AI -> Language Synth */}
            <Section id="listing" icon={<FileText size={18} />} title="Listing Copy" subtitle="AI-generated MLS descriptions and social captions">
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Generate MLS descriptions, social captions, and hashtags from your listing photos automatically.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('listing', async () => {
                        const result = await generateListingCopy(currentImage!, selectedRoom);
                        setListingCopy(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'listing' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-black text-[var(--color-primary)] border border-[rgba(0,255,204,0.4)] hover:bg-[rgba(0,255,204,0.1)] hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] shadow-inner flex items-center justify-center gap-2'}`}
                >
                    {loading === 'listing' ? <><Loader2 size={15} className="animate-spin text-[var(--color-primary)]" /> Writing copy...</> : <><FileText size={15} /> Generate Listing Copy</>}
                </button>

                {listingCopy && listingCopy.headline && (
                    <div className="space-y-3">
                        {[
                            { key: 'headline', label: '📝 MLS Headline', content: listingCopy.headline },
                            { key: 'description', label: '🏠 Listing Description', content: listingCopy.description },
                            { key: 'social', label: '📱 Social Caption', content: listingCopy.socialCaption },
                        ].map(({ key, label, content }) => (
                            <div key={key} className="subtle-card rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">{label}</p>
                                    <button type="button" onClick={() => copyText(content, key)} className="text-[var(--color-primary)] hover:opacity-70 transition-opacity">
                                        {copied === key ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-sm text-[var(--color-ink)] leading-relaxed">{content}</p>
                            </div>
                        ))}
                        {listingCopy.hashtags.length > 0 && (
                            <div className="subtle-card rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">#️⃣ Hashtags</p>
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
