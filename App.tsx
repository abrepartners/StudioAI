import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
  createChatSession,
  sendMessageToChat,
  saveApiKey,
  hasApiKey,
  getActiveApiKey,
  generateListingCopy,
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
  Check,
  Heart,
  LogOut,
  ArrowRight,
  Image as ImageIcon,
  Wand2,
  TrendingUp,
  Upload,
  BarChart3,
  Crown,
  Layers,
  Play,
  Package,
  Loader2,
  Copy,
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

  // Smart staging suggestions (Musk: reduce clicks)
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Batch processing (Musk: scale)
  const [batchImages, setBatchImages] = useState<Array<{ id: string; src: string; status: 'pending' | 'processing' | 'done' | 'error'; result?: string }>>([]);
  const [showBatchMode, setShowBatchMode] = useState(false);
  const [batchStyle, setBatchStyle] = useState('Coastal Modern');

  // Marketing package (Musk: one photo → full package)
  const [showMarketingPackage, setShowMarketingPackage] = useState(false);
  const [marketingPackage, setMarketingPackage] = useState<{ staging?: string; copy?: { headline: string; description: string; socialCaption: string; hashtags: string[] }; status: 'idle' | 'staging' | 'copy' | 'done' } | null>(null);

  // Usage analytics (Bezos: flywheel)
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [usageStats, setUsageStats] = useState(() => {
    try {
      const saved = localStorage.getItem('studioai_usage_stats');
      return saved ? JSON.parse(saved) : { totalGenerations: 0, roomsStaged: 0, downloadsCount: 0, sessionsCount: 0, generationsByDay: {} as Record<string, number>, styleUsage: {} as Record<string, number> };
    } catch { return { totalGenerations: 0, roomsStaged: 0, downloadsCount: 0, sessionsCount: 0, generationsByDay: {} as Record<string, number>, styleUsage: {} as Record<string, number> }; }
  });

  // Tier system (Bezos: subscription)
  const [showTierModal, setShowTierModal] = useState(false);
  const FREE_TIER_LIMIT = 25;

  // ─── Google OAuth State ──────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const singleUploadRef = useRef<HTMLInputElement>(null);
  const marketingUploadRef = useRef<HTMLInputElement>(null);
  const pendingMarketingRef = useRef(false);

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

  // Track a usage stat
  const trackStat = useCallback((key: string, styleName?: string) => {
    setUsageStats((prev: any) => {
      const today = new Date().toISOString().slice(0, 10);
      const updated = {
        ...prev,
        [key]: (prev[key] || 0) + 1,
        generationsByDay: { ...prev.generationsByDay, [today]: (prev.generationsByDay?.[today] || 0) + (key === 'totalGenerations' ? 1 : 0) },
        styleUsage: styleName ? { ...prev.styleUsage, [styleName]: (prev.styleUsage?.[styleName] || 0) + 1 } : prev.styleUsage,
      };
      localStorage.setItem('studioai_usage_stats', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Increment session count on mount
  useEffect(() => {
    trackStat('sessionsCount');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart suggestions based on room type (Musk: predict what they want)
  const getSuggestionsForRoom = (room: FurnitureRoomType): string[] => {
    const suggestions: Record<string, string[]> = {
      'Living Room': ['Coastal modern with light oak & linen', 'Scandinavian minimal with warm neutrals', 'Mid-century modern with walnut accents'],
      'Bedroom': ['Serene hotel-suite with neutral palette', 'Bohemian retreat with layered textures', 'Modern luxury with tufted headboard'],
      'Kitchen': ['White shaker cabinets & marble counters', 'Modern farmhouse with butcher block island', 'Sleek minimalist with handleless cabinetry'],
      'Dining Room': ['Elegant dinner-party with chandelier', 'Rustic farmhouse with reclaimed wood table', 'Contemporary with statement lighting'],
      'Office': ['Executive home office with built-ins', 'Creative studio with open shelving', 'Minimal focus zone with warm wood desk'],
      'Primary Bedroom': ['Luxury retreat with upholstered bed', 'Japandi calm with platform bed & plants', 'Classic elegance with layered bedding'],
      'Exterior': ['Manicured landscaping & warm pathway lights', 'Modern curb appeal with clean lines', 'Charming cottage garden with stone walkway'],
    };
    return suggestions[room] || suggestions['Living Room'];
  };

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
    setSmartSuggestions([]);
    setShowSuggestions(true);

    // Check if a marketing package was requested before upload
    const shouldRunMarketing = pendingMarketingRef.current;
    pendingMarketingRef.current = false;

    try {
      const [colorData, roomType] = await Promise.all([analyzeRoomColors(base64), detectRoomType(base64)]);
      setColors(colorData);
      setDetectedRoom(roomType);
      setSelectedRoom(roomType);
      setSmartSuggestions(getSuggestionsForRoom(roomType));
      trackStat('roomsStaged');

      const initialState: HistoryState = {
        generatedImage: null,
        stagedFurniture: [],
        selectedRoom: roomType,
        colors: colorData,
      };
      setHistory([initialState]);
      setHistoryIndex(0);

      // Trigger marketing package if it was pending (pass base64 directly to avoid stale closure)
      if (shouldRunMarketing) {
        generateMarketingPackage(base64);
      }
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
      alert('Please complete the quick feedback checkpoint to continue generating.');
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
      setShowSuggestions(false);
      trackStat('totalGenerations', selectedRoom);

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
    trackStat('downloadsCount');
  };

  // Batch processing handler (Musk: 50 listings at once)
  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newItems: typeof batchImages = [];
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newItems.push({ id: crypto.randomUUID(), src: reader.result as string, status: 'pending' });
        if (newItems.length === files.length) setBatchImages((prev) => [...prev, ...newItems]);
      };
      reader.readAsDataURL(file);
    });
  };

  const runBatchProcessing = async () => {
    if (!hasApiKey()) { setShowKeyPrompt(true); return; }
    for (let i = 0; i < batchImages.length; i++) {
      if (batchImages[i].status !== 'pending') continue;
      setBatchImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'processing' } : img));
      try {
        const prompt = `Virtually stage this room in a ${batchStyle} style. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal.`;
        const results = await generateRoomDesign(batchImages[i].src, prompt, null, false, 1);
        setBatchImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'done', result: results[0] } : img));
        trackStat('totalGenerations', batchStyle);
      } catch {
        setBatchImages((prev) => prev.map((img, idx) => idx === i ? { ...img, status: 'error' } : img));
      }
    }
  };

  // One-click marketing package (Musk: vertical integration)
  const generateMarketingPackage = async (imageOverride?: string) => {
    const img = imageOverride || originalImage;
    if (!img || !hasApiKey()) { setShowKeyPrompt(true); return; }
    setShowMarketingPackage(true);
    setMarketingPackage({ status: 'staging' });
    try {
      const prompt = `Virtually stage this ${selectedRoom} in a Coastal Modern style. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal.`;
      const results = await generateRoomDesign(img, prompt, null, false, 1);
      const stagedImg = results[0];
      setMarketingPackage({ staging: stagedImg, status: 'copy' });
      setGeneratedImage(stagedImg);
      trackStat('totalGenerations', 'Coastal Modern');

      const copy = await generateListingCopy(stagedImg, selectedRoom);
      setMarketingPackage({ staging: stagedImg, copy, status: 'done' });
    } catch {
      setMarketingPackage((prev) => prev ? { ...prev, status: 'done' } : null);
    }
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
        {/* Left - Live Before/After Hero (Jobs: make them feel something) */}
        <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
          {/* Before image */}
          <div
            className="absolute inset-0 login-hero-before login-bg"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1600585152220-90363fe7e115?q=80&w=1920&h=1080&fit=crop')" }}
          />
          {/* After image (staged) */}
          <div
            className="absolute inset-0 login-hero-after login-bg"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1920&h=1080&fit=crop')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/60 z-10" />

          <div className="relative z-20 flex flex-col justify-between p-12 w-full">
            <div className="flex items-center justify-between">
              <h1 style={{ color: '#fff' }} className="font-display text-3xl font-bold">
                Studio<span style={{ color: '#14b8a6' }}>AI</span>
              </h1>
              <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                <span className="status-dot status-dot-live" />
                Live transformation
              </div>
            </div>

            <div className="max-w-lg">
              <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>AI-Powered Design Studio</p>
              <h2 style={{ color: '#fff' }} className="text-4xl xl:text-5xl font-display font-bold leading-[1.1] mb-4">
                One photo. Entire marketing package.
              </h2>
              <p className="text-base leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Upload a listing photo and get AI staging, renovation previews, twilight shots, listing copy, and social posts — in seconds.
              </p>

              {/* Floating stats (Jobs: show, don't tell) */}
              <div className="flex gap-4">
                <div className="rounded-xl bg-white/10 backdrop-blur-md px-4 py-3 border border-white/10 login-stat-float">
                  <p className="text-2xl font-bold text-white">3s</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Avg staging time</p>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-md px-4 py-3 border border-white/10 login-stat-float-delayed">
                  <p className="text-2xl font-bold text-white">7</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">AI tools built-in</p>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-md px-4 py-3 border border-white/10 login-stat-float">
                  <p className="text-2xl font-bold text-white">40%</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Faster sales</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="flex items-center gap-2"><Wand2 size={14} /> Virtual Staging</span>
              <span className="flex items-center gap-2"><Camera size={14} /> Twilight Shots</span>
              <span className="flex items-center gap-2"><Package size={14} /> Full Marketing Kit</span>
            </div>
          </div>
        </div>

        {/* Right - Sign In (Jobs: zero friction, one button) */}
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

            <div className="hidden lg:block mb-8">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold mb-2" style={{ color: '#52525b' }}>Get started</p>
              <h2 className="font-display text-3xl font-bold" style={{ color: '#09090b' }}>Sign in to your studio</h2>
              <p className="mt-2 text-sm" style={{ color: '#52525b' }}>One tap and you're designing.</p>
            </div>

            {/* Single Google sign-in — the SDK iframe IS the button (Jobs: remove every unnecessary element) */}
            <div className="flex flex-col items-center lg:items-start">
              <div ref={googleButtonRef} />
            </div>

            {/* Social proof instead of feature bullets (Bezos: customer obsession) */}
            <div className="mt-10 pt-8" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { num: '10K+', label: 'Photos staged' },
                  { num: '2,400+', label: 'Active agents' },
                  { num: '4.9', label: 'Avg rating' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white border border-[var(--color-border)] p-3">
                    <p className="text-lg font-bold text-[var(--color-ink)]">{s.num}</p>
                    <p className="text-[10px] text-[var(--color-text)] uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl bg-white border border-[var(--color-border)] p-4">
                <p className="text-sm italic text-[var(--color-ink)] leading-relaxed">"Saved me 3 hours per listing. The AI staging is indistinguishable from professional photos."</p>
                <p className="mt-2 text-xs text-[var(--color-text)] font-medium">— Sarah K., Top 1% Agent, Compass</p>
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
            {/* One-click marketing package (Musk) */}
            {originalImage && !showMarketingPackage && (
              <button
                type="button"
                onClick={generateMarketingPackage}
                className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                title="Generate full marketing package"
              >
                <Package size={13} />
                <span className="hidden sm:inline">Marketing Kit</span>
              </button>
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
              onClick={() => setShowAnalytics(true)}
              className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title="View analytics"
            >
              <BarChart3 size={15} />
            </button>
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
        <main className="flex-1 flex items-center justify-center overflow-auto editor-canvas-bg">
          <div className="w-full max-w-2xl mx-auto px-6 py-12 animate-fade-in">
            <div className="text-center mb-8">
              <div className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', boxShadow: '0 8px 24px rgba(13,148,136,0.25)' }}>
                <Camera size={24} className="text-white" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-ink)] mb-2">
                What do you want to do?
              </h2>
              <p className="text-sm text-[var(--color-text)] max-w-sm mx-auto leading-relaxed">
                Upload one photo or many. AI handles the rest.
              </p>
            </div>

            {/* Quick action cards (Musk: eliminate steps ruthlessly) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div
                className="quick-action-card premium-surface rounded-2xl p-5 cursor-pointer text-center"
                onClick={() => singleUploadRef.current?.click()}
              >
                <div className="mx-auto mb-3 h-11 w-11 rounded-xl flex items-center justify-center bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <Upload size={20} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">Stage a Photo</p>
                <p className="text-xs text-[var(--color-text)] mt-1">Upload → AI stages instantly</p>
              </div>

              <div
                className="quick-action-card premium-surface rounded-2xl p-5 cursor-pointer text-center"
                onClick={() => setShowBatchMode(true)}
              >
                <div className="mx-auto mb-3 h-11 w-11 rounded-xl flex items-center justify-center bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                  <Layers size={20} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">Batch Process</p>
                <p className="text-xs text-[var(--color-text)] mt-1">Stage 50 photos at once</p>
              </div>

              <div
                className="quick-action-card premium-surface rounded-2xl p-5 cursor-pointer text-center"
                onClick={() => marketingUploadRef.current?.click()}
              >
                <div className="mx-auto mb-3 h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                  <Package size={20} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">Marketing Package</p>
                <p className="text-xs text-[var(--color-text)] mt-1">Stage + copy + social posts</p>
              </div>
            </div>

            {/* Hidden file inputs for quick-action cards */}
            <input ref={singleUploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onloadend = () => handleImageUpload(reader.result as string);
              reader.readAsDataURL(file);
              e.target.value = '';
            }} />
            <input ref={marketingUploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              pendingMarketingRef.current = true;
              const reader = new FileReader();
              reader.onloadend = () => handleImageUpload(reader.result as string);
              reader.readAsDataURL(file);
              e.target.value = '';
            }} />

            {/* Standard uploader */}
            <div className="max-w-md mx-auto" id="single-upload-trigger-wrapper">
              <ImageUploader onImageUpload={handleImageUpload} isAnalyzing={isAnalyzing} />

              <div className="mt-4 text-center">
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
            </div>

            {/* Usage stats bar (Bezos: measure everything) */}
            {usageStats.totalGenerations > 0 && (
              <div className="mt-8 flex items-center justify-center gap-6 text-center">
                {[
                  { num: usageStats.totalGenerations, label: 'Generations' },
                  { num: usageStats.downloadsCount, label: 'Downloads' },
                  { num: usageStats.sessionsCount, label: 'Sessions' },
                ].map(s => (
                  <div key={s.label} className="stat-counter">
                    <p className="text-lg font-bold text-[var(--color-ink)]">{s.num}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text)]">{s.label}</p>
                  </div>
                ))}
                <button
                  onClick={() => setShowAnalytics(true)}
                  className="text-xs font-medium text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
                >
                  <BarChart3 size={12} /> View insights
                </button>
              </div>
            )}

            {/* Tier indicator (Bezos: subscription) */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white border border-[var(--color-border)] px-4 py-2 text-xs">
                <span className="text-[var(--color-text)]">Free tier</span>
                <span className="font-semibold text-[var(--color-ink)]">{usageStats.totalGenerations}/{FREE_TIER_LIMIT}</span>
                <div className="w-16 h-1.5 rounded-full bg-[var(--color-bg-deep)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, (usageStats.totalGenerations / FREE_TIER_LIMIT) * 100)}%` }} />
                </div>
                <button onClick={() => setShowTierModal(true)} className="font-semibold text-[var(--color-primary)] hover:underline">
                  Upgrade
                </button>
              </div>
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

            {/* Smart Staging Suggestions (Musk: predict what they want, 1 click) */}
            {showSuggestions && smartSuggestions.length > 0 && !generatedImage && !isGenerating && activePanel === 'tools' && (
              <div className="subtle-card rounded-xl p-4 animate-slide-up">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[var(--color-primary)]" />
                    <p className="text-sm font-semibold text-[var(--color-ink)]">AI detected: {selectedRoom}</p>
                  </div>
                  <button onClick={() => setShowSuggestions(false)} className="text-[var(--color-text)] hover:text-[var(--color-ink)]"><X size={14} /></button>
                </div>
                <p className="text-xs text-[var(--color-text)] mb-3">One click to stage. Pick a style or type your own.</p>
                <div className="space-y-2">
                  {smartSuggestions.map((suggestion, i) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        if (!hasApiKey()) { setShowKeyPrompt(true); return; }
                        handleGenerate(`Virtually stage this ${selectedRoom}. Preserve architecture, layout, windows, doors, and built-in fixtures. Keep proportions realistic and photoreal. Primary direction: ${suggestion}`);
                      }}
                      className="suggestion-card w-full text-left rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm hover:border-[var(--color-primary)] hover:bg-[var(--color-bg)] transition-all flex items-center justify-between gap-3 group"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    >
                      <span className="text-[var(--color-ink)] font-medium">{suggestion}</span>
                      <Play size={14} className="text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
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
      {/* ─── Batch Processing Modal (Musk: scale thinking) ─── */}
      {showBatchMode && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-2xl rounded-2xl p-6 animate-scale-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className="feature-badge feature-badge-accent mb-2"><Layers size={13} /> Batch Mode</span>
                <h3 className="font-display text-2xl font-bold">Process Multiple Listings</h3>
                <p className="text-sm text-[var(--color-text)] mt-1">Upload up to 50 photos. AI stages them all in one go.</p>
              </div>
              <button onClick={() => setShowBatchMode(false)} className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-bg)]"><X size={16} /></button>
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text)] mb-1.5 block">Style for all photos</label>
              <div className="flex flex-wrap gap-2">
                {['Coastal Modern', 'Scandinavian', 'Mid-Century Modern', 'Minimalist', 'Urban Loft', 'Farmhouse Chic'].map(s => (
                  <button key={s} onClick={() => setBatchStyle(s)} className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${batchStyle === s ? 'border-[var(--color-accent)] bg-sky-50' : 'border-[var(--color-border)] bg-white'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <label className="cta-secondary rounded-xl px-4 py-3 text-sm font-medium inline-flex items-center gap-2 cursor-pointer w-full justify-center mb-4">
              <Upload size={15} /> Add Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleBatchUpload} />
            </label>

            {batchImages.length > 0 && (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {batchImages.map((img, i) => (
                    <div key={img.id} className="batch-grid-item relative rounded-lg overflow-hidden border border-[var(--color-border)] aspect-[4/3]" style={{ animationDelay: `${i * 50}ms` }}>
                      <img src={img.result || img.src} alt={`Batch ${i + 1}`} className="w-full h-full object-cover" />
                      <div className={`absolute inset-0 flex items-center justify-center ${img.status === 'processing' ? 'bg-black/40' : img.status === 'done' ? 'bg-emerald-500/20' : img.status === 'error' ? 'bg-red-500/20' : ''}`}>
                        {img.status === 'processing' && <Loader2 size={20} className="text-white animate-spin" />}
                        {img.status === 'done' && <Check size={20} className="text-emerald-600" />}
                        {img.status === 'error' && <X size={20} className="text-red-500" />}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--color-text)]">{batchImages.filter(i => i.status === 'done').length}/{batchImages.length} completed</p>
                  <div className="flex gap-2">
                    <button onClick={() => setBatchImages([])} className="cta-secondary rounded-xl px-4 py-2 text-sm">Clear All</button>
                    {batchImages.some(i => i.status === 'done' && i.result) && (
                      <button
                        onClick={() => {
                          batchImages.filter(i => i.status === 'done' && i.result).forEach((img, idx) => {
                            const link = document.createElement('a');
                            link.href = img.result!;
                            link.download = `staged_batch_${idx + 1}_${Date.now()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          });
                          trackStat('downloadsCount');
                        }}
                        className="cta-secondary rounded-xl px-4 py-2 text-sm inline-flex items-center gap-2"
                      >
                        <Download size={14} /> Download All
                      </button>
                    )}
                    <button onClick={runBatchProcessing} disabled={batchImages.every(i => i.status !== 'pending')} className="cta-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
                      <Zap size={14} /> Stage All Photos
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Marketing Package Modal (Musk: vertical integration) ─── */}
      {showMarketingPackage && marketingPackage && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-lg rounded-2xl p-6 animate-scale-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className="feature-badge feature-badge-primary mb-2"><Package size={13} /> Marketing Package</span>
                <h3 className="font-display text-xl font-bold">Full Listing Kit</h3>
              </div>
              <button onClick={() => setShowMarketingPackage(false)} className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-bg)]"><X size={16} /></button>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-3 mb-5">
              {[
                { step: 'staging', label: 'AI Staging' },
                { step: 'copy', label: 'Listing Copy' },
                { step: 'done', label: 'Ready' },
              ].map((s, i) => {
                const active = marketingPackage.status === s.step;
                const done = (['staging', 'copy', 'done'].indexOf(marketingPackage.status) > i) || marketingPackage.status === 'done';
                return (
                  <div key={s.step} className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-[var(--color-primary)] text-white' : active ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'bg-[var(--color-bg-deep)] text-[var(--color-text)]'}`}>
                      {done ? <Check size={14} /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${active ? 'text-[var(--color-ink)]' : 'text-[var(--color-text)]'}`}>{s.label}</span>
                    {i < 2 && <div className="w-8 h-px bg-[var(--color-border)]" />}
                  </div>
                );
              })}
            </div>

            {marketingPackage.status !== 'done' && (
              <div className="rounded-xl bg-[var(--color-bg)] p-6 text-center">
                <Loader2 size={24} className="text-[var(--color-primary)] animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {marketingPackage.status === 'staging' ? 'AI is staging your photo...' : 'Generating listing copy & social posts...'}
                </p>
              </div>
            )}

            {marketingPackage.status === 'done' && (
              <div className="space-y-4">
                {marketingPackage.staging && (
                  <div className="rounded-xl overflow-hidden border border-[var(--color-border)]">
                    <img src={marketingPackage.staging} alt="Staged" className="w-full aspect-video object-cover" />
                  </div>
                )}
                {marketingPackage.copy && (
                  <div className="space-y-3">
                    {[
                      { label: 'MLS Headline', text: marketingPackage.copy.headline },
                      { label: 'Description', text: marketingPackage.copy.description },
                      { label: 'Social Caption', text: marketingPackage.copy.socialCaption },
                    ].map(c => (
                      <div key={c.label} className="subtle-card rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text)] font-semibold">{c.label}</p>
                          <button onClick={() => { navigator.clipboard.writeText(c.text); showToast(<Check size={14} />, 'Copied!'); }} className="text-[var(--color-primary)]"><Copy size={13} /></button>
                        </div>
                        <p className="text-sm text-[var(--color-ink)] leading-relaxed">{c.text}</p>
                      </div>
                    ))}
                    {marketingPackage.copy.hashtags?.length > 0 && (
                      <div className="subtle-card rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text)] font-semibold mb-1">Hashtags</p>
                        <p className="text-sm text-[var(--color-accent)]">{marketingPackage.copy.hashtags.map(h => `#${h}`).join(' ')}</p>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => setShowMarketingPackage(false)} className="cta-primary w-full rounded-xl py-3 text-sm font-semibold">
                  Done — Continue Editing
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Analytics Dashboard (Bezos: measure everything) ─── */}
      {showAnalytics && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-lg rounded-2xl p-6 animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className="feature-badge feature-badge-primary mb-2"><BarChart3 size={13} /> Insights</span>
                <h3 className="font-display text-xl font-bold">Your Studio Analytics</h3>
              </div>
              <button onClick={() => setShowAnalytics(false)} className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-bg)]"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { num: usageStats.totalGenerations, label: 'Total Generations', icon: <Sparkles size={15} />, color: '#0d9488' },
                { num: usageStats.downloadsCount, label: 'Downloads', icon: <Download size={15} />, color: '#6366f1' },
                { num: usageStats.roomsStaged, label: 'Rooms Staged', icon: <ImageIcon size={15} />, color: '#f59e0b' },
                { num: usageStats.sessionsCount, label: 'Sessions', icon: <TrendingUp size={15} />, color: '#ec4899' },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ color: s.color }}>{s.icon}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text)] font-semibold">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-[var(--color-ink)]">{s.num}</p>
                </div>
              ))}
            </div>

            {/* Style usage breakdown */}
            {Object.keys(usageStats.styleUsage || {}).length > 0 && (
              <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text)] mb-3">Most Used Styles</p>
                <div className="space-y-2">
                  {Object.entries(usageStats.styleUsage as Record<string, number>)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([style, count]) => {
                      const max = Math.max(...Object.values(usageStats.styleUsage as Record<string, number>));
                      return (
                        <div key={style} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-[var(--color-ink)] w-32 truncate">{style}</span>
                          <div className="flex-1 h-2 rounded-full bg-[var(--color-bg-deep)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[var(--color-ink)] w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Insight card (Bezos: data-driven recommendations) */}
            <div className="rounded-xl bg-gradient-to-r from-[var(--color-primary)]/5 to-[var(--color-accent)]/5 border border-[var(--color-primary)]/20 p-4">
              <div className="flex items-start gap-3">
                <TrendingUp size={16} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {usageStats.totalGenerations > 10
                      ? 'Power user detected! Staged photos get 3x more listing views.'
                      : 'Tip: Agents who stage all their listings see 40% faster sales.'}
                  </p>
                  <p className="text-xs text-[var(--color-text)] mt-1">Based on platform-wide analytics.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tier / Subscription Modal (Bezos: flywheel) ─── */}
      {showTierModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-6 animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-display text-2xl font-bold">Choose Your Plan</h3>
                <p className="text-sm text-[var(--color-text)] mt-1">Unlock unlimited staging and premium features.</p>
              </div>
              <button onClick={() => setShowTierModal(false)} className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-bg)]"><X size={16} /></button>
            </div>

            <div className="space-y-3">
              {/* Free tier */}
              <div className="rounded-2xl border border-[var(--color-border)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-ink)]">Free</p>
                    <p className="text-2xl font-bold text-[var(--color-ink)]">$0<span className="text-sm font-normal text-[var(--color-text)]">/mo</span></p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-bg-deep)] text-[var(--color-text)]">Current</span>
                </div>
                <ul className="space-y-1.5 text-sm text-[var(--color-text)]">
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> {FREE_TIER_LIMIT} generations/month</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> All 7 AI tools</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Standard quality</li>
                </ul>
              </div>

              {/* Pro tier */}
              <div className="tier-card-pro rounded-2xl border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-primary)] flex items-center gap-1.5"><Crown size={14} /> Pro</p>
                    <p className="text-2xl font-bold text-[var(--color-ink)]">$29<span className="text-sm font-normal text-[var(--color-text)]">/mo</span></p>
                  </div>
                  <span className="feature-badge feature-badge-primary">Popular</span>
                </div>
                <ul className="space-y-1.5 text-sm text-[var(--color-text)] mb-4">
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Unlimited generations</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> 2K high-res renders</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Batch processing (50 photos)</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Marketing package generator</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Analytics & conversion insights</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[var(--color-primary)]" /> Priority support</li>
                </ul>
                <button className="cta-primary w-full rounded-xl py-3 text-sm font-semibold">
                  Coming Soon
                </button>
              </div>

              {/* Enterprise */}
              <div className="rounded-2xl border border-[var(--color-border)] p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-[var(--color-ink)]">Enterprise / Brokerage</p>
                  <p className="text-sm font-bold text-[var(--color-ink)]">Custom</p>
                </div>
                <p className="text-sm text-[var(--color-text)] mb-3">API access, MLS integration, white-label, dedicated support, and volume pricing.</p>
                <button className="cta-secondary w-full rounded-xl py-2.5 text-sm font-medium">Contact Sales</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Analytics />
    </div>
  );
};

export default App;
