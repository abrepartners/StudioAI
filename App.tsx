import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
  createChatSession,
  sendMessageToChat,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ColorAnalysis from './components/ColorAnalysis';
import ChatInterface from './components/ChatInterface';
import BetaFeedbackForm from './components/BetaFeedbackForm';
import SpecialModesPanel from './components/SpecialModesPanel';
import StyleAdvisor from './components/StyleAdvisor';
import QualityScore from './components/QualityScore';
import BrandKit from './components/BrandKit';
import MLSExport from './components/MLSExport';
// ListingDescription merged into SpecialModesPanel's Listing Copy section
import ListingDashboard from './components/ListingDashboard';
import {
  ColorData,
  StagedFurniture,
  FurnitureRoomType,
  SavedStage,
  HistoryState,
  ChatMessage,
} from './types';
import { useSubscription } from './hooks/useSubscription';
import {
  RefreshCcw,
  Camera,
  Sparkles,
  CreditCard,
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
  Heart,
  LogOut,
  ArrowRight,
  Image as ImageIcon,
  Wand2,
  Shield,
  Settings,
  Crown,
} from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';

// ─── Google OAuth Types ──────────────────────────────────────────────────────
interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  sub: string; // Google user ID
}

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '114715484927-pbu0mro7f5imhbo5q77k1imqi5etc2a3.apps.googleusercontent.com';

const AUTH_STORAGE_KEY = 'studioai_google_user';

const decodeJwtPayload = (token: string): GoogleUser | null => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

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

const FEEDBACK_REQUIRED_INTERVAL = 3;

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'tools' | 'chat' | 'history' | 'cleanup' | 'listings' | 'settings'>('tools');
  const [stageMode, setStageMode] = useState<StageMode>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [showFeedbackCheckpoint, setShowFeedbackCheckpoint] = useState(false);
  const [generationsSinceFeedback, setGenerationsSinceFeedback] = useState(0);
  const [toastMessage, setToastMessage] = useState<{ icon: React.ReactNode; label: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');
  const [isMultiGen, setIsMultiGen] = useState(false);

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyTab, setHistoryTab] = useState<'recent' | 'saved'>('recent');

  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const lastPromptRef = useRef<string>('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSession, setChatSession] = useState<ReturnType<typeof createChatSession> | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // ─── Google OAuth State ──────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // ─── Subscription State ─────────────────────────────────────────────────
  const subscription = useSubscription(googleUser?.email || null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    const savedS = localStorage.getItem('realestate_ai_stages');
    if (savedS) setSavedStages(JSON.parse(savedS));
  }, []);

  // ─── Google OAuth: restore session & initialize GIS ─────────────────────
  const handleGoogleCredential = useCallback((response: any) => {
    const user = decodeJwtPayload(response.credential);
    if (user) {
      setGoogleUser(user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
    setIsAuthLoading(false);
  }, []);

  useEffect(() => {
    // Restore saved session
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      try {
        setGoogleUser(JSON.parse(saved));
      } catch { /* ignore corrupt data */ }
    }
    setIsAuthLoading(false);
  }, []);

  useEffect(() => {
    if (googleUser || !GOOGLE_CLIENT_ID) return;
    // Wait for Google Identity Services to load
    const init = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = '';
        google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 300,
        });
      }
    };
    // Script may still be loading
    if ((window as any).google?.accounts?.id) {
      init();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(interval);
          init();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [googleUser, handleGoogleCredential]);

  const handleSignOut = useCallback(() => {
    setGoogleUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    const google = (window as any).google;
    if (google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  }, []);


  const showToast = useCallback((icon: React.ReactNode, label: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ icon, label });
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);


  useEffect(() => {
    if (generationsSinceFeedback >= FEEDBACK_REQUIRED_INTERVAL) {
      setShowFeedbackCheckpoint(true);
    }
  }, [generationsSinceFeedback]);

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
    setShowFeedbackCheckpoint(false);
    setGenerationsSinceFeedback(0);

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

  const handleSamplePhoto = async () => {
    // High-quality sample interior
    const SAMPLE_IMG = "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=2000";
    setIsAnalyzing(true);
    try {
      const response = await fetch(SAMPLE_IMG);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        handleImageUpload(reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch {
      // Fallback if fetch fails
      setOriginalImage(SAMPLE_IMG);
      setGeneratedImage(null);
      setHistory([]);
      setHistoryIndex(-1);
      setStageMode('text');
      setIsAnalyzing(false);
    }
  };
  const handleGenerate = async (prompt: string) => {
    if (!originalImage) return;

    if (!subscription.canGenerate) {
      setShowUpgradeModal(true);
      return;
    }

    if (showFeedbackCheckpoint) {
      setShowFeedbackCheckpoint(true);
      return;
    }

    setIsGenerating(true);

    try {
      lastPromptRef.current = prompt;

      const sourceImage = activePanel === 'cleanup' && generatedImage ? generatedImage : originalImage;
      const count = isMultiGen ? 2 : 1;
      const resultImages = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, false, count);

      const newColors = await analyzeRoomColors(resultImages[0]);

      setGeneratedImage(resultImages[0]);
      setColors(newColors);
      setMaskImage(null);

      const newStates = resultImages.map(img => ({
        generatedImage: img,
        stagedFurniture: [],
        selectedRoom,
        colors: newColors,
      }));

      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        return [...newHistory, ...newStates];
      });
      setHistoryIndex((prev) => prev + newStates.length);
      setGenerationsSinceFeedback((prev) => prev + 1);
      subscription.recordGeneration();
    } catch (error: any) {
      if (
        error.message === 'API_KEY_REQUIRED' ||
        error.message?.includes('Requested entity was not found') ||
        error.message?.toLowerCase().includes('api key') ||
        error.message?.includes('API_KEY_INVALID')
      ) {
        alert('Service temporarily unavailable. Please try again in a moment.');
      } else {
        alert('Generation failed. Check your connection and try again.');
      }
    } finally {
      setIsGenerating(false);
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

  const handleSaveStage = () => {
    if (!generatedImage || !originalImage) return;
    const newStage: SavedStage = {
      id: crypto.randomUUID(),
      name: `Design ${new Date().toLocaleDateString()}`,
      originalImage,
      generatedImage,
      timestamp: Date.now(),
    };
    setSavedStages((prev) => {
      const updated = [newStage, ...prev];
      localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
      return updated;
    });
  };

  const changeDetectedRoom = (room: FurnitureRoomType) => {
    pushToHistory();
    setDetectedRoom(room);
    setSelectedRoom(room);
    setShowRoomPicker(false);
  };


  const handleChatMessage = async (text: string) => {
    if (!originalImage) return;
    setIsChatLoading(true);

    // Optimistically add user message
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      // Create session lazily on first use
      const session = chatSession ?? createChatSession();
      if (!chatSession) setChatSession(session);

      const currentImage = generatedImage || originalImage;
      const reply = await sendMessageToChat(session, text, currentImage);

      const modelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: reply, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, modelMsg]);

      // Detect [EDIT: prompt] pattern and auto-trigger generation
      const editMatch = reply.match(/\[EDIT:\s*(.+?)\]/i);
      if (editMatch && editMatch[1]) {
        await handleGenerate(editMatch[1]);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };



  const navItems: Array<{
    id: 'tools' | 'cleanup' | 'listings' | 'chat' | 'history' | 'settings';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
      { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
      { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: true },
      { id: 'listings', label: 'Listings', icon: <ImageIcon size={21} />, available: true },
      { id: 'chat', label: 'Chat', icon: <MessageSquare size={21} />, available: true },
      { id: 'history', label: 'History', icon: <HistoryIcon size={21} />, available: true },
      { id: 'settings', label: 'Settings', icon: <Settings size={21} />, available: true },
    ];


  // ─── Auth gate: require Google sign-in ───────────────────────────────────
  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[var(--color-bg)]">
        <div className="text-center animate-fade-in">
          <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
            <Camera size={22} className="text-white" />
          </div>
          <div className="h-1 w-24 mx-auto rounded-full bg-[var(--color-bg-deep)] overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-[var(--color-primary)] animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!googleUser) {
    return (
      <div className="min-h-[100dvh] flex bg-black">
        
        {/* Left - Hero Image */}
        <div className="hidden lg:flex lg:w-[60%] relative login-bg">
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
          <div className="relative z-10 flex flex-col justify-between p-16 w-full">
            <div>
              <h1 className="font-display text-4xl font-black tracking-tight text-white drop-shadow-md">
                Studio<span className="text-[var(--color-primary)]">AI</span>
              </h1>
            </div>
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.3em] font-bold text-[var(--color-primary)] mb-4">The Future of Real Estate</p>
              <h2 className="text-5xl xl:text-7xl font-display font-black leading-[1.05] text-white tracking-tighter mb-6 drop-shadow-lg">
                Design, Elevated..
              </h2>
              <p className="text-lg leading-relaxed text-zinc-300 font-medium max-w-xl">
                Professional virtual staging, instant renovation previews, and photo-realistic results. 
              </p>
            </div>
            <div className="flex items-center gap-8 text-sm font-semibold text-zinc-400">
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-md"/> AI Staging</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-md delay-75"/> Smart Cleanup</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-md delay-150"/> Secure</span>
            </div>
          </div>
        </div>

        {/* Right - Sign In */}
        <div className="flex-1 flex items-center justify-center p-8 bg-black">
          <div className="w-full max-w-md login-glass p-10 rounded-3xl border border-[var(--color-border-strong)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"></div>
            
            <div className="lg:hidden mb-12 flex flex-col items-center text-center">
              <div className="h-16 w-16 mb-6 rounded-2xl flex items-center justify-center bg-black border border-[var(--color-primary-dark)] shadow-lg">
                <Camera size={28} className="text-[var(--color-primary)]" />
              </div>
              <h1 className="font-display text-4xl font-black text-white tracking-tight">
                Studio<span className="text-[var(--color-primary)]" style={{ textShadow: '0 0 20px rgba(10,132,255,0.5)' }}>AI</span>
              </h1>
            </div>

            <div className="hidden lg:block mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(10,132,255,0.1)] border border-[rgba(10,132,255,0.2)] mb-6">
                <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse"></div>
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">System Online</span>
              </div>
              <h2 className="font-display text-4xl font-black text-white tracking-tight">Authenticate</h2>
              <p className="mt-3 text-sm text-zinc-400 font-medium">Initialize secure terminal session.</p>
            </div>

            <div className="flex flex-col items-center lg:items-start">
              <div ref={googleButtonRef} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell min-h-[100dvh] lg:h-screen overflow-x-hidden lg:overflow-hidden flex flex-col">
      


      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)]">
                  <Crown size={22} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Upgrade to Pro</h2>
                  <p className="text-xs text-zinc-400">Unlimited AI generations</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowUpgradeModal(false)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-[var(--color-bg)]">
                <X size={16} />
              </button>
            </div>
            <div className="mb-6 rounded-xl border border-[rgba(10,132,255,0.3)] bg-[rgba(10,132,255,0.08)] p-4">
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-black text-white">$29</span>
                <span className="text-sm text-zinc-400">/month</span>
              </div>
            </div>
            <button type="button" onClick={() => { setShowUpgradeModal(false); subscription.startCheckout(googleUser?.sub || ''); }} className="cta-primary w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2">
              <CreditCard size={16} /> Start Pro Plan
            </button>
            <p className="mt-3 text-center text-[10px] text-zinc-500">Cancel anytime. Powered by Stripe.</p>
          </div>
        </div>
      )}

      {showAccessPanel && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-sm rounded-2xl p-6 animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <h3 className="font-display text-xl font-bold">Account</h3>
              <button
                type="button"
                onClick={() => setShowAccessPanel(false)}
                className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-white"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[var(--color-ink)] truncate">{googleUser.name}</p>
                <p className="text-xs text-[var(--color-text)] truncate">{googleUser.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { handleSignOut(); setShowAccessPanel(false); }}
              className="mt-4 cta-secondary w-full rounded-xl px-3 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </div>
      )}

      <header className="shrink-0 bg-black border-b-[2px] border-[var(--color-primary-dark)] px-6 py-3 flex items-center justify-between gap-3 relative z-50 shadow-[0_4px_30px_rgba(10,132,255,0.15)]">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0 pr-4 border-r border-[var(--color-border-strong)]">
            <div className="bg-black border border-[var(--color-primary)] shadow-md flex h-10 w-10 items-center justify-center rounded-xl">
              <Camera size={18} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="font-display text-xl font-black leading-none whitespace-nowrap text-white tracking-tight">
              Studio<span className="text-[var(--color-primary)] drop-shadow-md">AI</span>
            </h1>
          </div>

          {originalImage && (
            <>
              <div className="hidden sm:block h-5 w-px bg-[var(--color-border)]" />
              <div className="hidden sm:flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={undo}
                  disabled={historyIndex <= 0 || isGenerating}
                  className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1 || isGenerating}
                  className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={15} />
                </button>
              </div>
            </>
          )}
        </div>

        {originalImage ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {generatedImage && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveStage}
                  className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Heart size={13} className={savedStages.some(s => s.generatedImage === generatedImage) ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : ''} />
                  <span className="hidden sm:inline">Save</span>
                </button>
              </>
            )}
            {subscription.plan === 'free' ? (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition bg-gradient-to-r from-[var(--color-primary)] to-blue-400 text-black hover:opacity-90"
              >
                <Crown size={12} />
                <span className="hidden sm:inline">Upgrade</span>
              </button>
            ) : (
              <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)] border border-[rgba(10,132,255,0.3)]">
                <Crown size={11} />
                Pro
              </span>
            )}
            <div className="h-5 w-px bg-[var(--color-border)] mx-0.5" />
            <button
              type="button"
              onClick={() => {
                setOriginalImage(null);
                setGeneratedImage(null);
                setStageMode('text');
                setShowFeedbackCheckpoint(false);
                setGenerationsSinceFeedback(0);
              }}
              className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title="Start over"
            >
              <RefreshCcw size={15} />
            </button>
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="rounded-full overflow-hidden h-8 w-8 ring-2 ring-[var(--color-border)] hover:ring-[var(--color-primary)] transition-all"
              title={googleUser.name}
            >
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {subscription.plan === 'free' ? (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition bg-gradient-to-r from-[var(--color-primary)] to-blue-400 text-black hover:opacity-90"
              >
                <Crown size={12} />
                <span className="hidden sm:inline">Upgrade</span>
              </button>
            ) : (
              <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)] border border-[rgba(10,132,255,0.3)]">
                <Crown size={11} />
                Pro
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="rounded-full overflow-hidden h-8 w-8 ring-2 ring-[var(--color-border)] hover:ring-[var(--color-primary)] transition-all"
              title={googleUser.name}
            >
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          </div>
        )}
      </header>

      {!originalImage ? (
        <main className="flex-1 flex items-center justify-center overflow-auto editor-canvas-bg relative z-10">
          <div className="w-full max-w-lg mx-auto px-8 py-20 text-center animate-fade-in glass-overlay rounded-[2.5rem] border border-[var(--color-border-strong)] shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-[var(--color-primary)] blur-[100px] opacity-20 pointer-events-none"></div>
            
            <div className="mx-auto mb-8 h-20 w-20 rounded-3xl flex items-center justify-center bg-black border border-[var(--color-primary)] shadow-xl">
              <Camera size={32} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-black text-white tracking-tighter mb-4 drop-shadow-md">
              Upload Your Space
            </h2>
            <p className="text-base text-zinc-400 max-w-sm mx-auto mb-10 leading-relaxed font-medium">
              Upload a listing photo to get started.
            </p>

            <ImageUploader onImageUpload={handleImageUpload} isAnalyzing={isAnalyzing} />

            <div className="mt-6">
              <button
                onClick={handleSamplePhoto}
                disabled={isAnalyzing}
                className="text-sm font-bold uppercase tracking-wider text-[var(--color-primary)] hover:text-white transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles size={16} />
                Execute Demo Sequence
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="mt-16 flex flex-wrap justify-center gap-3">
              {[
                { icon: <Wand2 size={14} />, label: 'AI Staging' },
                { icon: <Camera size={14} />, label: 'Day to Dusk' },
                { icon: <ImageIcon size={14} />, label: 'Sky Replacement' },
                { icon: <Eraser size={14} />, label: 'Smart Cleanup' },
              ].map(f => (
                <span key={f.label} className="pill-chip inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-black border-[var(--color-primary-dark)] text-zinc-300">
                  <span className="text-[var(--color-primary)]">{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative z-10 bg-[#050505]">
          <nav className="hidden lg:flex shrink-0 w-[64px] hover:w-[220px] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] glass-overlay border border-[var(--color-border-strong)] rounded-2xl flex-col gap-1.5 p-2 mx-4 my-6 group z-20 shadow-xl self-start sticky top-6">
            <div className="w-full flex justify-center mb-2 mt-2">
              <div className="w-8 h-1 bg-[var(--color-primary-dark)] rounded-full opacity-50"></div>
            </div>
            {navItems.map((item) => {
              const active = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.available}
                  onClick={() => {
                    if (!item.available) return;
                    setActivePanel(item.id);
                    showToast(item.icon, item.label);
                  }}
                  title={item.available ? item.label : `${item.label} (Coming Soon)`}
                    aria-label={item.label}
                  className={`nav-item ${active && item.available ? 'active' : ''} ${!item.available ? 'opacity-40 cursor-not-allowed' : ''} group/item relative overflow-hidden`}
                >
                  <div className="shrink-0 flex items-center justify-center w-6 h-6 relative z-10 transition-transform duration-300 group-hover/item:scale-110">{item.icon}</div>
                  <span className="text-xs font-bold uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-300 absolute left-12 z-0 translate-x-[-10px] group-hover:translate-x-0">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Mobile bottom tab bar */}
          <nav className="fixed bottom-0 inset-x-0 z-50 lg:hidden flex items-center justify-around bg-black/90 backdrop-blur-xl border-t border-[var(--color-border)] px-1 py-1.5 safe-bottom">
            {navItems.filter(item => item.available).slice(0, 5).map((item) => {
              const active = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivePanel(item.id);
                    showToast(item.icon, item.label);
                  }}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]/50'
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center">{React.cloneElement(item.icon as React.ReactElement, { size: 18 })}</div>
                  <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-3 sm:p-5 lg:p-6 pb-24 lg:pb-6 relative z-10">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="canvas-frame p-1 sm:p-2 rounded-2xl glass-overlay border border-[var(--color-border-strong)] shadow-2xl">
                <div className="relative overflow-hidden rounded-[14px] bg-black aspect-video border border-[var(--color-border-strong)]">
                  {isGenerating && (
                    <div className="absolute inset-0 z-10 bg-black/70 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center">
                      
                      <div className="text-center space-y-4 w-full max-w-md px-6">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--color-primary-dark)] bg-black shadow-lg">
                          <BrainCircuit size={18} className="text-[var(--color-primary)] animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">Generating Design</span>
                        </div>
                        <div className="font-mono text-center space-y-2 relative h-16 w-full mask-linear-gradient-bottom">
                          <p className="text-[10px] sm:text-xs text-[var(--color-primary)] opacity-40 typing-effect">-- ANALYZING SPATIAL DEPTH --</p>
                          <p className="text-[10px] sm:text-xs text-[var(--color-primary)] opacity-70 typing-effect" style={{animationDelay: '0.8s'}}>-- MAPPING AMBIENT OCCLUSION --</p>
                          <p className="text-[10px] sm:text-xs font-bold text-white typing-effect" style={{animationDelay: '1.6s'}}>SYNTHESIZING RENDER REALITY...</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePanel === 'cleanup' ? (
                    <MaskCanvas
                      key={generatedImage || 'no-gen'}
                      imageSrc={generatedImage || originalImage}
                      onMaskChange={setMaskImage}
                      isActive={true}
                    />
                  ) : generatedImage ? (
                    <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
                  ) : (
                    <img
                      src={originalImage}
                      alt="Uploaded room"
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  )}

                  <div className="absolute left-2.5 top-2.5 z-20">
                    <button
                      type="button"
                      onClick={() => setShowRoomPicker((prev) => !prev)}
                      className="pill-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium"
                    >
                      {detectedRoom ? (
                        <>
                          <BrainCircuit size={13} className="text-[var(--color-primary)]" />
                          <span>{selectedRoom}</span>
                          <ChevronDown size={12} className={`transition-transform ${showRoomPicker ? 'rotate-180' : ''}`} />
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="status-dot status-dot-rendering" />
                          <span className="text-[var(--color-text)]">Detecting...</span>
                        </span>
                      )}
                    </button>

                    {showRoomPicker && (
                      <div className="mt-1.5 w-48 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] shadow-lg p-1 animate-slide-down">
                        {roomOptions.map((room) => (
                          <button
                            key={room}
                            type="button"
                            onClick={() => changeDetectedRoom(room)}
                            className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition hover:bg-[var(--color-bg)] ${selectedRoom === room ? 'text-[var(--color-primary)] bg-[var(--color-bg)]' : 'text-[var(--color-ink)]'}`}
                          >
                            {room}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(isGenerating || isAnalyzing || activePanel === 'cleanup') && (
                  <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/80 border border-[rgba(10,132,255,0.3)] shadow-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0A84FF] backdrop-blur-xl">
                    <span className={`status-dot ${isGenerating ? 'bg-[#FF375F] shadow-md animate-pulse' : 'bg-[#0A84FF] shadow-md'}`} />
                    {isGenerating ? 'Generating...' : isAnalyzing ? 'Detecting Room...' : 'Mask Mode'}
                  </div>
                  )}
                </div>
              </div>

              {/* Hide inline analysis panels on mobile — accessible via side panel */}
              <div className="hidden lg:block space-y-4">
                <div className="w-full">
                  {isAnalyzing ? (
                    <div className="premium-surface rounded-2xl p-5 space-y-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-[var(--color-surface-elevated)]" />
                        <div>
                          <div className="h-4 w-32 rounded bg-[var(--color-surface-elevated)] mb-1" />
                          <div className="h-3 w-24 rounded bg-[var(--color-surface-elevated)]" />
                        </div>
                      </div>
                      <div className="h-3 w-full rounded-full bg-[var(--color-surface-elevated)]" />
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded-full bg-[var(--color-surface-elevated)]" />
                            <div className="h-3 w-28 rounded bg-[var(--color-surface-elevated)]" />
                          </div>
                          <div className="h-3 w-8 rounded bg-[var(--color-surface-elevated)]" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ColorAnalysis colors={colors} isLoading={isAnalyzing} />
                  )}
                </div>

                <QualityScore
                  originalImage={originalImage}
                  generatedImage={generatedImage}
                  roomType={selectedRoom}
                />

                {generatedImage && (
                  <MLSExport
                    images={[{ id: '1', source: generatedImage, label: detectedRoom || 'Room' }]}
                  />
                )}
              </div>
            </div>

            {/* Listings Panel */}
            {activePanel === 'listings' && (
              <div className="mx-auto w-full max-w-6xl">
                <ListingDashboard />
              </div>
            )}

            {/* Chat Panel */}
            {activePanel === 'chat' && (
              <div className="canvas-frame overflow-hidden h-[520px]">
                <ChatInterface
                  messages={chatMessages}
                  onSendMessage={handleChatMessage}
                  isLoading={isChatLoading}
                />
              </div>
            )}

            {/* History Panel */}
            {activePanel === 'history' && (
              <div className="subtle-card rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-ink)]">Render History</h3>
                  <div className="flex bg-[var(--color-bg-deep)] rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setHistoryTab('recent')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${historyTab === 'recent' ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:text-white'}`}
                    >
                      Recent
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab('saved')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${historyTab === 'saved' ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:text-white'}`}
                    >
                      Saved
                    </button>
                  </div>
                </div>

                {historyTab === 'recent' ? (
                  history.filter(h => h.generatedImage).length === 0 ? (
                    <p className="text-sm text-[var(--color-text)] py-8 text-center">No renders yet. Generate your first design.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {history.filter(h => h.generatedImage).map((state, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setGeneratedImage(state.generatedImage); setSelectedRoom(state.selectedRoom); setColors(state.colors); }}
                          className="group relative rounded-lg overflow-hidden border border-[var(--color-border)] aspect-[4/3] hover:ring-2 hover:ring-[var(--color-primary)] transition-all"
                        >
                          <img src={state.generatedImage!} alt={`Render ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end p-1.5">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-medium bg-black/60 rounded-md px-2 py-0.5 transition-all">
                              #{i + 1}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  savedStages.length === 0 ? (
                    <p className="text-sm text-[var(--color-text)] py-8 text-center">No saved stages. Use <Heart size={13} className="inline-block mx-0.5 mb-0.5" /> to save designs.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {savedStages.map((stage) => (
                        <div key={stage.id} className="group relative rounded-lg overflow-hidden border border-[var(--color-border)] aspect-[4/3] hover:ring-2 hover:ring-[var(--color-primary)] transition-all">
                          <img src={stage.generatedImage} alt={stage.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex flex-col justify-end p-1.5 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={() => { setGeneratedImage(stage.generatedImage); setOriginalImage(stage.originalImage); }}
                              className="cta-primary rounded-md py-1 text-xs font-medium w-full mb-1"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => {
                                const updated = savedStages.filter(s => s.id !== stage.id);
                                setSavedStages(updated);
                                localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
                              }}
                              className="bg-black/50 text-white rounded-md py-1 text-[10px] font-medium w-full hover:bg-red-500/80 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

          </main>

          <aside className={`mobile-control-sheet order-3 lg:order-3 lg:w-[400px] lg:shrink-0 lg:my-6 lg:mr-6 lg:rounded-[2rem] glass-overlay border lg:border-[var(--color-border-strong)] bg-black/90 shadow-2xl relative z-20 ${sheetOpen ? 'open' : ''} ${activePanel === 'cleanup' ? 'cleanup-active' : ''}`}>
            <div className="hidden lg:block absolute top-[24px] left-[-20px] w-1 h-12 bg-[var(--color-primary-dark)] rounded-full opacity-50 blur-[2px]"></div>
            <button
              type="button"
              onClick={() => setSheetOpen((prev) => !prev)}
              className="mobile-sheet-toggle lg:hidden bg-[#0A0A0A] border-b border-[var(--color-border-strong)]"
            >
              <span className="mobile-sheet-handle bg-zinc-600" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-bold">
                {sheetOpen ? 'Close Panel' : 'Open Panel'}
              </span>
            </button>

            <div className="mobile-sheet-scroll scrollbar-hide">
              <div className="p-4 sm:p-5 space-y-3 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
                {activePanel === 'tools' && (
                  <>
                    <RenovationControls
                      activeMode="design"
                      hasGenerated={!!generatedImage}
                      onGenerate={(p) => handleGenerate(p)}
                      onStageModeChange={setStageMode}
                      isGenerating={isGenerating}
                      hasMask={!!maskImage}
                      selectedRoom={selectedRoom}
                      feedbackRequired={showFeedbackCheckpoint}
                      isMultiGen={isMultiGen}
                      onMultiGenChange={setIsMultiGen}
                    />
                    <StyleAdvisor
                      imageBase64={originalImage}
                      roomType={selectedRoom}
                      onApplyStyle={(p) => handleGenerate(p)}
                    />
                    <SpecialModesPanel
                      originalImage={originalImage}
                      generatedImage={generatedImage}
                      selectedRoom={selectedRoom}
                      onNewImage={(img) => { pushToHistory(); setGeneratedImage(img); }}
                      onRequireKey={() => setShowUpgradeModal(true)}
                      savedStages={savedStages}
                    />
                  </>
                )}

                {activePanel === 'cleanup' && (
                  <RenovationControls
                    activeMode="cleanup"
                    hasGenerated={!!generatedImage}
                    onGenerate={(p) => handleGenerate(p)}
                    isGenerating={isGenerating}
                    hasMask={!!maskImage}
                    selectedRoom={selectedRoom}
                    feedbackRequired={showFeedbackCheckpoint}
                    isMultiGen={isMultiGen}
                    onMultiGenChange={setIsMultiGen}
                  />
                )}

                {(activePanel === 'chat' || activePanel === 'history') && (
                  <div className="premium-surface rounded-2xl p-5 text-center">
                    <p className="text-sm text-[var(--color-text)]">
                      {activePanel === 'chat'
                        ? 'Chat with the AI assistant about your design below.'
                        : 'Browse your render history below.'}
                    </p>
                  </div>
                )}

                {activePanel === 'listings' && (
                  <div className="premium-surface rounded-2xl p-5 text-center">
                    <p className="text-sm text-[var(--color-text)]">
                      Manage your listings in the main panel.
                    </p>
                  </div>
                )}

                {activePanel === 'settings' && (
                  <BrandKit />
                )}
              </div>
            </div>
          </aside>
        </div >
      )}

      {showFeedbackCheckpoint && generatedImage && (
        <div className="modal-overlay fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel rounded-2xl p-6 w-full max-w-sm animate-scale-in">
            <div className="mb-4 text-center">
              <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-[var(--color-primary)] flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Rate this render</h3>
              <p className="mt-1 text-sm text-[var(--color-text)] leading-relaxed">
                Quick feedback every {FEEDBACK_REQUIRED_INTERVAL} generations helps improve results.
              </p>
            </div>
            <BetaFeedbackForm
              mode="quick-only"
              quickRequired={true}
              onQuickSubmitted={() => {
                setShowFeedbackCheckpoint(false);
                setGenerationsSinceFeedback(0);
              }}
              selectedRoom={selectedRoom}
              hasGenerated={!!generatedImage}
              stagedFurnitureCount={0}
              stageMode={stageMode}
              generatedImage={generatedImage}
              betaUserId={googleUser?.sub || ''}
              referralCode=""
              acceptedInvites={0}
              insiderUnlocked={false}
              pro2kUnlocked={false}
            />
          </div>
        </div>
      )}
      <Analytics />
    </div>
  );
};

export default App;
