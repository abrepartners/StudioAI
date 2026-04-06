import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
  createChatSession,
  sendMessageToChat,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import BatchUploader, { type BatchImage } from './components/BatchUploader';
import BatchProcessor, { type BatchResult } from './components/BatchProcessor';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ColorAnalysis from './components/ColorAnalysis';
import ChatInterface from './components/ChatInterface';
// BetaFeedbackForm removed — no backend to collect feedback yet (Phase 2)
import SpecialModesPanel from './components/SpecialModesPanel';
import StyleAdvisor from './components/StyleAdvisor';
// QualityScore removed — not actionable without backend analytics (Phase 2)
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

// ─── Session Queue Types ──────────────────────────────────────────────────
interface SessionImage {
  id: string;
  originalImage: string;
  generatedImage: string | null;
  maskImage: string | null;
  colors: ColorData[];
  detectedRoom: FurnitureRoomType | null;
  selectedRoom: FurnitureRoomType;
  history: HistoryState[];
  historyIndex: number;
}
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
  Sunset,
  Cloud,
  FileText,
  ChevronLeft,
  ChevronRight,
  Plus,
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

// Feedback checkpoint removed — reintroduce in Phase 2 with backend analytics

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
  // Feedback state removed — Phase 2
  const [toastMessage, setToastMessage] = useState<{ icon: React.ReactNode; label: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');


  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyTab, setHistoryTab] = useState<'recent' | 'saved'>('recent');

  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const lastPromptRef = useRef<string>('');

  // ─── Batch Mode State ────────────────────────────────────────────────────
  const [batchImages, setBatchImages] = useState<BatchImage[] | null>(null);

  // ─── Session Queue ──────────────────────────────────────────────────────
  const [sessionQueue, setSessionQueue] = useState<SessionImage[]>([]);
  const [sessionIndex, setSessionIndex] = useState(-1);
  const generatingSessionsRef = useRef<Set<string>>(new Set());

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
    // Save current image to session queue before loading new one
    if (originalImage) {
      const currentSession: SessionImage = {
        id: sessionQueue[sessionIndex]?.id || crypto.randomUUID(),
        originalImage,
        generatedImage,
        maskImage,
        colors,
        detectedRoom,
        selectedRoom,
        history,
        historyIndex,
      };
      setSessionQueue(prev => {
        const updated = [...prev];
        if (sessionIndex >= 0 && sessionIndex < updated.length) {
          updated[sessionIndex] = currentSession;
        }
        return updated;
      });
    }

    // Add new image to session queue
    const newSession: SessionImage = {
      id: crypto.randomUUID(),
      originalImage: base64,
      generatedImage: null,
      maskImage: null,
      colors: [],
      detectedRoom: null,
      selectedRoom: 'Living Room',
      history: [],
      historyIndex: -1,
    };
    setSessionQueue(prev => [...prev, newSession]);
    setSessionIndex(prev => {
      // If no images yet, index 0; otherwise append
      return prev < 0 ? 0 : sessionQueue.length;
    });

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


    // Capture which session this generation belongs to
    const generatingSessionId = sessionQueue[sessionIndex]?.id || '__single__';
    const generatingOriginal = originalImage;

    setIsGenerating(true);
    generatingSessionsRef.current.add(generatingSessionId);

    try {
      lastPromptRef.current = prompt;
      console.log('[StudioAI] Generation prompt:', prompt);

      const sourceImage = activePanel === 'cleanup' && generatedImage ? generatedImage : originalImage;
      const resultImages = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, false, 1);

      const newColors = await analyzeRoomColors(resultImages[0]);

      // Check if user is still on the same image
      const stillOnSameImage = originalImage === generatingOriginal;

      if (stillOnSameImage) {
        // User is still here — update the current view
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
        setIsGenerating(false);
      } else {
        // User navigated away — save result to the queue silently
        setSessionQueue(prev =>
          prev.map(s =>
            s.id === generatingSessionId
              ? {
                  ...s,
                  generatedImage: resultImages[0],
                  colors: newColors,
                  history: [
                    ...s.history,
                    { generatedImage: resultImages[0], stagedFurniture: [], selectedRoom: s.selectedRoom, colors: newColors },
                  ],
                  historyIndex: s.history.length,
                }
              : s
          )
        );
        // Don't clear isGenerating if current image has its own generation running
        if (!generatingSessionsRef.current.has(sessionQueue[sessionIndex]?.id || '')) {
          setIsGenerating(false);
        }
      }

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
      setIsGenerating(false);
    } finally {
      generatingSessionsRef.current.delete(generatingSessionId);
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

  // ─── Batch Mode Handlers ─────────────────────────────────────────────────
  const handleBatchReady = (images: BatchImage[]) => {
    setBatchImages(images);
  };

  const handleBatchSaveStage = (stage: SavedStage) => {
    setSavedStages((prev) => {
      const updated = [stage, ...prev];
      localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
      return updated;
    });
  };

  const handleBatchComplete = (_results: BatchResult[]) => {
    setBatchImages(null);
  };

  const handleBatchCancel = () => {
    setBatchImages(null);
  };

  const handleBatchLoadImage = (original: string, generated: string) => {
    setOriginalImage(original);
    setGeneratedImage(generated);
    setBatchImages(null);
  };

  // ─── Session Queue Handlers ──────────────────────────────────────────────
  const saveCurrentSession = useCallback((): SessionImage | null => {
    if (!originalImage) return null;
    return {
      id: sessionIndex >= 0 && sessionQueue[sessionIndex]
        ? sessionQueue[sessionIndex].id
        : crypto.randomUUID(),
      originalImage,
      generatedImage,
      maskImage,
      colors,
      detectedRoom,
      selectedRoom,
      history,
      historyIndex,
    };
  }, [originalImage, generatedImage, maskImage, colors, detectedRoom, selectedRoom, history, historyIndex, sessionIndex, sessionQueue]);

  const loadSession = useCallback((session: SessionImage) => {
    setOriginalImage(session.originalImage);
    setGeneratedImage(session.generatedImage);
    setMaskImage(session.maskImage);
    setColors(session.colors);
    setDetectedRoom(session.detectedRoom);
    setSelectedRoom(session.selectedRoom);
    setHistory(session.history);
    setHistoryIndex(session.historyIndex);
  }, []);

  const navigateSession = useCallback((direction: 'prev' | 'next') => {
    const newIndex = direction === 'next' ? sessionIndex + 1 : sessionIndex - 1;
    if (newIndex < 0 || newIndex >= sessionQueue.length) return;

    // Save current state
    const current = saveCurrentSession();
    if (current) {
      setSessionQueue(prev => prev.map((s, i) => (i === sessionIndex ? current : s)));
    }

    // Load target
    loadSession(sessionQueue[newIndex]);
    setSessionIndex(newIndex);

    // Set isGenerating based on whether the target image has an active generation
    const targetId = sessionQueue[newIndex]?.id;
    setIsGenerating(targetId ? generatingSessionsRef.current.has(targetId) : false);
  }, [sessionIndex, sessionQueue, saveCurrentSession, loadSession]);

  const removeFromSession = useCallback((index: number) => {
    setSessionQueue(prev => prev.filter((_, i) => i !== index));
    if (sessionQueue.length <= 1) {
      // Last image — go back to upload screen
      setOriginalImage(null);
      setGeneratedImage(null);
      setSessionIndex(-1);
    } else if (index === sessionIndex) {
      // Removing current — load adjacent
      const nextIdx = index < sessionQueue.length - 1 ? index : index - 1;
      const target = sessionQueue[nextIdx === index ? index + 1 : nextIdx];
      if (target) loadSession(target);
      setSessionIndex(Math.min(nextIdx, sessionQueue.length - 2));
    } else if (index < sessionIndex) {
      setSessionIndex(prev => prev - 1);
    }
  }, [sessionQueue, sessionIndex, loadSession]);

  // Sync current editor state back to session queue on key changes
  useEffect(() => {
    if (sessionIndex < 0 || !originalImage) return;
    setSessionQueue(prev => {
      if (sessionIndex >= prev.length) return prev;
      const updated = [...prev];
      updated[sessionIndex] = {
        ...updated[sessionIndex],
        generatedImage,
        colors,
        detectedRoom,
        selectedRoom,
        history,
        historyIndex,
      };
      return updated;
    });
  }, [generatedImage, sessionIndex, originalImage]); // Only sync on generation changes

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
      <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-black">
        {/* ─── Sticky Nav ─── */}
        <nav className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-8 lg:px-12 py-4 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Camera size={16} className="text-white" />
            </div>
            <span className="font-display text-xl font-black text-white tracking-tight">
              Studio<span className="text-[var(--color-primary)]">AI</span>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-[13px] font-semibold text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div ref={googleButtonRef} className="scale-90 origin-right" />
        </nav>

        {/* ─── Hero ─── */}
        <section className="relative px-5 sm:px-8 lg:px-12 pt-16 sm:pt-24 pb-20 sm:pb-32 overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(10,132,255,0.12)_0%,transparent_70%)] pointer-events-none" />
          <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(255,55,95,0.06)_0%,transparent_70%)] pointer-events-none" />

          <div className="relative z-10 max-w-5xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-8 animate-fade-in">
              <div className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">Powered by Gemini AI</span>
            </div>

            <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] font-black leading-[1.02] tracking-tighter text-white mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Stage Any Room<br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-[var(--color-primary)] via-[#409CFF] to-[var(--color-accent)] bg-clip-text text-transparent">In Seconds</span>
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
              Upload a photo. Pick a style. Get photorealistic virtual staging, twilight conversions,
              sky replacements, and MLS-ready exports — all from one AI-powered workspace.
            </p>

            {/* Stats row */}
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mb-14 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              {[
                { value: '15s', label: 'Average render' },
                { value: '12+', label: 'Design styles' },
                { value: '4K', label: 'Output quality' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl sm:text-3xl font-black text-white">{stat.value}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Hero image showcase */}
            <div className="relative max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/50">
                <img
                  src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=2000&auto=format&fit=crop"
                  alt="Luxury home — StudioAI virtual staging"
                  className="w-full aspect-[16/9] object-cover"
                />
                {/* Overlay badge */}
                <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10">
                  <Sparkles size={13} className="text-[var(--color-primary)]" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">AI Staged</span>
                </div>
              </div>
              {/* Glow under card */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-16 bg-[var(--color-primary)] opacity-[0.07] blur-3xl rounded-full" />
            </div>
          </div>
        </section>

        {/* ─── Trusted By / Social Proof ─── */}
        <section className="px-5 sm:px-8 lg:px-12 py-12 border-t border-white/[0.04]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-6">Built for real estate professionals</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-zinc-500 text-sm font-semibold">
            {['Agents', 'Brokerages', 'Property Managers', 'Photographers', 'Home Stagers'].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-zinc-600" />
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* ─── Features Grid ─── */}
        <section id="features" className="px-5 sm:px-8 lg:px-12 py-20 sm:py-28 scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Everything You Need</p>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                One Platform. Every Listing Asset.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  icon: <Wand2 size={20} />,
                  title: 'Virtual Staging',
                  desc: '12+ design styles from modern minimalist to luxury farmhouse. Auto-detects room type and recommends the best look.',
                  accent: 'var(--color-primary)',
                },
                {
                  icon: <Eraser size={20} />,
                  title: 'Smart Cleanup',
                  desc: 'Remove personal items, clutter, trash, and outdoor eyesores. 6 auto-detect modes for one-click photo perfection.',
                  accent: '#30D158',
                },
                {
                  icon: <Sunset size={20} />,
                  title: 'Virtual Twilight',
                  desc: 'Convert any daytime exterior to a stunning golden-hour dusk shot. Natural sky gradients, warm window glow.',
                  accent: '#FF9F0A',
                },
                {
                  icon: <Cloud size={20} />,
                  title: 'Sky Replacement',
                  desc: 'Swap overcast skies for blue, dramatic, golden, or stormy alternatives. Architecture stays pixel-perfect.',
                  accent: '#64D2FF',
                },
                {
                  icon: <BrainCircuit size={20} />,
                  title: 'Style Advisor',
                  desc: 'AI analyzes your photo and recommends the top 3 staging styles. One-click apply — no guesswork.',
                  accent: '#BF5AF2',
                },
                {
                  icon: <Download size={20} />,
                  title: 'MLS Export',
                  desc: 'One-click exports sized for Zillow, Realtor.com, and ARMLS. EXIF stripped, watermarked, zipped.',
                  accent: 'var(--color-accent)',
                },
                {
                  icon: <LayoutGrid size={20} />,
                  title: 'Batch Processing',
                  desc: 'Upload 25+ photos, apply one style to all. Process an entire listing in minutes, not hours.',
                  accent: '#FFD60A',
                },
                {
                  icon: <FileText size={20} />,
                  title: 'Listing Copy',
                  desc: 'AI-generated MLS descriptions in luxury, casual, and investment tones. Character counts for every platform.',
                  accent: '#30D158',
                },
                {
                  icon: <Shield size={20} />,
                  title: 'Quality Score',
                  desc: 'Every staged image is graded on realism, lighting, perspective, and architectural integrity.',
                  accent: '#0A84FF',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:bg-white/[0.04]"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `${feature.accent}15`, color: feature.accent }}
                  >
                    {feature.icon}
                  </div>
                  <h3 className="text-[15px] font-bold text-white mb-1.5">{feature.title}</h3>
                  <p className="text-[13px] leading-relaxed text-zinc-500">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section className="px-5 sm:px-8 lg:px-12 py-20 sm:py-28 border-t border-white/[0.04]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Simple Workflow</p>
              <h2 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">Three Steps. That's It.</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { step: '01', title: 'Upload', desc: 'Drop in a listing photo — empty room, furnished, exterior, any condition.' },
                { step: '02', title: 'Style', desc: 'Pick a design style or let the AI recommend one. Adjust room type if needed.' },
                { step: '03', title: 'Export', desc: 'Download MLS-ready files, grab the listing copy, share the before/after.' },
              ].map((item) => (
                <div key={item.step} className="text-center sm:text-left">
                  <div className="text-4xl font-black text-white/[0.06] mb-3 font-display">{item.step}</div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Pricing ─── */}
        <section id="pricing" className="px-5 sm:px-8 lg:px-12 py-20 sm:py-28 border-t border-white/[0.04] scroll-mt-20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Pricing</p>
              <h2 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">Start Free. Upgrade When Ready.</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {/* Free Tier */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Free</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-white">$0</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-xs text-zinc-500 mb-6">25 generations per month</p>
                <ul className="space-y-2.5 text-[13px] text-zinc-400 mb-6">
                  {['Virtual staging (all styles)', 'Smart cleanup', 'Style Advisor', 'Quality Score', 'Standard export'].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-zinc-600 font-medium text-center">Sign in to start</div>
              </div>

              {/* Pro Tier */}
              <div className="relative p-6 rounded-2xl bg-white/[0.03] border border-[var(--color-primary)]/30 shadow-lg shadow-blue-500/[0.05]">
                <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-[var(--color-primary)] text-[10px] font-bold uppercase tracking-widest text-white">Popular</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary)] mb-4">Pro</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-white">$29</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-xs text-zinc-500 mb-6">Unlimited generations</p>
                <ul className="space-y-2.5 text-[13px] text-zinc-300 mb-6">
                  {['Everything in Free', 'Unlimited generations', 'Virtual twilight', 'Sky replacement', 'Batch processing (25+)', 'MLS-ready export + zip', 'AI listing descriptions', 'Priority rendering'].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-zinc-500 font-medium text-center">Cancel anytime — powered by Stripe</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="px-5 sm:px-8 lg:px-12 py-20 sm:py-28 border-t border-white/[0.04] scroll-mt-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">Questions? Answered.</h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: 'Is this real virtual staging or just filters?',
                  a: 'Real AI staging. StudioAI uses Gemini to generate photorealistic furniture, decor, and lighting tailored to each room. No overlays, no templates.',
                },
                {
                  q: 'How fast are the results?',
                  a: 'Most single-room stages complete in 10–20 seconds. Batch processing of 25+ photos takes a few minutes total.',
                },
                {
                  q: 'Will MLS boards accept these photos?',
                  a: 'Yes. Exports are sized to Zillow, Realtor.com, and ARMLS specs with EXIF data stripped. Many agents add a "Virtually Staged" watermark for compliance — we support that too.',
                },
                {
                  q: 'Can I cancel my Pro subscription?',
                  a: 'Anytime. No contracts, no cancellation fees. Your account reverts to the free tier at the end of your billing period.',
                },
                {
                  q: 'Do you store my listing photos?',
                  a: 'Photos are processed in-session and not permanently stored on our servers. Your data stays yours.',
                },
              ].map((item) => (
                <details key={item.q} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <summary className="flex items-center justify-between p-5 cursor-pointer text-sm font-semibold text-white hover:text-[var(--color-primary)] transition-colors list-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown size={16} className="text-zinc-500 transition-transform group-open:rotate-180 shrink-0 ml-4" />
                  </summary>
                  <div className="px-5 pb-5 text-[13px] text-zinc-400 leading-relaxed -mt-1">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="px-5 sm:px-8 lg:px-12 py-20 sm:py-28 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
              Stop Paying $300 Per Staging.
            </h2>
            <p className="text-base text-zinc-400 mb-8 max-w-xl mx-auto">
              Professional results in seconds — not days. Join the agents who've already made the switch.
            </p>
            <div className="inline-flex flex-col items-center gap-3">
              <div ref={(el) => {
                if (el && window.google?.accounts?.id) {
                  window.google.accounts.id.renderButton(el, {
                    theme: 'filled_black',
                    size: 'large',
                    shape: 'pill',
                    text: 'continue_with',
                    width: 280,
                  });
                }
              }} />
              <p className="text-[11px] text-zinc-600">Free to start. No credit card required.</p>
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="px-5 sm:px-8 lg:px-12 py-8 border-t border-white/[0.04]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Camera size={14} className="text-zinc-600" />
              <span className="text-xs font-semibold text-zinc-600">StudioAI by Avery & Bryant</span>
            </div>
            <div className="flex items-center gap-6 text-[11px] text-zinc-600 font-medium">
              <span>&copy; {new Date().getFullYear()} Avery & Bryant</span>
              <a href="https://averyandbryant.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">averyandbryant.com</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="studio-shell h-[100dvh] overflow-hidden flex flex-col">
      


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
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in overflow-y-auto">
          <div className="modal-panel w-full max-w-md rounded-2xl p-6 animate-scale-in my-8">
            <div className="flex items-start justify-between mb-5">
              <h3 className="font-display text-xl font-bold">Profile & Settings</h3>
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

            {/* Brand Kit Settings */}
            <div className="mt-5 border-t border-[var(--color-border)] pt-5">
              <BrandKit />
            </div>

            <button
              type="button"
              onClick={() => { handleSignOut(); setShowAccessPanel(false); }}
              className="mt-5 cta-secondary w-full rounded-xl px-3 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2"
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

              {/* Session Queue Navigation */}
              {sessionQueue.length > 1 && (
                <>
                  <div className="hidden sm:block h-5 w-px bg-[var(--color-border)]" />
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => navigateSession('prev')}
                      disabled={sessionIndex <= 0 || isGenerating}
                      className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                      title="Previous photo"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-[10px] font-bold text-[var(--color-text)]/70 tabular-nums min-w-[2rem] text-center">
                      {sessionIndex + 1}/{sessionQueue.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateSession('next')}
                      disabled={sessionIndex >= sessionQueue.length - 1 || isGenerating}
                      className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                      title="Next photo"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </>
              )}
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
                <label className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer">
                  <Plus size={13} />
                  <span className="hidden sm:inline">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onloadend = () => handleImageUpload(reader.result as string);
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                </label>
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
                if (sessionQueue.length > 1) {
                  removeFromSession(sessionIndex);
                } else {
                  setOriginalImage(null);
                  setGeneratedImage(null);
                  setSessionQueue([]);
                  setSessionIndex(-1);
                }
                setStageMode('text');
                setShowFeedbackCheckpoint(false);
                setGenerationsSinceFeedback(0);
              }}
              className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title={sessionQueue.length > 1 ? "Remove this photo" : "Start over"}
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

      {/* ─── Batch Processing View ──────────────────────────────────── */}
      {batchImages && !originalImage ? (
        <main className="flex-1 overflow-y-auto editor-canvas-bg relative z-10 p-4 sm:p-6">
          <div className="max-w-3xl mx-auto">
            <BatchProcessor
              images={batchImages}
              onComplete={handleBatchComplete}
              onSaveStage={handleBatchSaveStage}
              onCancel={handleBatchCancel}
              onLoadImage={handleBatchLoadImage}
            />
          </div>
        </main>
      ) : !originalImage ? (
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

            <BatchUploader
              onBatchReady={handleBatchReady}
              onSingleUpload={handleImageUpload}
              onSkipToEditor={(images) => {
                // Load all images into session queue, open the first one
                if (images.length > 0) {
                  // Load the first image normally (triggers room detection etc)
                  handleImageUpload(images[0].base64);
                  // Queue the rest
                  const rest = images.slice(1).map(img => ({
                    id: img.id,
                    originalImage: img.base64,
                    generatedImage: null,
                    maskImage: null,
                    colors: [],
                    detectedRoom: img.roomType,
                    selectedRoom: img.roomType || 'Living Room' as FurnitureRoomType,
                    history: [],
                    historyIndex: -1,
                  }));
                  setSessionQueue(prev => [...prev, ...rest]);
                }
              }}
              isAnalyzing={isAnalyzing}
            />

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

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto overscroll-contain editor-canvas-bg p-3 sm:p-5 lg:p-6 pb-24 lg:pb-6 relative z-10">
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

                {generatedImage && (
                  <MLSExport
                    images={[{ id: '1', source: generatedImage, label: detectedRoom || 'Room' }]}
                  />
                )}
              </div>
            </div>

            {/* Batch Processing (in-editor) */}
            {batchImages && (
              <div className="mx-auto w-full max-w-6xl">
                <BatchProcessor
                  images={batchImages}
                  onComplete={handleBatchComplete}
                  onSaveStage={handleBatchSaveStage}
                  onCancel={handleBatchCancel}
                  onLoadImage={handleBatchLoadImage}
                />
              </div>
            )}

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
                      key={`controls-${sessionQueue[sessionIndex]?.id || 'single'}`}
                      activeMode="design"
                      hasGenerated={!!generatedImage}
                      onGenerate={(p) => handleGenerate(p)}
                      onStageModeChange={setStageMode}
                      isGenerating={isGenerating}
                      hasMask={!!maskImage}
                      selectedRoom={selectedRoom}
                    />
                    <StyleAdvisor
                      key={`advisor-${sessionQueue[sessionIndex]?.id || 'single'}`}
                      imageBase64={originalImage}
                      roomType={selectedRoom}
                      onApplyStyle={(p) => handleGenerate(p)}
                    />
                    <SpecialModesPanel
                      key={sessionQueue[sessionIndex]?.id || 'single'}
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

              </div>
            </div>
          </aside>
        </div >
      )}

      <Analytics />
    </div>
  );
};

export default App;
