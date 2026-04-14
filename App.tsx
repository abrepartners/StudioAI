import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import {
  generateRoomDesign,
  detectRoomType,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import BatchUploader, { type BatchImage } from './components/BatchUploader';
import BatchProcessor, { type BatchResult } from './components/BatchProcessor';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import SpecialModesPanel from './components/SpecialModesPanel';
import BrandKit from './components/BrandKit';
import ManageTeam from './components/ManageTeam';
import ReferralDashboard from './components/ReferralDashboard';
import QuickStartTutorial from './components/QuickStartTutorial';
import ExportModal from './components/ExportModal';
import AdminShowcase from './components/AdminShowcase';
import FurnitureRemover from './components/FurnitureRemover';
// Removed for Phase 2: ColorAnalysis, ChatInterface, StyleAdvisor, QualityScore, ListingDashboard, BetaFeedbackForm, MLSExport (inline)
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
  editHistory: string[]; // tracks tools used: ['staging', 'cleanup', 'twilight', etc.]
  customPrompt: string; // design direction text for this image
  stageMode: StageMode; // which mode tab was active
  selectedPreset: string | null; // which style pack was selected
}
import { useSubscription } from './hooks/useSubscription';
import {
  RefreshCcw,
  Camera,
  Sparkles,
  CreditCard,
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
  HelpCircle,
  Users,
  Building2,
  Star,
  Upload,
  Zap,
  Share2,
  Trash2,
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
  'Primary Bedroom',
  'Dining Room',
  'Kitchen',
  'Office',
  'Bathroom',
  'Laundry Room',
  'Closet',
  'Nursery',
  'Garage',
  'Patio',
  'Basement',
  'Exterior',
];

type StageMode = 'text' | 'packs' | 'furniture';

// ─── Hero Rotating Headline ────────────────────────────────────────────
const HERO_WORDS = ['real estate.', 'interior design.', 'property flipping.', 'RE photography.', 'renovations.', 'property management.'];

// ─── Tooltip Wrapper ───────────────────────────────────────────────────
const Tip: React.FC<{ label: string; children: React.ReactNode; position?: 'top' | 'bottom' }> = ({ label, children, position = 'bottom' }) => (
  <div className="relative group/tip">
    {children}
    <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 px-2.5 py-1 rounded-lg bg-white text-black text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-all duration-200 shadow-lg ${
      position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
    } hidden lg:block`}>
      {label}
    </div>
  </div>
);

const HeroHeadline: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIndex(prev => (prev + 1) % HERO_WORDS.length);
        setIsAnimating(false);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-black leading-[1] tracking-tighter text-white mb-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
      AI photo editing<br />for{' '}
      <span className="inline-block relative">
        <span
          className={`inline-block text-[var(--color-primary)] transition-all duration-400 ${
            isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
        >
          {HERO_WORDS[index]}
        </span>
      </span>
    </h1>
  );
};

// Feedback checkpoint removed — reintroduce in Phase 2 with backend analytics

// ─── Scroll Reveal Component ─────────────────────────────────────────────
const ScrollRevealInit: React.FC = () => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    }, 100);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  return null;
};

/** Community Gallery — loads approved showcases from the API */
const CommunityGallery: React.FC = () => {
  const [showcases, setShowcases] = useState<Array<{
    id: string; tool_used: string; before_image: string; after_image: string; room_type: string; user_name: string;
  }>>([]);

  useEffect(() => {
    fetch('/api/showcase?limit=6')
      .then(r => r.json())
      .then(data => { if (data.ok && data.showcases?.length) setShowcases(data.showcases); })
      .catch(() => {});
  }, []);

  if (showcases.length === 0) return null;

  const toolColors: Record<string, string> = {
    staging: '#0A84FF', cleanup: '#30D158', twilight: '#FF9F0A', sky: '#64D2FF',
  };

  return (
    <section className="px-5 sm:px-8 lg:px-16 py-20 border-t border-white/[0.04]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Community Gallery</p>
          <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight">Made by agents like you.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {showcases.map((item) => (
            <div key={item.id} className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
              <div className="grid grid-cols-2">
                <img src={item.before_image} alt="Before" className="w-full aspect-[4/3] object-cover" />
                <img
                  src={item.after_image.startsWith('data:') ? item.after_image : `data:image/jpeg;base64,${item.after_image}`}
                  alt="After" className="w-full aspect-[4/3] object-cover"
                />
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: toolColors[item.tool_used] || '#0A84FF' }}>
                  {item.tool_used}
                </span>
                {item.user_name && (
                  <span className="text-[9px] text-zinc-600">by {item.user_name.split(' ')[0]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'tools' | 'history' | 'cleanup' | 'settings'>('tools');
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
  const currentSessionIdRef = useRef<string>('__single__');

  // Chat removed — Phase 2

  // ─── Google OAuth State ──────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // ─── Subscription State ─────────────────────────────────────────────────
  const subscription = useSubscription(googleUser?.email || null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFurnitureRemover, setShowFurnitureRemover] = useState(false);
  const [isRemovingFurniture, setIsRemovingFurniture] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralPrice, setReferralPrice] = useState<number | null>(null);

  // Detect referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref.toUpperCase());
      // Validate the code
      fetch(`/api/referral?action=validate&code=${encodeURIComponent(ref)}`)
        .then(r => r.json())
        .then(data => {
          if (data.ok && data.valid) {
            setReferralPrice(data.discountPrice);
          } else {
            setReferralCode(null);
          }
        })
        .catch(() => setReferralCode(null));
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
      // Track login in Supabase (fire and forget)
      fetch('/api/track-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleId: user.sub,
          email: user.email,
          name: user.name,
          picture: user.picture,
        }),
      }).catch(() => {}); // Never block on tracking
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

  const triggerGoogleSignIn = useCallback(() => {
    const google = (window as any).google;
    if (google?.accounts?.id) {
      google.accounts.id.prompt((notification: any) => {
        // If prompt was dismissed or skipped, fall back to the rendered button click
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          googleButtonRef.current?.querySelector('div[role="button"]')?.click();
        }
      });
    }
  }, []);

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
        editHistory: sessionQueue[sessionIndex]?.editHistory || [],
        customPrompt: sessionQueue[sessionIndex]?.customPrompt || '',
        stageMode: sessionQueue[sessionIndex]?.stageMode || 'text',
        selectedPreset: sessionQueue[sessionIndex]?.selectedPreset || null,
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
      editHistory: [],
      customPrompt: '',
      stageMode: 'text',
      selectedPreset: null,
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
      const roomType = await detectRoomType(base64);
      setDetectedRoom(roomType);
      setSelectedRoom(roomType);

      const initialState: HistoryState = {
        generatedImage: null,
        stagedFurniture: [],
        selectedRoom: roomType,
        colors: [],
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

    setIsGenerating(true);
    generatingSessionsRef.current.add(generatingSessionId);

    try {
      lastPromptRef.current = prompt;
      console.log('[StudioAI] Generation prompt:', prompt);

      const sourceImage = activePanel === 'cleanup' && generatedImage ? generatedImage : originalImage;
      const resultImages = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, false, 1, subscription.plan === 'pro');

      // Check if user is still on the same session image (using ref, not stale closure)
      const stillOnSameImage = currentSessionIdRef.current === generatingSessionId;

      if (stillOnSameImage) {
        // User is still here — update the current view
        setGeneratedImage(resultImages[0]);
        setMaskImage(null);

        // Track which tool was used
        const toolUsed = activePanel === 'cleanup' ? 'cleanup' : 'staging';
        setSessionQueue(prev => prev.map(s =>
          s.id === generatingSessionId
            ? { ...s, editHistory: [...s.editHistory, toolUsed] }
            : s
        ));

        const newStates = resultImages.map(img => ({
          generatedImage: img,
          stagedFurniture: [],
          selectedRoom,
          colors: [],
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
                  history: [
                    ...s.history,
                    { generatedImage: resultImages[0], stagedFurniture: [], selectedRoom: s.selectedRoom, colors: [] },
                  ],
                  historyIndex: s.history.length,
                }
              : s
          )
        );
        // Don't clear isGenerating if current image has its own generation running
        if (!generatingSessionsRef.current.has(currentSessionIdRef.current)) {
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
        showToast(<X size={14} className="text-[#FF375F]" />, 'Service temporarily unavailable');
      } else {
        showToast(<X size={14} className="text-[#FF375F]" />, 'Generation failed. Try again.');
      }
      setIsGenerating(false);
    } finally {
      generatingSessionsRef.current.delete(generatingSessionId);
    }
  };

  const handleFurnitureRemoval = async (maskDataUrl: string, itemDescriptions: string[]) => {
    if (!generatedImage || !originalImage) return;
    setIsRemovingFurniture(true);
    try {
      const descText = itemDescriptions.length > 0
        ? `Specifically remove: ${itemDescriptions.join(', ')}.`
        : 'Remove the furniture/items covered by the mask.';

      const removalPrompt = `Selective Furniture Removal: ${descText} Replace the removed items with the original empty room surface (floor, wall, carpet) that was behind them. Keep ALL other furniture and decor that is NOT masked exactly as they are — do not move, resize, or alter any unmasked items. Preserve all architecture, wall colors, floor colors, lighting, and camera framing exactly.`;

      const resultImages = await generateRoomDesign(generatedImage, removalPrompt, maskDataUrl, false, 1, subscription.plan === 'pro');
      if (resultImages[0]) {
        pushToHistory();
        setGeneratedImage(resultImages[0]);
        setShowFurnitureRemover(false);
        showToast(<Check size={14} className="text-[#30D158]" />, 'Furniture removed');

        // Track edit
        const currentId = sessionQueue[sessionIndex]?.id;
        if (currentId) {
          setSessionQueue(prev => prev.map(s =>
            s.id === currentId ? { ...s, editHistory: [...s.editHistory, 'furniture-removal'] } : s
          ));
        }
      }
    } catch (error) {
      console.error('Furniture removal failed:', error);
      showToast(<X size={14} className="text-[#FF375F]" />, 'Removal failed. Try again.');
    } finally {
      setIsRemovingFurniture(false);
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

  // Compress an image to fit within the Vercel payload limit
  const compressForShowcase = (dataUrl: string, maxWidth = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = dataUrl;
    });
  };

  const handleShareToGallery = async () => {
    if (!originalImage || !generatedImage || !googleUser) return;
    try {
      // Compress images to stay within Vercel's 4.5MB body limit
      const [compBefore, compAfter] = await Promise.all([
        compressForShowcase(originalImage),
        compressForShowcase(generatedImage),
      ]);

      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          email: googleUser.email,
          name: googleUser.name,
          toolUsed: sessionQueue[sessionIndex]?.editHistory?.slice(-1)[0] || (activePanel === 'cleanup' ? 'cleanup' : 'staging'),
          beforeImage: compBefore,
          afterImage: compAfter,
          roomType: selectedRoom,
        }),
      }).then(r => r.json());

      if (res.ok) {
        showToast(<Share2 size={14} className="text-[#30D158]" />, 'Submitted for review!');
      } else {
        showToast(<X size={14} className="text-[#FF375F]" />, res.error || 'Failed to share');
      }
    } catch {
      showToast(<X size={14} className="text-[#FF375F]" />, 'Failed to share');
    }
  };

  const handleSaveStage = async () => {
    if (!generatedImage || !originalImage) return;
    try {
      // Compress images before saving to localStorage (5MB limit)
      const [compOriginal, compGenerated] = await Promise.all([
        compressForShowcase(originalImage, 600),
        compressForShowcase(generatedImage, 600),
      ]);
      const newStage: SavedStage = {
        id: crypto.randomUUID(),
        name: `Design ${new Date().toLocaleDateString()}`,
        originalImage: compOriginal,
        generatedImage: compGenerated,
        timestamp: Date.now(),
      };
      setSavedStages((prev) => {
        const updated = [newStage, ...prev];
        try {
          localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
        } catch {
          // localStorage full — trim oldest entries
          const trimmed = updated.slice(0, 10);
          try { localStorage.setItem('realestate_ai_stages', JSON.stringify(trimmed)); } catch { /* give up */ }
        }
        return updated;
      });
      showToast(<Heart size={14} className="text-[var(--color-primary)]" />, 'Design saved');
    } catch {
      showToast(<X size={14} className="text-[#FF375F]" />, 'Failed to save');
    }
  };

  // ─── Batch Mode Handlers ─────────────────────────────────────────────────
  const handleBatchReady = (images: BatchImage[]) => {
    setBatchImages(images);
  };

  const handleBatchSaveStage = (stage: SavedStage) => {
    setSavedStages((prev) => {
      const updated = [stage, ...prev];
      try {
        localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
      } catch {
        // localStorage full — trim oldest entries and retry
        const trimmed = updated.slice(0, 20);
        try { localStorage.setItem('realestate_ai_stages', JSON.stringify(trimmed)); } catch { /* give up */ }
      }
      return updated;
    });
  };

  const handleBatchComplete = (results: BatchResult[]) => {
    const doneResults = results.filter(r => r.status === 'done' && r.generatedImage);
    if (doneResults.length === 0) {
      setBatchImages(null);
      return;
    }

    // Build session entries for ALL completed results
    const sessions: SessionImage[] = doneResults.map(r => ({
      id: r.id,
      originalImage: r.originalImage,
      generatedImage: r.generatedImage,
      maskImage: null,
      colors: [],
      detectedRoom: r.roomType,
      selectedRoom: r.roomType || 'Living Room' as FurnitureRoomType,
      history: [{ generatedImage: r.generatedImage, stagedFurniture: [], selectedRoom: r.roomType || 'Living Room' as FurnitureRoomType, colors: [] }],
      historyIndex: 0,
      editHistory: [r.action],
      customPrompt: '',
      stageMode: 'text',
      selectedPreset: null,
    }));

    // Load first result into active editor
    setOriginalImage(sessions[0].originalImage);
    setGeneratedImage(sessions[0].generatedImage);
    setDetectedRoom(sessions[0].detectedRoom);
    setSelectedRoom(sessions[0].selectedRoom);
    setHistory(sessions[0].history);
    setHistoryIndex(0);
    setMaskImage(null);
    setColors([]);

    // Set the full session queue and index
    setSessionQueue(sessions);
    setSessionIndex(0);
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
      editHistory: sessionQueue[sessionIndex]?.editHistory || [],
      customPrompt: sessionQueue[sessionIndex]?.customPrompt || '',
      stageMode: sessionQueue[sessionIndex]?.stageMode || 'text',
      selectedPreset: sessionQueue[sessionIndex]?.selectedPreset || null,
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

  // Keep current session ID ref in sync
  useEffect(() => {
    currentSessionIdRef.current = sessionQueue[sessionIndex]?.id || '__single__';
  }, [sessionIndex, sessionQueue]);

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


  const navItems: Array<{
    id: 'tools' | 'cleanup' | 'history' | 'settings';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
      { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
      { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: true },
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
        <ScrollRevealInit />
        {/* ─── Sticky Nav ─── */}
        <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3 sm:py-4 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Camera size={14} className="text-white" />
            </div>
            <span className="font-display text-lg sm:text-xl font-black text-white tracking-tight">
              Studio<span className="text-[var(--color-primary)]">AI</span>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-[13px] font-semibold text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={triggerGoogleSignIn}
              className="hidden sm:block text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={triggerGoogleSignIn}
              className="inline-flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full bg-white text-black text-[11px] sm:text-sm font-semibold hover:bg-zinc-200 transition-all whitespace-nowrap"
            >
              <span className="hidden sm:inline">Start Free — No Credit Card</span>
              <span className="sm:hidden">Start Free</span>
            </button>
          </div>
          <div ref={googleButtonRef} className="hidden" />
        </nav>

        {/* ─── Hero ─── */}
        <section className="relative min-h-[90vh] flex items-center px-5 sm:px-8 lg:px-16 pt-24 pb-16 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-black z-10" />
            <img src="/showcase-dusk-after.png" alt="" className="w-full h-full object-cover opacity-40" />
          </div>

          <div className="relative z-20 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFD60A]/10 border border-[#FFD60A]/20 mb-6 animate-fade-in">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FFD60A] animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#FFD60A]">Early Bird — $14/mo for first 20 users</span>
              </div>

              <HeroHeadline />

              <p className="text-base sm:text-lg text-zinc-400 max-w-lg mb-6 leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                Stage empty rooms. Clean up yards. Convert day to dusk. Replace skies. Visualize renovations. One tool for agents, photographers, designers, and flippers.
              </p>

              {/* Cost Comparison Hook — moved up from bottom CTA */}
              <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#30D158]/[0.06] border border-[#30D158]/20 mb-8 animate-fade-in savings-glow" style={{ animationDelay: '0.25s' }}>
                <span className="text-sm text-zinc-500 line-through">$300/room</span>
                <ArrowRight size={14} className="text-zinc-600" />
                <span className="text-sm font-black text-[#30D158]">$1.38/room</span>
                <span className="text-[10px] text-zinc-500">with StudioAI</span>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-3 mb-8 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                <button type="button" onClick={triggerGoogleSignIn} className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Start Free — No Credit Card
                </button>
                <a href="#pricing" className="inline-flex items-center px-7 py-3.5 rounded-xl text-sm font-semibold text-zinc-400 border border-white/[0.08] hover:border-white/[0.16] hover:text-white transition-all">
                  See Pricing
                </a>
              </div>

              <div className="flex gap-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {[{ value: '5/day', label: 'Free generations' }, { value: '~15s', label: 'Per render' }, { value: '12+', label: 'Styles' }].map((s) => (
                  <div key={s.label}>
                    <div className="text-lg font-black text-white">{s.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Demo Video + Before/After Fallback */}
            <div className="hidden lg:block animate-fade-in" style={{ animationDelay: '0.5s' }}>
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl">
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full rounded-2xl"
                  poster="/showcase-staging-before.jpg"
                >
                  <source src="/demo-video.mp4" type="video/mp4" />
                </video>
              </div>
              <p className="text-[10px] text-zinc-600 text-center mt-3">Watch: Upload a photo, describe what you want, get results in seconds</p>
            </div>
          </div>
        </section>

        {/* ─── Who It's For ─── */}
        <section className="px-5 sm:px-8 lg:px-16 py-10 border-t border-white/[0.04]">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-3 sm:gap-10">
              {[
                { icon: <Camera size={14} />, label: 'Listing Agents' },
                { icon: <ImageIcon size={14} />, label: 'RE Photographers' },
                { icon: <Building2 size={14} />, label: 'Brokerages' },
                { icon: <Users size={14} />, label: 'Property Managers' },
                { icon: <Wand2 size={14} />, label: 'Interior Designers' },
                { icon: <Zap size={14} />, label: 'Flippers & Renovators' },
              ].map((who) => (
                <div key={who.label} className="flex items-center gap-2 text-zinc-500">
                  <span className="text-zinc-600">{who.icon}</span>
                  <span className="text-[11px] sm:text-xs font-semibold tracking-wide">{who.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── What It Does — Interactive Feature Blocks ─── */}
        <section id="features" className="px-5 sm:px-8 lg:px-16 py-24 scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 reveal">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">What StudioAI Does</p>
              <h2 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
                Every tool your photos need.
              </h2>
              <p className="text-sm text-zinc-500 max-w-lg mx-auto">Upload any property photo — empty rooms, cluttered yards, dull skies — and transform it in seconds. No Photoshop, no contractors, no reshoot.</p>
            </div>

            {/* Primary Tools — interactive cards with preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              {[
                {
                  icon: <Wand2 size={22} />,
                  title: 'Virtual Staging',
                  desc: 'Stage any empty room with photorealistic furniture in 12+ styles. AI reads the room size and places appropriately scaled pieces — no king beds in small rooms, no sectionals in tight spaces.',
                  accent: '#0A84FF',
                  before: '/showcase-staging-before.jpg',
                  after: '/showcase-staging-after.jpg',
                  previewLabel: 'Empty primary bedroom staged with bed, nightstands, and art',
                },
                {
                  icon: <Eraser size={22} />,
                  title: 'Smart Cleanup',
                  desc: 'Remove realtor signs, yard debris, personal items, toys, and clutter from any photo. Interior or exterior — the AI strips distractions and reveals clean surfaces without adding anything new.',
                  accent: '#30D158',
                  before: '/showcase-cleanup-before-new.jpg',
                  after: '/showcase-cleanup-after-new.jpg',
                  previewLabel: 'Cluttered laundry room cleaned — shelves and counters cleared',
                },
              ].map((f, i) => (
                <div key={f.title} className={`feature-card-interactive p-7 rounded-2xl bg-white/[0.02] border border-white/[0.06] reveal reveal-delay-${i + 1}`}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${f.accent}12`, color: f.accent }}>{f.icon}</div>
                  <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-[13px] leading-relaxed text-zinc-500">{f.desc}</p>
                  <div className="card-preview">
                    <div className="grid grid-cols-2 gap-2 rounded-lg overflow-hidden">
                      <div className="relative">
                        <img src={f.before} alt="Before" className="w-full aspect-[16/10] object-cover rounded-md" />
                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[7px] font-bold uppercase text-white">Before</div>
                      </div>
                      <div className="relative">
                        <img src={f.after} alt="After" className="w-full aspect-[16/10] object-cover rounded-md" />
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase text-white" style={{ background: `${f.accent}cc` }}>After</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1.5">{f.previewLabel}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Secondary Tools — interactive cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: <Sunset size={18} />, title: 'Day to Dusk', desc: 'Turn daytime exteriors into twilight shots with warm window glow — the #1 photographer trick', accent: '#FF9F0A', before: '/showcase-dusk-before.jpg', after: '/showcase-dusk-after.png' },
                { icon: <Cloud size={18} />, title: 'Sky Replacement', desc: 'Swap grey overcast for blue, dramatic, or golden-hour skies in one click', accent: '#64D2FF', before: null, after: null },
                { icon: <LayoutGrid size={18} />, title: 'Batch Editing', desc: 'Upload an entire listing (25+ photos) and process them all in parallel', accent: '#FFD60A', before: null, after: null },
                { icon: <Trash2 size={18} />, title: 'Selective Removal', desc: 'Paint over specific items to remove them — keep everything else exactly as-is', accent: '#FF375F', before: null, after: null },
              ].map((f, i) => (
                <div key={f.title} className={`feature-card-interactive p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] reveal reveal-delay-${i + 1}`}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${f.accent}10`, color: f.accent }}>{f.icon}</div>
                  <h3 className="text-[13px] font-bold text-white mb-1">{f.title}</h3>
                  <p className="text-[11px] leading-relaxed text-zinc-600">{f.desc}</p>
                  {f.before && f.after && (
                    <div className="card-preview">
                      <div className="grid grid-cols-2 gap-1 rounded overflow-hidden">
                        <img src={f.before} alt="Before" className="w-full aspect-[16/10] object-cover rounded-sm" />
                        <img src={f.after} alt="After" className="w-full aspect-[16/10] object-cover rounded-sm" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Social Proof ─── */}
        <section className="px-5 sm:px-8 lg:px-16 py-16 border-t border-white/[0.04]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 reveal">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-3">Trusted by Agents</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 reveal">
              {[
                {
                  quote: 'I staged 12 listings last week without spending a dime on physical staging. My sellers are blown away by the before/afters.',
                  name: 'Jessica M.',
                  role: 'Listing Agent',
                  stars: 5,
                },
                {
                  quote: 'The day-to-dusk feature alone has gotten me 3 new listings. Sellers see the twilight shots and immediately want to work with me.',
                  name: 'Marcus T.',
                  role: 'RE Photographer',
                  stars: 5,
                },
                {
                  quote: 'I use the cleanup tool on every flip property before putting it on the market. Removes all the construction debris from listing photos instantly.',
                  name: 'David R.',
                  role: 'Property Flipper',
                  stars: 5,
                },
              ].map((t, i) => (
                <div key={t.name} className={`p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] reveal reveal-delay-${i + 1}`}>
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} size={12} className="text-[#FFD60A] fill-[#FFD60A]" />
                    ))}
                  </div>
                  <p className="text-[13px] text-zinc-300 leading-relaxed mb-4">"{t.quote}"</p>
                  <div>
                    <p className="text-xs font-bold text-white">{t.name}</p>
                    <p className="text-[10px] text-zinc-600">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How It Works — Animated Product Mockup ─── */}
        <section className="px-5 sm:px-8 lg:px-16 py-20 border-t border-white/[0.04]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14 reveal">
              <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">How It Works</h2>
              <p className="text-sm text-zinc-500">Three steps. Under 30 seconds. No learning curve.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Steps */}
              <div className="space-y-8 reveal">
                {[
                  { step: '01', title: 'Upload', desc: 'Drop in one photo or an entire listing. We auto-detect room types and lighting conditions.', icon: <Upload size={18} /> },
                  { step: '02', title: 'Edit', desc: 'Pick a tool — stage, cleanup, twilight, sky. Navigate between photos with next/back.', icon: <Wand2 size={18} /> },
                  { step: '03', title: 'Export', desc: 'Download MLS-ready photos. Share the before/after. Done in minutes, not days.', icon: <Download size={18} /> },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-500 shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-zinc-600">{item.step}</span>
                        <h3 className="text-base font-bold text-white">{item.title}</h3>
                      </div>
                      <p className="text-[13px] text-zinc-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Animated App Mockup */}
              <div className="reveal reveal-delay-2">
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  {/* Fake app chrome */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                    </div>
                    <div className="flex-1 h-6 rounded-md bg-white/[0.04] flex items-center justify-center">
                      <span className="text-[9px] text-zinc-600 font-medium">studioai.averyandbryant.com</span>
                    </div>
                  </div>

                  {/* Upload animation */}
                  <div className="relative rounded-xl overflow-hidden bg-black/40 aspect-[16/10]">
                    <img src="/showcase-dusk-before.jpg" alt="Original" className="absolute inset-0 w-full h-full object-cover mockup-step-upload" />
                    <img src="/showcase-dusk-after.png" alt="Result" className="absolute inset-0 w-full h-full object-cover mockup-step-result" />

                    {/* Processing bar overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/80 backdrop-blur-md">
                        <Zap size={12} className="text-[#FFD60A]" />
                        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-[#0A84FF] mockup-step-bar" />
                        </div>
                        <span className="text-[9px] font-bold text-zinc-400">Day to Dusk</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Before/After Showcase ─── */}
        <section className="px-5 sm:px-8 lg:px-16 py-20 border-t border-white/[0.04]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 reveal">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">Real Results</p>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight">From actual listings. Not mockups.</h2>
            </div>

            <div className="space-y-8">
              {[
                { label: 'Day to Dusk', color: '#FF9F0A', icon: <Sunset size={14} />, before: '/showcase-dusk-before.jpg', after: '/showcase-dusk-after.png', caption: 'Exterior converted to twilight with warm interior glow and ambient sky' },
                { label: 'Smart Cleanup', color: '#30D158', icon: <Eraser size={14} />, before: '/showcase-cleanup-before.jpg', after: '/showcase-cleanup-after.png', caption: 'Removed clutter and distractions while preserving original architecture' },
              ].map((item, i) => (
                <div key={item.label} className={`reveal reveal-delay-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: item.color }}>{item.label}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600">Processed in ~15s</span>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-white/[0.06]">
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      <div className="relative">
                        <img src={item.before} alt="Before" className="w-full aspect-[16/10] object-cover" />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[8px] font-bold uppercase text-white">Before</div>
                      </div>
                      <div className="relative">
                        <img src={item.after} alt="After" className="w-full aspect-[16/10] object-cover" />
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[8px] font-bold uppercase text-white" style={{ background: `${item.color}cc` }}>After</div>
                      </div>
                    </div>
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/15 hidden sm:block" />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">{item.caption}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Community Gallery ─── */}
        <CommunityGallery />

        {/* ─── Pricing ─── */}
        <section id="pricing" className="px-5 sm:px-8 lg:px-12 py-24 sm:py-32 scroll-mt-20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16 reveal">
              <h2 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
                Simple Pricing.
              </h2>
              <p className="text-zinc-500 text-base max-w-lg mx-auto">Start free. Upgrade when you're ready. Cancel anytime.</p>
            </div>

            {/* Early Bird + Pro side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto mb-20 reveal">
              {/* Early Bird */}
              <div className="relative p-8 rounded-2xl bg-[#FFD60A]/[0.03] border border-[#FFD60A]/20 flex flex-col hover:border-[#FFD60A]/40 transition-all">
                <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-[#FFD60A] text-[9px] font-bold uppercase tracking-widest text-black">First 20 Users</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFD60A] mb-4">Early Bird</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black text-white">$14</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                  <span className="text-sm text-zinc-600 line-through ml-2">$29</span>
                </div>
                <p className="text-xs text-zinc-500 mb-6">Unlimited. Locked in forever.</p>
                <ul className="space-y-3 text-[13px] text-zinc-300 mb-8">
                  {['All features, unlimited', 'Rate never increases', 'Referral code (5 uses)', 'Friends get your rate too'].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check size={14} className="text-[#FFD60A] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="mt-auto w-full py-3 rounded-xl bg-[#FFD60A] text-black text-sm font-bold hover:bg-[#FFD60A]/90 transition-all"
                >
                  Start Free — No Credit Card
                </button>
              </div>

              {/* Pro */}
              <div className="relative p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col hover:border-white/[0.16] transition-all">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Pro</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black text-white">$29</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-xs text-zinc-500 mb-6">Unlimited generations.</p>
                <ul className="space-y-3 text-[13px] text-zinc-400 mb-8">
                  {['All features, unlimited', 'Batch processing', 'All special modes', 'Priority rendering'].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="mt-auto w-full py-3 rounded-xl bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-all border border-white/10"
                >
                  Start Free — No Credit Card
                </button>
              </div>
            </div>

            {/* Pay-As-You-Go Credits */}
            <div className="text-center mb-8 reveal">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">Pay-As-You-Go Credits</p>
              <p className="text-sm text-zinc-500 mb-4">No subscription. Buy credits, use anytime.</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-3xl mx-auto mb-20 reveal">
              {[
                { name: '10 Credits', price: '$19', per: '$1.90/image' },
                { name: '25 Credits', price: '$39', per: '$1.56/image' },
                { name: '50 Credits', price: '$69', per: '$1.38/image' },
              ].map((pack) => (
                <div key={pack.name} className="flex-1 p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center hover:border-white/[0.12] transition-all">
                  <p className="text-xs font-bold text-white mb-1">{pack.name}</p>
                  <p className="text-lg font-black text-white">{pack.price}</p>
                  <p className="text-[10px] text-zinc-500">{pack.per}</p>
                </div>
              ))}
            </div>

            {/* Brokerages — consolidated single section with admin mockup */}
            <div className="reveal">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-primary)] mb-3">For Brokerages</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight mb-4">
                    Give your entire team Pro access.
                  </h2>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                    Add your agents from a single admin dashboard. Everyone gets unlimited staging, cleanup, and all AI tools. One invoice, not thirty.
                  </p>
                  <div className="space-y-3">
                    {[
                      { name: 'Team', detail: '5 agents · $119/mo · $24/agent' },
                      { name: 'Brokerage', detail: '15 agents · $299/mo · $20/agent' },
                      { name: 'Enterprise', detail: '40 agents · $699/mo · $17/agent' },
                    ].map((t) => (
                      <div key={t.name} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all">
                        <span className="text-sm font-bold text-white">{t.name}</span>
                        <span className="text-[11px] text-zinc-500">{t.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hidden lg:block">
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]"><LayoutGrid size={20} /></div>
                      <div>
                        <p className="text-sm font-bold text-white">Admin Dashboard</p>
                        <p className="text-[10px] text-zinc-500">Add and remove agents in seconds</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {['jane@kwrealty.com', 'mike@agency.com', 'sarah@homes.com'].map((email) => (
                        <div key={email} className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/[0.04]">
                          <span className="text-[11px] text-zinc-400">{email}</span>
                          <span className="text-[9px] font-bold text-[#30D158] uppercase">Pro</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="px-5 sm:px-8 lg:px-16 py-24 scroll-mt-20">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight mb-10 text-center reveal">Common Questions</h2>
            <div className="space-y-3">
              {[
                {
                  q: 'Is this real staging or just overlays?',
                  a: 'Real AI-generated staging powered by Google Gemini. Every piece of furniture is generated specifically for your room — no templates, no overlays, no copy-paste.',
                },
                {
                  q: 'Will MLS boards accept these photos?',
                  a: 'Yes. Exports are sized for Zillow, Realtor.com, and ARMLS with EXIF data stripped. You can add a "Virtually Staged" watermark for compliance.',
                },
                {
                  q: 'What are credits?',
                  a: 'Credits are a pay-as-you-go option. 1 credit = 1 AI generation (staging, cleanup, twilight, or sky replacement). Buy a pack, use them whenever. No subscription needed.',
                },
                {
                  q: 'Can I try before I pay?',
                  a: 'Yes — every account gets 5 free generations per day. No credit card required. Just sign in with Google and start uploading photos.',
                },
                {
                  q: 'How does brokerage pricing work?',
                  a: 'Pick a tier based on team size. You manage agents from your profile — add their email and they get full Pro access. One invoice, centralized billing.',
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes. No contracts, no fees. Cancel from your profile and you keep access through the end of your billing period. Early bird rates are locked in forever.',
                },
              ].map((item, i) => (
                <details key={item.q} className={`group rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden reveal reveal-delay-${Math.min(i + 1, 4)}`}>
                  <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-semibold text-white hover:text-[var(--color-primary)] transition-colors list-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown size={14} className="text-zinc-600 transition-transform group-open:rotate-180 shrink-0 ml-4" />
                  </summary>
                  <div className="px-4 pb-4 text-[13px] text-zinc-400 leading-relaxed -mt-1">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="px-5 sm:px-8 lg:px-12 py-24 sm:py-32">
          <div className="max-w-3xl mx-auto text-center reveal">
            <h2 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
              Stop Paying $300 Per Staging.
            </h2>
            <p className="text-base text-zinc-400 mb-10 max-w-xl mx-auto">
              Professional results in seconds — not days. Join agents already saving thousands.
            </p>
            <div className="inline-flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={triggerGoogleSignIn}
                className="inline-flex items-center gap-2.5 px-10 py-4 rounded-xl bg-white text-black text-base font-bold hover:bg-zinc-200 transition-all shadow-lg shadow-white/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Start Free — No Credit Card
              </button>
              <a href="#pricing" className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">See Pricing</a>
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

      {/* Quick Start Tutorial */}
      <QuickStartTutorial
        forceShow={showTutorial}
        onClose={() => setShowTutorial(false)}
      />

      {showExportModal && generatedImage && (
        <ExportModal
          imageBase64={generatedImage}
          originalImage={originalImage || undefined}
          editHistory={sessionQueue[sessionIndex]?.editHistory || []}
          onClose={() => setShowExportModal(false)}
          onShare={handleShareToGallery}
        />
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${referralPrice ? 'bg-[rgba(255,214,10,0.15)] text-[#FFD60A]' : 'bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)]'}`}>
                  <Crown size={22} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Upgrade to Pro</h2>
                  <p className="text-xs text-zinc-400">
                    {referralPrice ? 'Referred — special rate locked in forever' : 'Unlimited AI generations'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowUpgradeModal(false)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-[var(--color-bg)]">
                <X size={16} />
              </button>
            </div>
            <div className={`mb-6 rounded-xl border p-4 ${referralPrice ? 'border-[#FFD60A]/30 bg-[#FFD60A]/[0.06]' : 'border-[rgba(10,132,255,0.3)] bg-[rgba(10,132,255,0.08)]'}`}>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-white">${referralPrice ? (referralPrice / 100).toFixed(0) : '29'}</span>
                <span className="text-sm text-zinc-400">/month</span>
                {referralPrice && <span className="text-sm text-zinc-600 line-through ml-1">$29</span>}
              </div>
              {referralPrice && referralCode && (
                <p className="text-[10px] text-[#FFD60A] font-semibold">Referral code {referralCode} applied</p>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                setShowUpgradeModal(false);
                if (referralPrice && referralCode) {
                  // Use referral code + checkout at discount
                  await fetch('/api/referral', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'use_code',
                      code: referralCode,
                      email: googleUser?.email,
                    }),
                  });
                  const res = await fetch('/api/referral', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'checkout',
                      email: googleUser?.email,
                      userId: googleUser?.sub,
                      price: referralPrice,
                      returnUrl: window.location.origin,
                    }),
                  }).then(r => r.json());
                  if (res.url) window.location.href = res.url;
                } else {
                  subscription.startCheckout(googleUser?.sub || '');
                }
              }}
              className="cta-primary w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2"
            >
              <CreditCard size={16} /> {referralPrice ? `Start Pro — $${(referralPrice / 100).toFixed(0)}/mo` : 'Start Pro Plan'}
            </button>
            <p className="mt-3 text-center text-[10px] text-zinc-500">Cancel anytime. Rate locked in forever. Powered by Stripe.</p>

            {/* Credit Packs Alternative */}
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 text-center mb-3">Or buy credits — no subscription</p>
              <div className="space-y-2">
                {[
                  { id: 'starter' as const, name: '10 Credits', price: '$19', per: '$1.90/image' },
                  { id: 'pro_pack' as const, name: '25 Credits', price: '$39', per: '$1.56/image' },
                  { id: 'agency' as const, name: '50 Credits', price: '$69', per: '$1.38/image' },
                ].map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => {
                      setShowUpgradeModal(false);
                      subscription.buyCredits(pack.id, googleUser?.sub || '');
                    }}
                    className="w-full flex items-center justify-between rounded-xl px-4 py-3 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left"
                  >
                    <div>
                      <span className="text-sm font-bold text-white">{pack.name}</span>
                      <span className="text-[10px] text-zinc-500 ml-2">{pack.per}</span>
                    </div>
                    <span className="text-sm font-bold text-white">{pack.price}</span>
                  </button>
                ))}
              </div>
            </div>
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

            {/* Referral Program — hide for admin accounts */}
            {!googleUser.email.endsWith('@averyandbryant.com') && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <ReferralDashboard userEmail={googleUser.email} userId={googleUser.sub} />
              </div>
            )}

            {/* Manage Team / Brokerage — hide for admin accounts */}
            {!googleUser.email.endsWith('@averyandbryant.com') && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <ManageTeam adminEmail={googleUser.email} />
              </div>
            )}

            {/* Billing Management — hide for admin accounts */}
            {!googleUser.email.endsWith('@averyandbryant.com') && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[var(--color-primary)]" />
                    <h4 className="text-sm font-semibold text-[var(--color-ink)]">Billing</h4>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    subscription.plan === 'pro'
                      ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {subscription.plan === 'pro' ? 'Pro' : 'Free'}
                  </span>
                </div>
                {subscription.plan === 'pro' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--color-text)]/70">
                      Unlimited generations. {subscription.currentPeriodEnd
                        ? `Renews ${new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}`
                        : ''}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch('/api/stripe-portal', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: googleUser.email, returnUrl: window.location.origin }),
                        }).then(r => r.json());
                        if (res.url) window.open(res.url, '_blank');
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold bg-white/5 text-[var(--color-text)] border border-[var(--color-border)] hover:bg-white/10 transition inline-flex items-center justify-center gap-2"
                    >
                      <CreditCard size={13} /> Manage Billing
                    </button>
                    <p className="text-[9px] text-[var(--color-text)]/40 text-center">Update payment method, view invoices, or cancel</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--color-text)]/70">
                      {subscription.generationsUsed}/{subscription.generationsLimit} generations used today
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowAccessPanel(false); setShowUpgradeModal(true); }}
                      className="w-full rounded-xl px-3 py-2.5 text-xs font-bold bg-[var(--color-primary)] text-white hover:opacity-90 transition inline-flex items-center justify-center gap-2"
                    >
                      <Crown size={13} /> Upgrade to Pro
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Showcase Admin — only for admin accounts */}
            {googleUser.email === 'book@averyandbryant.com' && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <AdminShowcase adminEmail={googleUser.email} />
              </div>
            )}

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

      <header className="shrink-0 bg-black border-b-[2px] border-[var(--color-primary-dark)] px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 relative z-50 shadow-[0_4px_30px_rgba(10,132,255,0.15)]">
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
                <Tip label="Undo (Ctrl+Z)">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={historyIndex <= 0 || isGenerating}
                    className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                  >
                    <Undo2 size={15} />
                  </button>
                </Tip>
                <Tip label="Redo (Ctrl+Y)">
                  <button
                    type="button"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1 || isGenerating}
                    className="rounded-lg p-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                  >
                  <Redo2 size={15} />
                  </button>
                </Tip>
              </div>

              {/* Session Queue Navigation */}
              {sessionQueue.length > 1 && (
                <>
                  <div className="hidden sm:block h-5 w-px bg-[var(--color-border)]" />
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => navigateSession('prev')}
                      disabled={sessionIndex <= 0}
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
                      disabled={sessionIndex >= sessionQueue.length - 1}
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
                <Tip label="Export image or create reveal video">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </Tip>
                <Tip label="Save to your render history">
                  <button
                    type="button"
                    onClick={handleSaveStage}
                    className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Heart size={13} className={savedStages.some(s => s.generatedImage === generatedImage) ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : ''} />
                    <span className="hidden sm:inline">Save</span>
                  </button>
                </Tip>
                <Tip label="Paint over furniture to remove it">
                  <button
                    type="button"
                    onClick={() => setShowFurnitureRemover(true)}
                    className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Remove</span>
                  </button>
                </Tip>
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
              onClick={() => setShowTutorial(true)}
              className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title="Quick start guide"
            >
              <HelpCircle size={15} />
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
              isPro={subscription.plan === 'pro'}
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
                    editHistory: [],
                    customPrompt: '',
                    stageMode: 'text' as StageMode,
                    selectedPreset: null,
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

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto overscroll-contain editor-canvas-bg p-1.5 sm:p-5 lg:p-6 pb-24 lg:pb-6 relative z-10">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="canvas-frame p-0.5 sm:p-2 rounded-xl sm:rounded-2xl glass-overlay border border-[var(--color-border-strong)] shadow-2xl">
                <div className="relative overflow-hidden rounded-[10px] sm:rounded-[14px] bg-black aspect-[4/3] sm:aspect-video border border-[var(--color-border-strong)]">
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
                    <>
                      <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
                      {showFurnitureRemover && (
                        <FurnitureRemover
                          generatedImage={generatedImage}
                          originalImage={originalImage}
                          selectedRoom={selectedRoom}
                          onRemovalComplete={(newImage) => {
                            pushToHistory();
                            setGeneratedImage(newImage);
                            setShowFurnitureRemover(false);
                          }}
                          onClose={() => setShowFurnitureRemover(false)}
                          isProcessing={isRemovingFurniture}
                          onProcess={handleFurnitureRemoval}
                        />
                      )}
                    </>
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
            </div>

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
              <span className="mobile-sheet-handle bg-zinc-500" />
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
                      initialPrompt={sessionQueue[sessionIndex]?.customPrompt || ''}
                      onPromptChange={(prompt) => {
                        setSessionQueue(prev => prev.map((s, i) =>
                          i === sessionIndex ? { ...s, customPrompt: prompt } : s
                        ));
                      }}
                      initialStageMode={sessionQueue[sessionIndex]?.stageMode || 'text'}
                      initialPreset={sessionQueue[sessionIndex]?.selectedPreset || null}
                      onStageModeChanged={(mode) => {
                        setSessionQueue(prev => prev.map((s, i) =>
                          i === sessionIndex ? { ...s, stageMode: mode } : s
                        ));
                      }}
                      onPresetChanged={(preset) => {
                        setSessionQueue(prev => prev.map((s, i) =>
                          i === sessionIndex ? { ...s, selectedPreset: preset } : s
                        ));
                      }}
                    />
                    <SpecialModesPanel
                      key={sessionQueue[sessionIndex]?.id || 'single'}
                      originalImage={originalImage}
                      generatedImage={generatedImage}
                      selectedRoom={selectedRoom}
                      onNewImage={(() => {
                        const capturedSessionId = sessionQueue[sessionIndex]?.id;
                        return (img: string, toolName?: string) => {
                          const tool = toolName || 'edit';
                          if (currentSessionIdRef.current === capturedSessionId) {
                            pushToHistory();
                            setGeneratedImage(img);
                            // Track tool in edit history
                            setSessionQueue(prev => prev.map(s =>
                              s.id === capturedSessionId
                                ? { ...s, editHistory: [...s.editHistory, tool] }
                                : s
                            ));
                          } else if (capturedSessionId) {
                            setSessionQueue(prev =>
                              prev.map(s =>
                                s.id === capturedSessionId
                                  ? { ...s, generatedImage: img, editHistory: [...s.editHistory, tool] }
                                  : s
                              )
                            );
                          }
                        };
                      })()}
                      onRequireKey={() => setShowUpgradeModal(true)}
                      savedStages={savedStages}
                      isPro={subscription.plan === 'pro'}
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
                  />
                )}

                {activePanel === 'history' && (
                  <div className="premium-surface rounded-2xl p-5 text-center">
                    <p className="text-sm text-[var(--color-text)]">
                      Browse your render history below.
                    </p>
                  </div>
                )}

              </div>
            </div>
          </aside>
        </div >
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast-notification animate-toast">
            <span className="toast-icon">{toastMessage.icon}</span>
            <span className="toast-label">{toastMessage.label}</span>
          </div>
        </div>
      )}

      <Analytics />
    </div>
  );
};

export default App;
