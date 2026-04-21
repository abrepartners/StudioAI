import React, { useEffect, useRef, useState } from 'react';
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
    X,
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
import { sharpenImage } from '../utils/sharpen';
import { compositeStackedEdit } from '../utils/stackComposite';
import { CLEANUP_COMPOSITE_OPTIONS, shouldSkipCompositeForTool } from '../utils/compositeProfiles';
import { shouldPromptNonStackable } from '../utils/nonStackableTools';
import NonStackableConfirm from './NonStackableConfirm';
import PanelHeader from './PanelHeader';
import { Badge, Button } from './ui';
import {
    buildCleanupSignal,
    cleanupRiskFromQualityScore,
    type CleanupQualitySignal,
} from '../src/types/cleanupQuality';
import { trackCleanupRisk } from '../src/lib/analytics';
import { scoreListingImage } from '../services/qualityScoreService';

// Post-process a Pro AI Tool's raw Gemini output:
//   1. Sharpen (PNG when chain is on — no JPEG spiral on further stacking)
//   2. If we have a prior image, composite so regions Gemini didn't meaningfully
//      change come BYTE-IDENTICAL from the prior buffer. This is the Phase C
//      compositor applied to Pro AI Tools — helps a LOT for Cleanup /
//      Renovation (local edits). Twilight/Sky skip compositing because broad
//      lighting edits can produce blend/overlay artifacts.
//   3. On any failure, fall back to the sharpened Gemini output so the user
//      still sees something reasonable.
async function postProcessToolOutput(
    raw: string,
    prior: string | null,
    mode: 'twilight' | 'sky' | 'cleanup' | 'renovation' | 'stage' = 'stage',
    compositeOpts?: { threshold?: number; dilatePx?: number; featherPx?: number }
): Promise<string> {
    const chainEnabled = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('chain') !== '0'
        : true;
    const fmt: 'png' | 'jpeg' = chainEnabled ? 'png' : 'jpeg';
    const sharpened = await sharpenImage(raw, 0.4, 1, fmt);
    if (!prior || shouldSkipCompositeForTool(mode)) return sharpened;
    const mergedCompositeOpts = mode === 'cleanup'
        ? { ...CLEANUP_COMPOSITE_OPTIONS, ...compositeOpts }
        : compositeOpts;
    try {
        return await compositeStackedEdit(prior, sharpened, { format: fmt, ...mergedCompositeOpts });
    } catch (err) {
        console.warn('[SpecialModesPanel] composite failed, using raw sharpened output:', err);
        return sharpened;
    }
}

// Renovation-tuned composite: far more permissive so large material swaps
// (walls, backsplash, floors) survive the mask. Default 0.15 is calibrated for
// cleanup where clutter removal creates high-contrast local diffs. Renovation
// often creates LOW-contrast whole-plane diffs (blue-gray walls → warm gray),
// which the cleanup threshold silently filters out. Scenarios R01 + R06 both
// required dropping to 0.03 before the painted wall / new backsplash survived.
const RENOVATION_COMPOSITE = { threshold: 0.03, dilatePx: 8, featherPx: 12 } as const;

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
    /** Bubbles the active tool name up so App.tsx can render its full-screen
        overlay matching the standard generate flow. null when idle. */
    onLoadingChange?: (tool: SectionId | null) => void;
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
    onLoadingChange,
}) => {
    const [loading, setLoading] = useState<SectionId | null>(null);
    // Bubble loading state up so App.tsx's global generation overlay covers
    // Pro AI Tools too — previously tools showed only a button spinner.
    const onLoadingChangeRef = useRef(onLoadingChange);
    onLoadingChangeRef.current = onLoadingChange;
    useEffect(() => { onLoadingChangeRef.current?.(loading); }, [loading]);
    const [openSection, setOpenSection] = useState<SectionId | null>(null);
    const [error, setError] = useState<string>('');
    // R11: retry handle for the last failed tool run. Cleared on success and
    // on user-initiated cancel. Populated in the catch block of `run`.
    const [retryFn, setRetryFn] = useState<(() => void) | null>(null);
    // When the user clicks Remove Clutter and already has AI-edited state
    // on screen, we pause and confirm. `pendingCleanup` holds the in-flight
    // callback that will actually start the run after confirm.
    const [pendingCleanup, setPendingCleanup] = useState<null | (() => void)>(null);
    // F9: AbortController for the currently-running Pro AI tool.
    const activeAbortRef = useRef<AbortController | null>(null);

    // Batch mode
    const [batchMode, setBatchMode] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: string[] } | null>(null);
    const [declutterSignal, setDeclutterSignal] = useState<CleanupQualitySignal | null>(null);
    const declutterAuditRef = useRef(0);

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

    // Timeout wrapper for AI generation calls
    const withTimeout = <T,>(promise: Promise<T>, ms: number, message = 'Generation timed out'): Promise<T> => {
        return Promise.race([
            promise,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
        ]);
    };

    const run = async (id: SectionId, fn: (signal: AbortSignal) => Promise<void>) => {
        if (!currentImage) { setError('Upload a photo first, then open this tool.'); setRetryFn(null); return; }
        // F9: reset any stale controller, then attach a fresh one to this run.
        activeAbortRef.current?.abort();
        const controller = new AbortController();
        activeAbortRef.current = controller;
        setLoading(id);
        setError('');
        setRetryFn(null);
        try {
            await withTimeout(fn(controller.signal), 120000, 'Processing timed out — please try again');
        } catch (e: any) {
            if (e.message === 'ABORTED' || e.name === 'AbortError' || controller.signal.aborted) {
                setError('Cancelled.');
                setRetryFn(null);
            } else if (e.message === 'API_KEY_REQUIRED') {
                onRequireKey();
            } else if (e.message?.includes('timed out')) {
                // R11: probable cause + next step + inline Retry.
                setError("This one's taking longer than usual — usually a busy-scene problem. Try a tighter crop or retry.");
                setRetryFn(() => () => run(id, fn));
            } else {
                setError(e?.message || "Didn't finish — usually a connection hiccup. Retry should do it.");
                setRetryFn(() => () => run(id, fn));
            }
        } finally {
            setLoading(null);
            if (activeAbortRef.current === controller) activeAbortRef.current = null;
        }
    };

    // F9: Cancel the currently-running Pro AI tool.
    const cancelCurrent = () => {
        activeAbortRef.current?.abort();
    };

    const copyText = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    const toggleSection = (id: SectionId) => setOpenSection(prev => prev === id ? null : id);

    const batchImages = savedStages.map(s => s.generatedImage || s.originalImage);
    const canBatch = batchMode && batchImages.length > 0;

    const runBatch = async (id: SectionId, processFn: (img: string, signal: AbortSignal) => Promise<string>) => {
        if (!canBatch) return;
        // F9: one controller covers the whole batch.
        activeAbortRef.current?.abort();
        const controller = new AbortController();
        activeAbortRef.current = controller;
        setLoading(id);
        setError('');
        setBatchProgress({ current: 0, total: batchImages.length, results: [] });
        try {
            const results: string[] = [];
            for (let i = 0; i < batchImages.length; i++) {
                if (controller.signal.aborted) throw new Error('ABORTED');
                setBatchProgress({ current: i + 1, total: batchImages.length, results });
                const raw = await withTimeout(
                    processFn(batchImages[i], controller.signal),
                    120000,
                    `Image ${i + 1} timed out — please try again`
                );
                // For batch, the "prior" is the input image (pre-tool state).
                const mode: 'twilight' | 'sky' | 'cleanup' | 'renovation' | 'stage' =
                    id === 'declutter'
                        ? 'cleanup'
                        : (id === 'twilight' || id === 'sky' || id === 'renovation')
                            ? id
                            : 'stage';
                const result = await postProcessToolOutput(raw, batchImages[i], mode);
                results.push(result);
            }
            setBatchProgress({ current: batchImages.length, total: batchImages.length, results });
            // Apply the first result to the canvas
            if (results.length > 0) onNewImage(results[0]);
        } catch (e: any) {
            if (e.message === 'ABORTED' || e.name === 'AbortError' || controller.signal.aborted) {
                setError('Cancelled.');
            } else if (e.message === 'API_KEY_REQUIRED') {
                onRequireKey();
            } else if (e.message?.includes('timed out')) {
                setError(e.message);
            } else {
                setError(e?.message || 'Batch processing failed.');
            }
        } finally {
            setLoading(null);
            if (activeAbortRef.current === controller) activeAbortRef.current = null;
        }
    };

    return (
        <div className="space-y-2 sm:space-y-3">
            <div className="px-1">
                <PanelHeader title="Pro AI Tools" subtitle="Special Modes" />
                <p className="text-xs text-[var(--color-text)]/75 mt-1 hidden sm:block">Tools that go past basic staging — dusk, skies, cleanup, renovation previews, and listing copy.</p>
            </div>

            {/* Batch Mode Toggle */}
            {savedStages.length > 1 && (
                <div className="flex items-center justify-between px-1">
                    <div>
                        <p className="text-xs font-semibold text-[var(--color-text)]/80">Batch Mode</p>
                        <p className="text-xs text-[var(--color-text)]/50">Apply edits to all {savedStages.length} saved images</p>
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
                                    <img src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} alt={`Result ${i + 1}`} className="w-full aspect-[4/3] object-cover" loading="lazy" decoding="async" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-start justify-between gap-3">
                    <span className="flex-1 leading-snug">{error}</span>
                    {retryFn && (
                        <button
                            type="button"
                            onClick={() => { const fn = retryFn; setRetryFn(null); fn?.(); }}
                            className="shrink-0 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider bg-rose-900 text-white hover:opacity-90 active:scale-95 transition-all"
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            {/* F9: Cancel button — visible only while a Pro AI tool is running. */}
            {loading !== null && (
                <div className="flex items-center justify-between rounded-2xl border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-3 py-2">
                    <Badge tone="danger">Running</Badge>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={cancelCurrent}
                        leftIcon={<X size={12} />}
                        aria-label="Cancel generation"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {/* Virtual Twilight -> Twilight Compute */}
            <Section id="twilight" icon={<Sunset size={18} />} title="Day to Dusk" subtitle="Turn daytime exteriors into twilight shots" isOpen={openSection === 'twilight'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Convert any daytime exterior into a twilight shot with warm interior glow and golden-hour light — the #1 photographer trick for sell-faster listings.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || (!currentImage && !canBatch)}
                    onClick={() => canBatch
                        ? runBatch('twilight', (img, signal) => virtualTwilight(img, isPro, signal))
                        : run('twilight', async (signal) => { const result = await postProcessToolOutput(await virtualTwilight(currentImage!, isPro, signal), currentImage, 'twilight'); onNewImage(result, 'twilight'); })
                    }
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'twilight' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20 flex items-center justify-center gap-2 [&_svg]:text-[var(--color-primary)]'}`}
                >
                    {loading === 'twilight' ? <><Loader2 size={16} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Converting...'}</> : <><Sunset size={16} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Create Twilight Shot'}</>}
                </button>
            </Section>

            {/* Sky Replacement -> Atmosphere Override */}
            <Section id="sky" icon={<Cloud size={18} />} title="Sky Replacement" subtitle="Swap dull skies for a cleaner one" isOpen={openSection === 'sky'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">Swap overcast or blown-out skies for blue, dramatic, golden-hour, or stormy. Pick a preset below.</p>
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
                        ? runBatch('sky', (img, signal) => replaceSky(img, skyStyle, isPro, signal))
                        : run('sky', async (signal) => { const result = await postProcessToolOutput(await replaceSky(currentImage!, skyStyle, isPro, signal), currentImage, 'sky'); onNewImage(result, 'sky'); })
                    }
                    className={`mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'sky' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20 flex items-center justify-center gap-2 [&_svg]:text-[var(--color-primary)]'}`}
                >
                    {loading === 'sky' ? <><Loader2 size={16} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Replacing sky...'}</> : <><Cloud size={16} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Replace Sky'}</>}
                </button>
            </Section>

            {/* Instant Declutter -> Data Scrub */}
            <Section id="declutter" icon={<Trash2 size={18} />} title="Smart Cleanup" subtitle="Clear clutter and personal items" isOpen={openSection === 'declutter'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">
                    Remove personal items, clutter, and distractions so buyers see the room, not the seller's stuff.
                </p>
                <button
                    type="button"
                    disabled={loading !== null || (!currentImage && !canBatch)}
                    onClick={() => {
                        if (canBatch) {
                            runBatch('declutter', (img, signal) => instantDeclutter(img, selectedRoom, isPro, signal));
                        } else {
                            const doCleanup = () => run('declutter', async (signal) => {
                                // Use originalImage if non-stackable gate triggered, else currentImage.
                                const input = shouldPromptNonStackable('cleanup', currentImage, originalImage)
                                    ? originalImage!
                                    : currentImage!;
                                setDeclutterSignal(buildCleanupSignal({
                                    risk: 'review',
                                    source: 'single',
                                    reason: 'Cleanup is running quality checks.',
                                    compositeMode: 'not_applicable',
                                    nextActions: ['Review boundaries after generation'],
                                }));
                                try {
                                    const result = await postProcessToolOutput(await instantDeclutter(input, selectedRoom, isPro, signal), input, 'cleanup');
                                    onNewImage(result, 'cleanup');
                                    const auditToken = ++declutterAuditRef.current;
                                    setDeclutterSignal(buildCleanupSignal({
                                        risk: 'review',
                                        source: 'single',
                                        reason: 'Cleanup completed. Running quality audit.',
                                        compositeMode: 'applied',
                                        nextActions: ['Review boundaries while quality audit runs'],
                                    }));
                                    try {
                                        const score = await withTimeout(
                                            scoreListingImage(result, selectedRoom),
                                            18000,
                                            'Cleanup quality scoring timed out'
                                        );
                                        if (auditToken !== declutterAuditRef.current) return;
                                        const resolvedRisk = cleanupRiskFromQualityScore(score.overall) ?? 'review';
                                        const resolvedSignal = buildCleanupSignal({
                                            risk: resolvedRisk,
                                            source: 'single',
                                            qualityScore: score.overall,
                                            reason:
                                                resolvedRisk === 'safe'
                                                    ? `Cleanup passed checks (quality ${score.overall.toFixed(1)}/10).`
                                                    : resolvedRisk === 'high'
                                                        ? `Cleanup shows high artifact risk (quality ${score.overall.toFixed(1)}/10).`
                                                        : `Cleanup needs review before export (quality ${score.overall.toFixed(1)}/10).`,
                                            compositeMode: 'applied',
                                            nextActions:
                                                resolvedRisk === 'safe'
                                                    ? ['Export when ready']
                                                    : ['Inspect edges before export', 'Retry tighter cleanup scope'],
                                        });
                                        setDeclutterSignal(resolvedSignal);
                                        trackCleanupRisk(resolvedSignal.risk, {
                                            source: 'pro-tools',
                                            qualityScore: score.overall,
                                        });
                                    } catch (scoreErr) {
                                        console.warn('[SpecialModesPanel] Cleanup quality scoring skipped:', scoreErr);
                                        if (auditToken !== declutterAuditRef.current) return;
                                        const review = buildCleanupSignal({
                                            risk: 'review',
                                            source: 'single',
                                            reason: 'Cleanup completed but quality scoring was unavailable.',
                                            compositeMode: 'applied',
                                            nextActions: ['Inspect edges before export', 'Retry if ghosting persists'],
                                        });
                                        setDeclutterSignal(review);
                                        trackCleanupRisk(review.risk, { source: 'pro-tools' });
                                    }
                                } catch (err) {
                                    const high = buildCleanupSignal({
                                        risk: 'high',
                                        source: 'single',
                                        reason: 'Cleanup failed in Pro Tools.',
                                        compositeMode: 'not_applicable',
                                        nextActions: ['Retry cleanup', 'Use smaller edit scope'],
                                    });
                                    setDeclutterSignal(high);
                                    trackCleanupRisk(high.risk, { source: 'pro-tools' });
                                    throw err;
                                }
                            });
                            if (shouldPromptNonStackable('cleanup', currentImage, originalImage)) {
                                setPendingCleanup(() => doCleanup);
                            } else {
                                doCleanup();
                            }
                        }
                    }}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'declutter' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20 flex items-center justify-center gap-2 [&_svg]:text-[var(--color-primary)]'}`}
                >
                    {loading === 'declutter' ? <><Loader2 size={16} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Cleaning up...'}</> : <><Trash2 size={16} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Remove Clutter'}</>}
                </button>
                {declutterSignal && (
                    <div className={`mt-3 rounded-xl border px-3 py-2 ${
                        declutterSignal.risk === 'safe'
                            ? 'border-[#30D158]/35 bg-[#30D158]/10'
                            : declutterSignal.risk === 'high'
                                ? 'border-[#FF375F]/35 bg-[#FF375F]/10'
                                : 'border-[#FF9F0A]/35 bg-[#FF9F0A]/10'
                    }`}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white">
                            Cleanup confidence: {declutterSignal.risk}
                        </p>
                        <p className="text-xs text-zinc-300 mt-1">{declutterSignal.reason}</p>
                        {typeof declutterSignal.qualityScore === 'number' && (
                            <p className="text-2xs text-zinc-400 mt-1">
                                Quality score: {declutterSignal.qualityScore.toFixed(1)}/10
                            </p>
                        )}
                    </div>
                )}
            </Section>

            {/* Virtual Renovation -> Matter Reconstitution */}
            <Section id="renovation" icon={<Hammer size={18} />} title="Virtual Renovation" subtitle="Preview finishes before the work" isOpen={openSection === 'renovation'} onToggle={toggleSection}>
                <p className="text-sm text-[var(--color-text)]/80 mb-3">Preview new cabinets, countertops, flooring, and wall colors on the listing photo before a contractor picks up a hammer.</p>
                <div className="space-y-3 mb-3">
                    {[
                        { label: 'Cabinets', value: cabinets, set: setCabinets, placeholder: 'e.g. white shaker with brushed nickel' },
                        { label: 'Countertops', value: countertops, set: setCountertops, placeholder: 'e.g. Calacatta marble waterfall' },
                        { label: 'Flooring', value: flooring, set: setFlooring, placeholder: 'e.g. wide plank white oak' },
                        { label: 'Wall Color', value: walls, set: setWalls, placeholder: 'e.g. Benjamin Moore Simply White' },
                    ].map(({ label, value, set, placeholder }) => (
                        <div key={label}>
                            <label className="text-xs font-mono uppercase tracking-[0.14em] text-[var(--color-primary)]/80">{label}</label>
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
                        ? runBatch('renovation', (img, signal) => virtualRenovation(img, { cabinets, countertops, flooring, walls }, signal))
                        : run('renovation', async (signal) => { const result = await postProcessToolOutput(await virtualRenovation(currentImage!, { cabinets, countertops, flooring, walls }, signal), currentImage, 'renovation', RENOVATION_COMPOSITE); onNewImage(result, 'renovation'); })
                    }
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'renovation' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20 flex items-center justify-center gap-2 [&_svg]:text-[var(--color-primary)]'}`}
                >
                    {loading === 'renovation' ? <><Loader2 size={16} className="animate-spin text-[var(--color-primary)]" /> {canBatch ? 'Processing batch...' : 'Renovating...'}</> : <><Hammer size={16} /> {canBatch ? `Apply to All (${batchImages.length})` : 'Preview Renovation'}</>}
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
                    onClick={() => run('listing', async (signal) => {
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
                            abortSignal: signal,
                        });
                        setListingCopy(result);
                    })}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all ${loading === 'listing' ? 'bg-[var(--color-bg-deep)] text-[var(--color-text)] border border-[var(--color-border)]' : 'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20 flex items-center justify-center gap-2 [&_svg]:text-[var(--color-primary)]'}`}
                >
                    {loading === 'listing' ? <><Loader2 size={16} className="animate-spin text-[var(--color-primary)]" /> Writing copy...</> : <><FileText size={16} /> Generate {TONE_OPTIONS.find(t => t.key === listingTone)?.label} Copy</>}
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
                                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">{label}</p>
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
                                                    <span className="text-xs text-[var(--color-text)]/50 w-16 text-right">{name}</span>
                                                    <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: over ? '#FF375F' : color }} />
                                                    </div>
                                                    <span className={`text-xs w-14 ${over ? 'text-[#FF375F] font-medium' : 'text-[var(--color-text)]/50'}`}>
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
                                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text)]/70 font-semibold">Hashtags</p>
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

            <NonStackableConfirm
                open={pendingCleanup !== null}
                toolName="Smart Cleanup"
                onConfirm={() => {
                    const fn = pendingCleanup;
                    setPendingCleanup(null);
                    fn?.();
                }}
                onCancel={() => setPendingCleanup(null)}
            />
        </div>
    );
};

export default SpecialModesPanel;
