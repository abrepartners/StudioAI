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
}

type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'stormy';

type SectionId = 'twilight' | 'sky' | 'declutter' | 'renovation' | 'listing';

const SpecialModesPanel: React.FC<SpecialModesPanelProps> = ({
    originalImage,
    generatedImage,
    selectedRoom,
    onNewImage,
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
            setError(e?.message || 'Something went wrong. Try again.');
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
            <div className="premium-surface rounded-3xl overflow-hidden">
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

            {/* Virtual Twilight */}
            <Section id="twilight" icon={<Sunset size={18} />} title="Virtual Twilight" subtitle="Day → dusk with lit windows & warm lighting">
                <p className="text-sm text-[var(--color-text)]/80">
                    Converts any daytime exterior photo into a stunning golden-hour twilight shot — lit windows, glowing porch lights, dramatic sky.
                    BoxBrownie charges $24/image for this. You get it instantly.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('twilight', async () => {
                        const result = await virtualTwilight(currentImage!);
                        onNewImage(result);
                    })}
                    className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {loading === 'twilight' ? <><Loader2 size={15} className="animate-spin" /> Converting to Twilight...</> : <><Sunset size={15} /> Generate Twilight Shot</>}
                </button>
            </Section>

            {/* Sky Replacement */}
            <Section id="sky" icon={<Cloud size={18} />} title="Sky Replacement" subtitle="Swap dull grey skies for stunning alternatives">
                <p className="text-sm text-[var(--color-text)]/80">Replace a plain or overcast sky with a photorealistic alternative. Perfect for exterior shots taken on cloudy days.</p>
                <div className="grid grid-cols-2 gap-2">
                    {(['blue', 'dramatic', 'golden', 'stormy'] as SkyStyle[]).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSkyStyle(s)}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-all capitalize ${skyStyle === s ? 'border-[var(--color-accent)] bg-sky-50' : 'border-[var(--color-border)] bg-white/80'}`}
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
                    className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {loading === 'sky' ? <><Loader2 size={15} className="animate-spin" /> Replacing Sky...</> : <><Cloud size={15} /> Replace Sky</>}
                </button>
            </Section>

            {/* Instant Declutter */}
            <Section id="declutter" icon={<Trash2 size={18} />} title="Instant Declutter" subtitle="One click to remove all personal items">
                <p className="text-sm text-[var(--color-text)]/80">
                    AI automatically identifies and removes personal clutter — family photos, toys, pet items, counter mess — revealing a clean, photo-ready space. No masking required.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('declutter', async () => {
                        const result = await instantDeclutter(currentImage!, selectedRoom);
                        onNewImage(result);
                    })}
                    className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {loading === 'declutter' ? <><Loader2 size={15} className="animate-spin" /> Decluttering...</> : <><Trash2 size={15} /> Declutter This Room</>}
                </button>
            </Section>

            {/* Virtual Renovation */}
            <Section id="renovation" icon={<Hammer size={18} />} title="Virtual Renovation" subtitle="Preview new cabinets, floors, counters & more">
                <p className="text-sm text-[var(--color-text)]/80">Show buyers what this space could look like after renovation. Fill in only the fields you want to change.</p>
                <div className="space-y-2">
                    {[
                        { label: 'New Cabinets', value: cabinets, set: setCabinets, placeholder: 'e.g. white shaker with brushed nickel pulls' },
                        { label: 'Countertops', value: countertops, set: setCountertops, placeholder: 'e.g. Calacatta marble with waterfall edge' },
                        { label: 'Flooring', value: flooring, set: setFlooring, placeholder: 'e.g. wide plank white oak hardwood' },
                        { label: 'Wall Color', value: walls, set: setWalls, placeholder: 'e.g. Benjamin Moore Simply White' },
                    ].map(({ label, value, set, placeholder }) => (
                        <div key={label}>
                            <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text)]/70">{label}</label>
                            <input
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                placeholder={placeholder}
                                className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white/90 px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/40"
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
                    className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {loading === 'renovation' ? <><Loader2 size={15} className="animate-spin" /> Rendering Renovation...</> : <><Hammer size={15} /> Preview Renovation</>}
                </button>
            </Section>

            {/* Listing Copy AI */}
            <Section id="listing" icon={<FileText size={18} />} title="Listing Copy AI" subtitle="Auto-generate MLS copy from your staged photo">
                <p className="text-sm text-[var(--color-text)]/80">
                    AI analyzes your staged photo and writes conversion-ready MLS listing copy, a social media caption, and hashtags — ready to paste.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || !currentImage}
                    onClick={() => run('listing', async () => {
                        const result = await generateListingCopy(currentImage!, selectedRoom);
                        setListingCopy(result);
                    })}
                    className="cta-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {loading === 'listing' ? <><Loader2 size={15} className="animate-spin" /> Writing Copy...</> : <><FileText size={15} /> Generate Listing Copy</>}
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
