import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
  createChatSession,
  sendMessageToChat,
  saveApiKey,
  hasApiKey,
  getActiveApiKey,
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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(hasApiKey);
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
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>({ name: 'Elon M.', email: 'elon@tesla.com', picture: 'https://via.placeholder.com/150', sub: '123' });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
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

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setApiKeyError('Please enter your Gemini API key.');
      return;
    }
    if (!key.startsWith('AIza')) {
      setApiKeyError('That doesn\'t look like a valid Gemini API key. It should start with "AIza".');
      return;
    }
    saveApiKey(key);
    setApiKeyConfigured(true);
    setApiKeyError('');
    setApiKeyInput('');
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

    // Require API key before anything else
    if (!hasApiKey()) {
      setShowKeyPrompt(true);
      return;
    }

    if (showFeedbackCheckpoint) {
      setShowFeedbackCheckpoint(true);
      return;
    }

    if (highRes) {
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
      if (
        error.message === 'API_KEY_REQUIRED' ||
        error.message?.includes('Requested entity was not found') ||
        error.message?.toLowerCase().includes('api key') ||
        error.message?.includes('API_KEY_INVALID')
      ) {
        setShowKeyPrompt(true);
      } else {
        alert('Generation failed. Check your connection and try again.');
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
      <div className="min-h-[100dvh] flex bg-black crt-effect">
        <div className="scanline-overlay"></div>
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
                Render Reality.
              </h2>
              <p className="text-lg leading-relaxed text-zinc-300 font-medium max-w-xl">
                Advanced neural staging, instant renovation synthesis, and hyper-realistic asset generation. 
              </p>
            </div>
            <div className="flex items-center gap-8 text-sm font-semibold text-zinc-400">
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-[0_0_10px_var(--color-primary)]"/> Neural Staging</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-[0_0_10px_var(--color-primary)] delay-75"/> Synthesis</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-[0_0_10px_var(--color-primary)] delay-150"/> Encrypted</span>
            </div>
          </div>
        </div>

        {/* Right - Sign In */}
        <div className="flex-1 flex items-center justify-center p-8 bg-black">
          <div className="w-full max-w-md login-glass p-10 rounded-3xl border border-[var(--color-border-strong)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"></div>
            
            <div className="lg:hidden mb-12 flex flex-col items-center text-center">
              <div className="h-16 w-16 mb-6 rounded-2xl flex items-center justify-center bg-black border border-[var(--color-primary-dark)] shadow-[0_0_30px_rgba(0,255,204,0.3)]">
                <Camera size={28} className="text-[var(--color-primary)]" />
              </div>
              <h1 className="font-display text-4xl font-black text-white tracking-tight">
                Studio<span className="text-[var(--color-primary)]" style={{ textShadow: '0 0 20px rgba(0,255,204,0.5)' }}>AI</span>
              </h1>
            </div>

            <div className="hidden lg:block mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(0,255,204,0.1)] border border-[rgba(0,255,204,0.2)] mb-6">
                <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse"></div>
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">System Online</span>
              </div>
              <h2 className="font-display text-4xl font-black text-white tracking-tight">Authenticate</h2>
              <p className="mt-3 text-sm text-zinc-400 font-medium">Initialize secure terminal session.</p>
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
                className="cta-secondary rounded-xl px-5 py-3 text-sm font-semibold inline-flex items-center justify-center gap-3 w-full max-w-[300px] bg-white hover:bg-zinc-100 text-black border-transparent shadow-[0_4px_14px_0_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_6px_20px_rgba(255,255,255,0.23)] hover:-translate-y-0.5"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 bg-white rounded-full p-0.5">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            </div>

            <div className="mt-12 pt-8 border-t border-[var(--color-border-strong)]">
              <p className="text-xs mb-5 font-bold tracking-widest uppercase text-zinc-500">Modules</p>
              <div className="space-y-4">
                {[
                  { icon: <ImageIcon size={16} />, label: 'Neural Staging', desc: 'Synthesize furniture in milliseconds' },
                  { icon: <Wand2 size={16} />, label: 'Structural Morph', desc: 'Real-time architectural previews' },
                  { icon: <Sparkles size={16} />, label: 'Language Matrix', desc: 'Automated description drafting' },
                ].map((f) => (
                  <div key={f.label} className="flex items-start gap-4 p-3 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black border border-[var(--color-primary-dark)] text-[var(--color-primary)] shadow-[inset_0_0_10px_rgba(0,255,204,0.1)]">
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white tracking-wide">{f.label}</p>
                      <p className="text-xs text-zinc-400 mt-1">{f.desc}</p>
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
    <div className="studio-shell min-h-[100dvh] lg:h-screen overflow-x-hidden lg:overflow-hidden flex flex-col crt-effect">
      <div className="scanline-overlay"></div>
      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Key size={22} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">Gemini API Key</h2>
                  <p className="text-xs text-[var(--color-text)]">Required for AI image generation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowKeyPrompt(false); setApiKeyError(''); setApiKeyInput(''); }}
                className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)]"
              >
                <X size={16} />
              </button>
            </div>

            {apiKeyConfigured && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <Check size={14} className="shrink-0" />
                <span>Key saved: <code className="font-mono text-xs">{getActiveApiKey().slice(0, 8)}••••••••</code></span>
              </div>
            )}

            <p className="text-sm text-[var(--color-text)] leading-relaxed mb-4">
              Get a free API key from{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-primary)] font-medium hover:underline inline-flex items-center gap-0.5"
              >
                Google AI Studio <ArrowRight size={12} />
              </a>{' '}
              then paste it below. Your key is stored locally and never sent to our servers.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text)] mb-1.5 block">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder="AIza..."
                  className="w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2.5 text-sm font-mono text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  autoFocus
                />
                {apiKeyError && (
                  <p className="mt-1.5 text-xs text-rose-600">{apiKeyError}</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveApiKey}
                className="cta-primary w-full rounded-xl py-3 text-sm font-semibold"
              >
                Save & Continue
              </button>

              {apiKeyConfigured && (
                <button
                  type="button"
                  onClick={() => { setShowKeyPrompt(false); setApiKeyError(''); setApiKeyInput(''); }}
                  className="cta-secondary w-full rounded-xl py-2.5 text-sm"
                >
                  Keep existing key
                </button>
              )}
            </div>

            <p className="mt-4 text-xs text-[var(--color-text)] leading-relaxed">
              The free tier includes generous usage. Enable billing on your GCP project only if you need high-res renders.
            </p>
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

      <header className="shrink-0 bg-black border-b-[2px] border-[var(--color-primary-dark)] px-6 py-3 flex items-center justify-between gap-3 relative z-50 shadow-[0_4px_30px_rgba(0,255,204,0.15)]">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0 pr-4 border-r border-[var(--color-border-strong)]">
            <div className="bg-black border border-[var(--color-primary)] shadow-[0_0_15px_rgba(0,255,204,0.3)] flex h-10 w-10 items-center justify-center rounded-xl">
              <Camera size={18} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="font-display text-xl font-black leading-none whitespace-nowrap text-white tracking-tight">
              Studio<span className="text-[var(--color-primary)] drop-shadow-[0_0_8px_rgba(0,255,204,0.8)]">AI</span>
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
                  className={`rounded-lg px-4 py-1.5 text-[10px] uppercase tracking-widest font-black inline-flex items-center gap-2 disabled:opacity-50 transition-all ${hasProKey ? 'bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,255,204,0.6)] hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.8)]' : 'cta-secondary'}`}
                >
                  <Zap size={14} className={isEnhancing ? 'animate-pulse text-white' : ''} />
                  <span className="hidden sm:inline">
                    {hasProKey ? 'Neural Enhance' : 'Unlock Enhance'}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setApiKeyInput(''); setApiKeyError(''); setShowKeyPrompt(true); }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition ${apiKeyConfigured ? 'text-[var(--color-primary)] hover:bg-[var(--color-bg)]' : 'cta-secondary border-amber-300 text-amber-700 hover:border-amber-400'}`}
              title={apiKeyConfigured ? 'API key configured — click to update' : 'Set Gemini API key'}
            >
              <Key size={12} />
              <span className="hidden sm:inline">{apiKeyConfigured ? 'API Key' : 'Add Key'}</span>
            </button>
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
            <button
              type="button"
              onClick={() => { setApiKeyInput(''); setApiKeyError(''); setShowKeyPrompt(true); }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition ${apiKeyConfigured ? 'text-[var(--color-primary)] hover:bg-[var(--color-bg)]' : 'cta-secondary border-amber-300 text-amber-700 hover:border-amber-400'}`}
              title={apiKeyConfigured ? 'API key configured — click to update' : 'Set Gemini API key'}
            >
              <Key size={12} />
              <span className="hidden sm:inline">{apiKeyConfigured ? 'API Key' : 'Add Key'}</span>
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
        )}
      </header>

      {!originalImage ? (
        <main className="flex-1 flex items-center justify-center overflow-auto editor-canvas-bg relative z-10">
          <div className="w-full max-w-lg mx-auto px-8 py-20 text-center animate-fade-in glass-overlay rounded-[2.5rem] border border-[var(--color-border-strong)] shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-[var(--color-primary)] blur-[100px] opacity-20 pointer-events-none"></div>
            
            <div className="mx-auto mb-8 h-20 w-20 rounded-3xl flex items-center justify-center bg-black border border-[var(--color-primary)] shadow-[0_0_40px_rgba(0,255,204,0.2)]">
              <Camera size={32} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-black text-white tracking-tighter mb-4 drop-shadow-md">
              INITIALIZE <span className="text-[var(--color-primary)]">UPLOAD</span>
            </h2>
            <p className="text-base text-zinc-400 max-w-sm mx-auto mb-10 leading-relaxed font-medium">
              Provide visual data. The neural engine will reconstruct reality.
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
                { icon: <Wand2 size={14} />, label: 'Neural Staging' },
                { icon: <Camera size={14} />, label: 'Twilight Compute' },
                { icon: <ImageIcon size={14} />, label: 'Sky Replacement' },
                { icon: <Eraser size={14} />, label: 'Data Scrub' },
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
        <div className="flex-1 min-h-0 flex lg:flex-row overflow-hidden relative z-10 bg-[#050505]">
          <nav className="hidden lg:flex shrink-0 w-[64px] hover:w-[220px] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] glass-overlay border border-[var(--color-border-strong)] rounded-2xl flex-col gap-1.5 p-2 mx-4 my-6 group z-20 shadow-[0_0_20px_rgba(0,0,0,0.8)] self-start sticky top-6">
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

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-3 sm:p-5 lg:p-6 pb-[58vh] lg:pb-6 relative z-10">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="canvas-frame p-1 sm:p-2 rounded-2xl glass-overlay border border-[var(--color-border-strong)] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                <div className="relative overflow-hidden rounded-[14px] bg-black aspect-[4/3] sm:aspect-video border border-[var(--color-border-strong)]">
                  {isGenerating && (
                    <div className="absolute inset-0 z-10 bg-black/70 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center crt-effect">
                      <div className="scanline-overlay"></div>
                      <div className="text-center space-y-4 w-full max-w-md px-6">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--color-primary-dark)] bg-black shadow-[0_0_20px_rgba(0,255,204,0.2)]">
                          <BrainCircuit size={18} className="text-[var(--color-primary)] animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">NEURAL UPLINK ACTIVE</span>
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
                  <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/80 border border-[rgba(0,255,204,0.3)] shadow-[0_0_15px_rgba(0,0,0,0.8)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#00FFCC] backdrop-blur-xl">
                    <span className={`status-dot ${isGenerating ? 'bg-[#FF0055] shadow-[0_0_10px_#FF0055] animate-pulse' : 'bg-[#00FFCC] shadow-[0_0_10px_#00FFCC]'}`} />
                    {isGenerating ? 'Generating...' : isAnalyzing ? 'Detecting Room...' : 'Mask Mode'}
                  </div>
                  )}
                </div>
              </div>

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

          <aside className={`mobile-control-sheet order-3 lg:order-3 lg:w-[400px] lg:shrink-0 lg:my-6 lg:mr-6 lg:rounded-[2rem] glass-overlay border lg:border-[var(--color-border-strong)] bg-black/90 shadow-[0_0_30px_rgba(0,0,0,0.8)] relative z-20 ${sheetOpen ? 'open' : ''} ${activePanel === 'cleanup' ? 'cleanup-active' : ''}`}>
            <div className="hidden lg:block absolute top-[24px] left-[-20px] w-1 h-12 bg-[var(--color-primary-dark)] rounded-full opacity-50 blur-[2px]"></div>
            <button
              type="button"
              onClick={() => setSheetOpen((prev) => !prev)}
              className="mobile-sheet-toggle lg:hidden bg-[#0A0A0A] border-b border-[var(--color-border-strong)]"
            >
              <span className="mobile-sheet-handle bg-zinc-600" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-bold">
                {sheetOpen ? 'TERMINATE UI' : 'INITIALIZE UI'}
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
                    <StyleAdvisor
                      imageBase64={originalImage}
                      roomType={selectedRoom}
                      onApplyStyle={(p) => handleGenerate(p, false)}
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
      <Analytics />
    </div>
  );
};

export default App;
