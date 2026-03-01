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
import {
  ColorData,
  StagedFurniture,
  FurnitureRoomType,
  SavedStage,
  HistoryState,
  ChatMessage,
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
  Heart,
  LogOut,
  ArrowRight,
  Image as ImageIcon,
  Wand2,
  Shield,
} from 'lucide-react';

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
  '';

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
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const googleButtonRef = useRef<HTMLDivElement>(null);

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
        auto_select: true,
      });
      if (googleButtonRef.current) {
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

  const showToast = useCallback((icon: React.ReactNode, label: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ icon, label });
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  useEffect(() => {
    if (originalImage) refreshProKeyStatus();
  }, [originalImage, refreshProKeyStatus]);

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
  const handleGenerate = async (prompt: string, highRes = false) => {
    if (!originalImage) return;
    if (showFeedbackCheckpoint) {
      alert('Please complete the quick feedback checkpoint to continue generating.');
      return;
    }

    if (highRes && !hasProKey) {
      setShowKeyPrompt(true);
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
      const count = isMultiGen ? 2 : 1;
      const resultImages = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, highRes, count);

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
      if (!highRes) {
        setGenerationsSinceFeedback((prev) => prev + 1);
      }
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
        await handleGenerate(editMatch[1], false);
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
    id: 'tools' | 'cleanup' | 'chat' | 'history';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
      { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
      { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: true },
      { id: 'chat', label: 'Chat', icon: <MessageSquare size={21} />, available: true },
      { id: 'history', label: 'History', icon: <HistoryIcon size={21} />, available: true },
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
      <div className="min-h-[100dvh] flex">
        {/* Left - Hero Image */}
        <div className="hidden lg:flex lg:w-[55%] relative login-bg">
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-black/50" />
          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <div>
              <h1 style={{ color: '#fff' }} className="font-display text-3xl font-bold">
                Studio<span style={{ color: '#14b8a6' }}>AI</span>
              </h1>
            </div>
            <div className="max-w-lg">
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.6)' }}>AI-Powered Design Studio</p>
              <h2 style={{ color: '#fff' }} className="text-4xl xl:text-5xl font-display font-bold leading-[1.1] mb-4">
                Transform listings into showpieces.
              </h2>
              <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Virtual staging, renovation previews, sky replacement, and AI copywriting — all from a single photo.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="flex items-center gap-2"><Wand2 size={14} /> Virtual Staging</span>
              <span className="flex items-center gap-2"><Camera size={14} /> Twilight Shots</span>
              <span className="flex items-center gap-2"><Shield size={14} /> Secure</span>
            </div>
          </div>
        </div>

        {/* Right - Sign In */}
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: '#fafafa' }}>
          <div className="w-full max-w-sm">
            <div className="lg:hidden mb-10">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0d9488' }}>
                  <Camera size={18} className="text-white" />
                </div>
                <h1 className="font-display text-2xl font-bold" style={{ color: '#09090b' }}>
                  Studio<span style={{ color: '#0d9488' }}>AI</span>
                </h1>
              </div>
            </div>

            <div className="hidden lg:block mb-10">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold mb-2" style={{ color: '#52525b' }}>Welcome back</p>
              <h2 className="font-display text-3xl font-bold" style={{ color: '#09090b' }}>Sign in to your studio</h2>
              <p className="mt-2 text-sm" style={{ color: '#52525b' }}>Access your designs, history, and AI tools.</p>
            </div>

            <div className="flex flex-col items-center lg:items-start gap-3">
              {/* Google SDK renders its iframe button here */}
              <div ref={googleButtonRef} />

              {/* Visible fallback button in case the iframe doesn't render */}
              <button
                type="button"
                onClick={() => {
                  const google = (window as any).google;
                  if (google?.accounts?.id) {
                    google.accounts.id.prompt((notification: any) => {
                      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        alert('Google sign-in popup was blocked. Check your browser popup settings and make sure third-party cookies are allowed for this site.');
                      }
                    });
                  } else {
                    alert('Google Identity Services failed to load. Check your internet connection and try refreshing.');
                  }
                }}
                className="cta-secondary rounded-xl px-5 py-3 text-sm font-semibold inline-flex items-center gap-3 w-full max-w-[300px] justify-center"
                style={{ color: '#09090b' }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            </div>

            {/* Dev bypass for local testing */}
            <button
              type="button"
              onClick={() => {
                const devUser: GoogleUser = {
                  name: 'Dev User',
                  email: 'dev@studioai.local',
                  picture: '',
                  sub: 'dev-local-001',
                };
                setGoogleUser(devUser);
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(devUser));
              }}
              className="mt-3 text-xs font-medium transition-colors"
              style={{ color: '#a1a1aa' }}
            >
              Skip sign-in (Dev Mode)
            </button>

            {!GOOGLE_CLIENT_ID && (
              <div className="mt-6 rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                Missing VITE_GOOGLE_CLIENT_ID. Add it to your .env.local file.
              </div>
            )}

            <div className="mt-10 pt-8" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <p className="text-xs mb-4 font-medium" style={{ color: '#52525b' }}>What you get access to:</p>
              <div className="space-y-3">
                {[
                  { icon: <ImageIcon size={15} />, label: 'AI Virtual Staging', desc: 'Furnish empty rooms instantly' },
                  { icon: <Wand2 size={15} />, label: 'Smart Renovation', desc: 'Preview remodels before building' },
                  { icon: <Sparkles size={15} />, label: 'Listing Copy AI', desc: 'Auto-generate MLS descriptions' },
                ].map((f) => (
                  <div key={f.label} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(13,148,136,0.08)', color: '#0d9488' }}>
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#09090b' }}>{f.label}</p>
                      <p className="text-xs" style={{ color: '#52525b' }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell min-h-[100dvh] lg:h-screen overflow-x-hidden lg:overflow-hidden flex flex-col">
      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 text-center animate-scale-in">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Key size={26} />
            </div>
            <h2 className="font-display text-2xl font-bold">High-Res Rendering</h2>
            <p className="mt-2 text-sm text-[var(--color-text)] leading-relaxed">
              Select a Gemini API key from a paid GCP project to enable high-resolution enhancement.
            </p>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={handleApiKeySelection}
                className="cta-primary w-full rounded-xl py-3 text-sm font-semibold"
              >
                Select API Key
              </button>
              <button
                type="button"
                onClick={() => setShowKeyPrompt(false)}
                className="cta-secondary w-full rounded-xl py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProConfirm && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <span className="feature-badge feature-badge-primary mb-3">
                  <Zap size={13} /> High-Res
                </span>
                <h3 className="font-display text-2xl font-bold">Confirm Enhancement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProConfirm(false)}
                className="rounded-lg p-2 text-[var(--color-text)] transition hover:bg-[var(--color-bg)]"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text)] mb-6">
              This will trigger a high-detail enhancement render. Keep billing enabled in your connected GCP project.
            </p>
            <button
              type="button"
              onClick={() => handleGenerate(lastPromptRef.current || 'Finalize with realistic textures.', true)}
              className="cta-primary w-full rounded-xl py-3 text-sm font-semibold"
            >
              Confirm and Enhance
            </button>
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

      <header className="shrink-0 bg-white border-b border-[var(--color-border)] px-4 py-2.5 sm:px-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-[var(--color-primary)] flex h-9 w-9 items-center justify-center rounded-xl">
              <Camera size={17} className="text-white" />
            </div>
            <h1 className="font-display text-lg font-bold leading-none whitespace-nowrap text-[var(--color-ink)]">
              Studio<span className="text-[var(--color-primary)]">AI</span>
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
                <button
                  type="button"
                  onClick={() => {
                    if (hasProKey) setShowProConfirm(true);
                    else setShowKeyPrompt(true);
                  }}
                  disabled={isEnhancing}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${hasProKey ? 'cta-primary' : 'cta-secondary'}`}
                >
                  <Zap size={13} className={isEnhancing ? 'animate-pulse' : ''} />
                  <span className="hidden sm:inline">
                    {hasProKey ? 'Enhance' : 'Enhance'}
                  </span>
                </button>
              </>
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
        )}
      </header>

      {!originalImage ? (
        <main className="flex-1 flex items-center justify-center overflow-auto editor-canvas-bg">
          <div className="w-full max-w-md mx-auto px-6 py-16 text-center animate-fade-in">
            <div className="mx-auto mb-6 h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', boxShadow: '0 8px 24px rgba(13,148,136,0.25)' }}>
              <Camera size={24} className="text-white" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-ink)] mb-2">
              Start with a photo
            </h2>
            <p className="text-sm text-[var(--color-text)] max-w-xs mx-auto mb-8 leading-relaxed">
              Upload a room or property photo to unlock AI staging, renovation previews, and more.
            </p>

            <ImageUploader onImageUpload={handleImageUpload} isAnalyzing={isAnalyzing} />

            <div className="mt-4">
              <button
                onClick={handleSamplePhoto}
                disabled={isAnalyzing}
                className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles size={14} />
                Try with a sample photo
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-2">
              {[
                { icon: <Wand2 size={12} />, label: 'Virtual Staging' },
                { icon: <Camera size={12} />, label: 'Twilight Shots' },
                { icon: <ImageIcon size={12} />, label: 'Sky Replacement' },
                { icon: <Eraser size={12} />, label: 'Declutter' },
                { icon: <Sparkles size={12} />, label: 'Listing Copy' },
              ].map(f => (
                <span key={f.label} className="pill-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <span className="text-[var(--color-primary)]">{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex lg:flex-row overflow-hidden relative">
          <nav className="hidden lg:flex shrink-0 w-[180px] bg-white border-r border-[var(--color-border)] flex-col gap-1 p-3 order-1">
            <p className="px-2 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-text)] font-semibold">Workspace</p>
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
                  className={`nav-item ${active && item.available ? 'active' : ''} ${!item.available ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {item.icon}
                  <span className="text-xs">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-3 sm:p-5 lg:p-6 pb-[58vh] lg:pb-6">
            <div className="mx-auto w-full max-w-5xl space-y-4">
              <div className="canvas-frame p-1.5 sm:p-2">
                <div className="relative overflow-hidden rounded-xl bg-zinc-900 aspect-[4/3] sm:aspect-video">
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
                    <MaskCanvas
                      imageSrc={originalImage}
                      onMaskChange={setMaskImage}
                      isActive={false}
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
                      <div className="mt-1.5 w-48 rounded-xl bg-white border border-[var(--color-border)] shadow-lg p-1 animate-slide-down">
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

                  <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-md">
                    <span className={`status-dot ${isGenerating ? 'status-dot-rendering' : 'status-dot-live'}`} />
                    {isGenerating ? 'Rendering' : activePanel === 'cleanup' ? 'Mask Mode' : 'Live'}
                  </div>
                </div>
              </div>

              <div className="w-full">
                <ColorAnalysis colors={colors} isLoading={isAnalyzing} />
              </div>
            </div>

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
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${historyTab === 'recent' ? 'bg-white shadow-sm text-[var(--color-ink)]' : 'text-[var(--color-text)]'}`}
                    >
                      Recent
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab('saved')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${historyTab === 'saved' ? 'bg-white shadow-sm text-[var(--color-ink)]' : 'text-[var(--color-text)]'}`}
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

          <aside className={`mobile-control-sheet order-3 lg:order-3 lg:w-[400px] lg:shrink-0 lg:border-l border-[var(--color-border)] bg-white ${sheetOpen ? 'open' : ''} ${activePanel === 'cleanup' ? 'cleanup-active' : ''}`}>
            <button
              type="button"
              onClick={() => setSheetOpen((prev) => !prev)}
              className="mobile-sheet-toggle lg:hidden"
            >
              <span className="mobile-sheet-handle" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text)] font-medium">
                {sheetOpen ? 'Hide Controls' : 'Show Controls'}
              </span>
            </button>

            <div className="mobile-sheet-scroll scrollbar-hide">
              <div className="p-4 sm:p-5 space-y-3 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
                {activePanel === 'tools' && (
                  <>
                    <RenovationControls
                      activeMode="design"
                      hasGenerated={!!generatedImage}
                      onGenerate={(p) => handleGenerate(p, false)}
                      onStageModeChange={setStageMode}
                      isGenerating={isGenerating}
                      hasMask={!!maskImage}
                      selectedRoom={selectedRoom}
                      feedbackRequired={showFeedbackCheckpoint}
                      isMultiGen={isMultiGen}
                      onMultiGenChange={setIsMultiGen}
                    />
                    <SpecialModesPanel
                      originalImage={originalImage}
                      generatedImage={generatedImage}
                      selectedRoom={selectedRoom}
                      onNewImage={(img) => { pushToHistory(); setGeneratedImage(img); }}
                      onRequireKey={() => setShowKeyPrompt(true)}
                    />
                  </>
                )}

                {activePanel === 'cleanup' && (
                  <RenovationControls
                    activeMode="cleanup"
                    hasGenerated={!!generatedImage}
                    onGenerate={(p) => handleGenerate(p, false)}
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

      {toastMessage && (
        <div className="toast-container">
          <div className="toast-notification animate-toast">
            <span className="toast-icon">{toastMessage.icon}</span>
            <span className="toast-label">{toastMessage.label}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
