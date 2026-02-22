import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ColorAnalysis from './components/ColorAnalysis';
import BetaFeedbackForm from './components/BetaFeedbackForm';
import {
  ColorData,
  StagedFurniture,
  FurnitureRoomType,
  SavedStage,
  HistoryState,
} from './types';
import {
  RefreshCcw,
  Camera,
  Sparkles,
  Zap,
  Key,
  MessageSquare,
  History as HistoryIcon,
  Download,
  X,
  BrainCircuit,
  ChevronDown,
  Eraser,
  Undo2,
  Redo2,
  LayoutGrid,
  Copy,
  Check,
  Lock,
} from 'lucide-react';

const roomOptions: FurnitureRoomType[] = [
  'Living Room',
  'Bedroom',
  'Dining Room',
  'Office',
  'Kitchen',
  'Primary Bedroom',
  'Exterior',
];

type StageMode = 'text' | 'packs' | 'furniture';

const BETA_ACCESS_KEY = 'studioai_beta_access_code';
const DEFAULT_BETA_CODES = ['VELVET-EMBER-9Q4K', 'NORTHSTAR-GLASS-2T7M'];

const parseCodes = (raw: string | undefined) =>
  new Set(
    (raw || '')
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean)
  );

const ENV_BETA_CODES = parseCodes((import.meta as any)?.env?.VITE_BETA_ACCESS_CODES);
const ENV_PRO_CODES = parseCodes((import.meta as any)?.env?.VITE_BETA_PRO_CODES);
const PRO_UNLOCK_ALL = String((import.meta as any)?.env?.VITE_BETA_PRO_UNLOCK || '').toLowerCase() === 'true';

const buildInviteLink = (code: string) => {
  if (!code || typeof window === 'undefined') return '';
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'tools' | 'chat' | 'history' | 'cleanup'>('tools');
  const [stageMode, setStageMode] = useState<StageMode>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [hasProKey, setHasProKey] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);

  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const lastPromptRef = useRef<string>('');

  const [betaAccessCode, setBetaAccessCode] = useState('');
  const [betaInviteCode, setBetaInviteCode] = useState('');
  const [betaMessage, setBetaMessage] = useState('');
  const [betaError, setBetaError] = useState('');
  const [isBetaLoading, setIsBetaLoading] = useState(true);
  const [isActivatingBeta, setIsActivatingBeta] = useState(false);
  const [copiedField, setCopiedField] = useState<'link' | 'code' | null>(null);

  const allowedBetaCodes = useMemo(
    () => (ENV_BETA_CODES.size > 0 ? new Set(ENV_BETA_CODES) : new Set(DEFAULT_BETA_CODES)),
    []
  );

  const proUnlocked = Boolean(betaAccessCode && (PRO_UNLOCK_ALL || ENV_PRO_CODES.has(betaAccessCode)));
  const betaInviteLink = useMemo(() => buildInviteLink(betaAccessCode), [betaAccessCode]);

  useEffect(() => {
    const savedS = localStorage.getItem('realestate_ai_stages');
    if (savedS) setSavedStages(JSON.parse(savedS));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = (params.get('invite') || params.get('code') || '').trim().toUpperCase();
    if (invite) {
      setBetaInviteCode(invite);
      setBetaMessage('Invite accepted. Enter this code to access the private beta.');
    }
  }, []);

  useEffect(() => {
    setIsBetaLoading(true);
    const existing = (localStorage.getItem(BETA_ACCESS_KEY) || '').trim().toUpperCase();
    if (existing && allowedBetaCodes.has(existing)) {
      setBetaAccessCode(existing);
    } else if (existing) {
      localStorage.removeItem(BETA_ACCESS_KEY);
    }
    setIsBetaLoading(false);
  }, [allowedBetaCodes]);

  const refreshProKeyStatus = useCallback(async () => {
    const aiStudio = (window as any)?.aistudio;
    if (!aiStudio?.hasSelectedApiKey) {
      setHasProKey(false);
      return false;
    }
    try {
      const hasKey = await aiStudio.hasSelectedApiKey();
      setHasProKey(Boolean(hasKey));
      return Boolean(hasKey);
    } catch {
      setHasProKey(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (originalImage) refreshProKeyStatus();
  }, [originalImage, refreshProKeyStatus]);

  const pushToHistory = useCallback(
    (newState?: Partial<HistoryState>) => {
      const currentState: HistoryState = {
        generatedImage,
        stagedFurniture: [],
        selectedRoom,
        colors,
        ...newState,
      };

      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        if (newHistory.length >= 30) newHistory.shift();
        return [...newHistory, currentState];
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 29));
    },
    [generatedImage, selectedRoom, colors, historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    const state = history[prevIndex];

    setGeneratedImage(state.generatedImage);
    setSelectedRoom(state.selectedRoom);
    setColors(state.colors);
    setHistoryIndex(prevIndex);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];

    setGeneratedImage(state.generatedImage);
    setSelectedRoom(state.selectedRoom);
    setColors(state.colors);
    setHistoryIndex(nextIndex);
  }, [history, historyIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleImageUpload = async (base64: string) => {
    setOriginalImage(base64);
    setGeneratedImage(null);
    setMaskImage(null);
    setColors([]);
    setDetectedRoom(null);
    setHistory([]);
    setHistoryIndex(-1);
    setIsAnalyzing(true);
    setStageMode('text');

    try {
      const [colorData, roomType] = await Promise.all([analyzeRoomColors(base64), detectRoomType(base64)]);
      setColors(colorData);
      setDetectedRoom(roomType);
      setSelectedRoom(roomType);

      const initialState: HistoryState = {
        generatedImage: null,
        stagedFurniture: [],
        selectedRoom: roomType,
        colors: colorData,
      };
      setHistory([initialState]);
      setHistoryIndex(0);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApiKeySelection = async () => {
    const aiStudio = (window as any)?.aistudio;
    if (!aiStudio?.openSelectKey) {
      alert('API key selector is unavailable in this environment. Set GEMINI_API_KEY for local use.');
      return;
    }
    await aiStudio.openSelectKey();
    await refreshProKeyStatus();
    setShowKeyPrompt(false);
  };

  const handleGenerate = async (prompt: string, highRes = false) => {
    if (!originalImage) return;

    if (highRes && !proUnlocked) {
      alert('High-resolution enhancement is locked for this beta access code.');
      return;
    }

    if (highRes) {
      const hasKey = hasProKey || (await refreshProKeyStatus());
      if (!hasKey) {
        setShowKeyPrompt(true);
        return;
      }
      setIsEnhancing(true);
      setShowProConfirm(false);
    } else {
      setIsGenerating(true);
    }

    try {
      lastPromptRef.current = prompt;

      const sourceImage = activePanel === 'cleanup' && generatedImage ? generatedImage : originalImage;
      const resultImage = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, highRes);
      const newColors = await analyzeRoomColors(resultImage);

      setGeneratedImage(resultImage);
      setColors(newColors);
      setMaskImage(null);

      const generatedState: HistoryState = {
        generatedImage: resultImage,
        stagedFurniture: [],
        selectedRoom,
        colors: newColors,
      };
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        return [...newHistory, generatedState];
      });
      setHistoryIndex((prev) => prev + 1);
    } catch (error: any) {
      if (error.message === 'API_KEY_REQUIRED' || error.message?.includes('Requested entity was not found')) {
        setShowKeyPrompt(true);
      } else if (error.message?.toLowerCase().includes('api key')) {
        alert('Missing API key. Add GEMINI_API_KEY for local generation, then retry.');
      } else {
        alert('Generation failed. Check your connection.');
      }
    } finally {
      setIsGenerating(false);
      setIsEnhancing(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `studio_export_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const changeDetectedRoom = (room: FurnitureRoomType) => {
    pushToHistory();
    setDetectedRoom(room);
    setSelectedRoom(room);
    setShowRoomPicker(false);
  };

  const activateBeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!betaInviteCode.trim()) return;

    setIsActivatingBeta(true);
    setBetaError('');
    setBetaMessage('');

    try {
      const entered = betaInviteCode.trim().toUpperCase();
      if (!allowedBetaCodes.has(entered)) {
        setBetaError('That invite code is not valid.');
        return;
      }

      setBetaAccessCode(entered);
      localStorage.setItem(BETA_ACCESS_KEY, entered);
      setBetaMessage('Welcome to the private StudioAI beta.');
    } catch {
      setBetaError('Activation failed. Check your connection and retry.');
    } finally {
      setIsActivatingBeta(false);
    }
  };

  const copyValue = async (type: 'link' | 'code') => {
    if (!betaAccessCode) return;
    const value = type === 'link' ? betaInviteLink : betaAccessCode;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(type);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      setCopiedField(null);
    }
  };

  const navItems: Array<{
    id: 'tools' | 'cleanup' | 'chat' | 'history';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
    { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
    { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: false },
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={21} />, available: false },
    { id: 'history', label: 'History', icon: <HistoryIcon size={21} />, available: false },
  ];

  useEffect(() => {
    if (activePanel !== 'tools') {
      setActivePanel('tools');
    }
  }, [activePanel]);

  if (isBetaLoading) {
    return (
      <div className="studio-shell min-h-screen grid place-items-center px-4">
        <div className="premium-surface-strong rounded-[2rem] p-10 text-center max-w-md w-full">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text)]/70">StudioAI Beta</p>
          <h2 className="font-display text-3xl mt-2">Checking Access</h2>
          <p className="mt-3 text-sm text-[var(--color-text)]/80">Checking your beta access code...</p>
        </div>
      </div>
    );
  }

  if (!betaAccessCode) {
    return (
      <div className="studio-shell min-h-screen grid place-items-center px-4 py-8">
        <div className="premium-surface-strong rounded-[2rem] p-8 sm:p-10 max-w-lg w-full">
          <div className="inline-flex items-center gap-2 rounded-full cta-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
            <Sparkles size={14} /> Private Beta Access
          </div>
          <h1 className="font-display text-4xl mt-4">StudioAI</h1>
          <p className="mt-2 text-sm text-[var(--color-text)]/82">
            This beta is invite-only. Enter your invite code to join and help shape the product.
          </p>

          <form onSubmit={activateBeta} className="mt-6 space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[var(--color-text)]/72">Invite code</label>
              <input
                value={betaInviteCode}
                onChange={(e) => setBetaInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)]"
              />
            </div>
            <button
              type="submit"
              disabled={isActivatingBeta || !betaInviteCode.trim()}
              className="cta-primary rounded-xl px-4 py-3 w-full text-sm font-semibold disabled:opacity-50"
            >
              {isActivatingBeta ? 'Activating Beta Access...' : 'Enter StudioAI Beta'}
            </button>
          </form>

          {betaMessage && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">{betaMessage}</p>}
          {betaError && <p className="mt-4 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{betaError}</p>}

          <p className="mt-5 text-xs text-[var(--color-text)]/70">
            You can share your access link or code with trusted beta testers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell min-h-[100dvh] lg:h-screen overflow-x-hidden lg:overflow-hidden flex flex-col">
      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/52 backdrop-blur-sm p-4">
          <div className="premium-surface-strong w-full max-w-md rounded-[2rem] p-8 sm:p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl cta-secondary text-[var(--color-primary)]">
              <Key size={30} />
            </div>
            <h2 className="font-display text-3xl font-semibold">High-Res Rendering</h2>
            <p className="mt-2 text-sm text-[var(--color-text)]/80">
              Select a Gemini API key from a paid GCP project to enable high-resolution enhancement.
            </p>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={handleApiKeySelection}
                className="cta-primary w-full rounded-2xl py-3.5 text-sm font-semibold"
              >
                Select API Key
              </button>
              <button
                type="button"
                onClick={() => setShowKeyPrompt(false)}
                className="cta-secondary w-full rounded-2xl py-3.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProConfirm && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 backdrop-blur-sm p-4">
          <div className="premium-surface-strong w-full max-w-md rounded-[2rem] p-8">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full cta-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                  <Zap size={14} /> High-Res
                </p>
                <h3 className="font-display mt-3 text-2xl">Confirm Enhancement Pass</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProConfirm(false)}
                className="rounded-xl p-2 text-[var(--color-text)]/70 transition hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text)]/85 mb-6">
              This will trigger a high-detail enhancement render. Keep billing enabled in your connected GCP project.
            </p>
            <button
              type="button"
              onClick={() => handleGenerate(lastPromptRef.current || 'Finalize with realistic textures.', true)}
              className="cta-primary w-full rounded-2xl py-3.5 text-sm font-semibold"
            >
              Confirm and Enhance
            </button>
          </div>
        </div>
      )}

      {showAccessPanel && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 backdrop-blur-sm p-4">
          <div className="premium-surface-strong w-full max-w-md rounded-[2rem] p-8">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full cta-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                  <Copy size={14} /> Beta Access
                </p>
                <h3 className="font-display mt-3 text-2xl">Share Access</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAccessPanel(false)}
                className="rounded-xl p-2 text-[var(--color-text)]/70 transition hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text)]/82">
              Share your access link or code with trusted testers. This is outside the design workflow so the studio stays focused.
            </p>

            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs text-[var(--color-text)]/80">
              Access code: <code>{betaAccessCode}</code>
            </div>
            <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs text-[var(--color-text)]/80 break-all">
              Link: <code>{betaInviteLink}</code>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyValue('link')}
                className="cta-secondary min-h-[44px] rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {copiedField === 'link' ? <Check size={13} /> : <Copy size={13} />} Copy Access Link
              </button>
              <button
                type="button"
                onClick={() => copyValue('code')}
                className="cta-secondary min-h-[44px] rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {copiedField === 'code' ? <Check size={13} /> : <Copy size={13} />} Copy Access Code
              </button>
            </div>

            <p className="mt-4 text-xs text-[var(--color-text)]/75">
              High-res enhancement: <strong>{proUnlocked ? 'Unlocked' : 'Locked'}</strong>
            </p>
          </div>
        </div>
      )}

      <header className="shrink-0 premium-surface-strong border-b panel-divider px-4 py-3 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="cta-primary flex h-11 w-11 items-center justify-center rounded-2xl shadow-[0_10px_24px_rgba(3,105,161,0.28)]">
              <Camera size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[1.15rem] sm:text-[1.35rem] leading-none whitespace-nowrap">
                Studio<span className="text-[var(--color-primary)]">AI</span>
              </h1>
              <p className="hidden sm:block text-[11px] uppercase tracking-[0.18em] text-[var(--color-text)]/70">
                Invite-Only Beta
              </p>
            </div>
          </div>

          {originalImage && (
            <div className="hidden sm:flex items-center gap-1 rounded-full subtle-card p-1">
              <button
                type="button"
                onClick={undo}
                disabled={historyIndex <= 0 || isGenerating}
                className="rounded-full p-2 text-[var(--color-text)] transition hover:bg-white disabled:opacity-35"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={historyIndex >= history.length - 1 || isGenerating}
                className="rounded-full p-2 text-[var(--color-text)] transition hover:bg-white disabled:opacity-35"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 size={15} />
              </button>
            </div>
          )}
        </div>

        {originalImage ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="cta-secondary rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Access</span>
            </button>
            {generatedImage && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="cta-secondary rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!proUnlocked) return;
                    if (hasProKey) setShowProConfirm(true);
                    else setShowKeyPrompt(true);
                  }}
                  disabled={isEnhancing || !proUnlocked}
                  className={`rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px] disabled:opacity-55 ${
                    proUnlocked
                      ? hasProKey
                        ? 'cta-primary'
                        : 'cta-secondary'
                      : 'border border-amber-300/70 bg-amber-50 text-amber-900'
                  }`}
                >
                  {proUnlocked ? <Zap size={14} className={isEnhancing ? 'animate-pulse' : ''} /> : <Lock size={14} />}
                  <span className="hidden sm:inline">
                    {proUnlocked ? (hasProKey ? 'Enhance' : 'Enable Enhance') : 'Locked'}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setOriginalImage(null);
                setGeneratedImage(null);
                setStageMode('text');
              }}
              className="cta-secondary rounded-xl p-2 text-[var(--color-text)] min-h-[44px] min-w-[44px]"
              title="Start over"
            >
              <RefreshCcw size={17} />
            </button>
          </div>
        ) : (
          <p className="hidden md:block text-sm tracking-wide text-[var(--color-text)]/78">Upload a room and begin staging</p>
        )}
      </header>

      {!originalImage ? (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] overflow-auto">
          <section className="px-6 pb-14 pt-10 sm:px-12 lg:px-16 lg:pt-14 flex items-center">
            <div className="max-w-2xl w-full">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full cta-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                <Sparkles size={14} /> Invite-Only Staging Beta
              </div>
              <h2 className="font-display text-[clamp(2.3rem,7vw,5.3rem)] leading-[0.92] font-semibold text-[var(--color-ink)]">
                Re-stage interiors with editorial precision.
              </h2>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-[var(--color-text)]/84">
                Upload a property photo and shape conversion-ready visuals. Every beta submission directly influences weekly product updates.
              </p>

              <div className="mt-8">
                <ImageUploader onImageUpload={handleImageUpload} isAnalyzing={isAnalyzing} />
              </div>
            </div>
          </section>

          <section className="hidden lg:block relative overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1616046229478-9901c5536a45?q=80&w=1920&h=1080&fit=crop"
              alt="Styled interior reference"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(9,38,36,0.42)] via-transparent to-transparent" />
            <div className="absolute bottom-8 left-8 right-8 rounded-3xl glass-overlay p-6 text-white">
              <p className="text-xs uppercase tracking-[0.18em]">Minimal Luxury Direction</p>
              <p className="mt-2 text-xl font-display">Structure-first redesign with premium restraint.</p>
            </div>
          </section>
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex lg:flex-row overflow-hidden relative">
          <nav className="hidden lg:flex shrink-0 w-[172px] premium-surface border-r panel-divider flex-col items-center justify-start gap-2 py-5 order-1">
            <div className="px-3 pb-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text)]/65">Beta Scope</p>
              <p className="text-xs mt-1 text-[var(--color-text)]/78">Design Studio is active. Other tabs are staged for later rollout.</p>
            </div>
            {navItems.map((item) => {
              const active = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.available}
                  onClick={() => item.available && setActivePanel(item.id)}
                  title={item.available ? item.label : `${item.label} (Coming Soon)`}
                  className={`flex h-auto w-[152px] px-3 py-2.5 items-center justify-start gap-2 rounded-2xl border transition-all ${
                    active && item.available
                      ? 'cta-primary border-white/15 shadow-[0_12px_24px_rgba(3,105,161,0.3)]'
                      : item.available
                        ? 'cta-secondary border-[var(--color-border)] text-[var(--color-text)] hover:bg-white'
                        : 'border-[var(--color-border)] bg-slate-100/70 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {item.icon}
                  <span className="text-[11px] uppercase tracking-[0.14em]">{item.label}</span>
                  {!item.available && (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700/90">Soon</span>
                  )}
                </button>
              );
            })}
          </nav>

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-4 sm:p-6 lg:p-8 pb-[58vh] lg:pb-8">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="premium-surface-strong rounded-[2rem] p-2 sm:p-3">
                <div className="relative overflow-hidden rounded-[1.5rem] border panel-divider bg-[var(--color-bg-deep)] aspect-[4/3] sm:aspect-video">
                  {generatedImage ? (
                    <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
                  ) : (
                    <MaskCanvas
                      imageSrc={originalImage}
                      onMaskChange={setMaskImage}
                      isActive={false}
                    />
                  )}

                  <div className="absolute left-3 top-3 z-20">
                    <button
                      type="button"
                      onClick={() => setShowRoomPicker((prev) => !prev)}
                      className="pill-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm"
                    >
                      {detectedRoom ? (
                        <>
                          <BrainCircuit size={14} className="text-[var(--color-primary)]" />
                          <span>{selectedRoom}</span>
                          <ChevronDown size={13} className={`transition-transform ${showRoomPicker ? 'rotate-180' : ''}`} />
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                          Detecting room...
                        </span>
                      )}
                    </button>

                    {showRoomPicker && (
                      <div className="mt-2 w-52 rounded-2xl premium-surface p-2">
                        {roomOptions.map((room) => (
                          <button
                            key={room}
                            type="button"
                            onClick={() => changeDetectedRoom(room)}
                            className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-bg)]"
                          >
                            {room}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="absolute right-3 top-3 z-20 rounded-full bg-[var(--color-ink)]/76 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">
                    {isGenerating ? 'Rendering...' : 'Studio Live'}
                  </div>
                </div>
              </div>

              <div className="w-full">
                <ColorAnalysis colors={colors} isLoading={isAnalyzing} />
              </div>
            </div>
          </main>

          <aside className={`mobile-control-sheet order-3 lg:order-3 lg:w-[430px] lg:shrink-0 lg:border-l panel-divider ${sheetOpen ? 'open' : ''}`}>
            <button
              type="button"
              onClick={() => setSheetOpen((prev) => !prev)}
              className="mobile-sheet-toggle lg:hidden"
            >
              <span className="mobile-sheet-handle" />
              <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text)]/70">
                {sheetOpen ? 'Hide Controls' : 'Show Controls'}
              </span>
            </button>

            <div className="mobile-sheet-scroll scrollbar-hide">
              <div className="px-5 sm:px-6 pt-5 sm:pt-6">
                <div className="subtle-card rounded-2xl px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Quick Tutorial</p>
                  <h3 className="font-display text-xl mt-1">How To Use Studio</h3>
                  <ol className="mt-2 space-y-1 text-sm text-[var(--color-text)]/82 list-decimal pl-4">
                    <li>Choose a <strong>Mode</strong> first.</li>
                    <li>Add your direction with text or pick a style pack.</li>
                    <li>Generate and re-generate until it feels right.</li>
                    <li>Use thumbs feedback to tell us what to improve.</li>
                  </ol>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
                <RenovationControls
                  activeMode="design"
                  hasGenerated={!!generatedImage}
                  onGenerate={(p) => handleGenerate(p, false)}
                  onStageModeChange={setStageMode}
                  isGenerating={isGenerating}
                  hasMask={false}
                  selectedRoom={selectedRoom}
                />

                <BetaFeedbackForm
                  selectedRoom={selectedRoom}
                  hasGenerated={!!generatedImage}
                  stagedFurnitureCount={0}
                  stageMode={stageMode}
                  generatedImage={generatedImage}
                  betaUserId={betaAccessCode ? `access-${betaAccessCode}` : ''}
                  referralCode={betaAccessCode}
                  acceptedInvites={0}
                  insiderUnlocked={false}
                  pro2kUnlocked={proUnlocked}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default App;
