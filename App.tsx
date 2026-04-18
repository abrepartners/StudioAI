import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import {
  generateRoomDesign,
  detectRoomType,
} from './services/geminiService';
import { sharpenImage } from './utils/sharpen';
import { compositeStackedEdit } from './utils/stackComposite';
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
import MLSExport from './components/MLSExport';
import ListingDescription from './components/ListingDescription';
import SocialPack from './components/SocialPack';
import EditingBadge from './components/EditingBadge';
import { useBrandKit } from './hooks/useBrandKit';
import { useModal } from './hooks/useModal';
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
  BookmarkPlus,
  Bookmark,
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
  MoreHorizontal,
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
// R1 (Phase 2 Cluster A): rotating verticals retired in favor of a single
// agent-focused promise. Kept as a legacy constant in case anything imports it.
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
  // R1: fixed headline — "Staged listing photos in 15 seconds. Not 15 days."
  // Leads with the agent's turnaround KPI, names the deliverable, drops the
  // 6-way vertical hedge.
  return (
    <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-black leading-[1] tracking-tighter text-white mb-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
      Staged listing photos<br />
      <span className="text-[var(--color-primary)]">in 15 seconds.</span> Not 15 days.
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

  const [activePanel, setActivePanel] = useState<'tools' | 'history' | 'cleanup' | 'settings' | 'mls' | 'listing' | 'social'>('tools');
  const [stageMode, setStageMode] = useState<StageMode>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  // Feedback state removed — Phase 2
  const [toastMessage, setToastMessage] = useState<{
    icon: React.ReactNode;
    label: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
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
  // Mirror of BatchProcessor's internal results so we can restore them when
  // the user opens a single result in the editor and returns via "← Back to Batch".
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);

  // ─── Session Queue ──────────────────────────────────────────────────────
  const [sessionQueue, setSessionQueue] = useState<SessionImage[]>([]);
  const [sessionIndex, setSessionIndex] = useState(-1);
  const generatingSessionsRef = useRef<Set<string>>(new Set());
  const currentSessionIdRef = useRef<string>('__single__');

  // F9: AbortController registry keyed by session ID. Each in-flight generation
  // gets its own controller so we can cancel independently of sibling sessions.
  const generationAbortersRef = useRef<Map<string, AbortController>>(new Map());

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
  const { brandKit } = useBrandKit();
  const [showFurnitureRemover, setShowFurnitureRemover] = useState(false);
  const [isRemovingFurniture, setIsRemovingFurniture] = useState(false);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const generationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Close header overflow menu on outside click / Escape
  useEffect(() => {
    if (!showOverflowMenu) return;
    const onClick = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOverflowMenu(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [showOverflowMenu]);

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


  const showToast = useCallback((
    icon: React.ReactNode,
    label: string,
    options?: { durationMs?: number; action?: { label: string; onClick: () => void } }
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const duration = options?.durationMs ?? 2500;
    setToastMessage({ icon, label, action: options?.action });
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  }, []);

  // F7: dismiss the current toast immediately. Used by Undo toast action.
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(null);
  }, []);

  // F9: cancel the currently-visible generation. Targets the active session's
  // AbortController; the in-flight request rejects with ABORTED and the catch
  // block in handleGenerate surfaces the "Generation cancelled" toast.
  const cancelCurrentGeneration = useCallback(() => {
    const sid = currentSessionIdRef.current;
    const controller = generationAbortersRef.current.get(sid);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }, []);

  // F6: accessible modal hooks for the two inline modals in App.tsx.
  // Hooks must be called unconditionally; the `isOpen` flag governs behaviour.
  const upgradeModal = useModal({
    isOpen: showUpgradeModal,
    onClose: () => setShowUpgradeModal(false),
  });
  const accessPanelModal = useModal({
    isOpen: showAccessPanel,
    onClose: () => setShowAccessPanel(false),
  });

  // Timeout wrapper for AI generation calls
  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number, message = 'Generation timed out'): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
  }, []);

  // Start/stop elapsed timer for generation indicator
  const startGenerationTimer = useCallback(() => {
    setGenerationElapsed(0);
    if (generationTimerRef.current) clearInterval(generationTimerRef.current);
    generationTimerRef.current = setInterval(() => {
      setGenerationElapsed(prev => prev + 1);
    }, 1000);
  }, []);

  const stopGenerationTimer = useCallback(() => {
    if (generationTimerRef.current) {
      clearInterval(generationTimerRef.current);
      generationTimerRef.current = null;
    }
    setGenerationElapsed(0);
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
    showToast(<Undo2 size={14} className="text-[var(--color-primary)]" />, 'Undone');
  }, [history, historyIndex, showToast]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];

    setGeneratedImage(state.generatedImage);
    setSelectedRoom(state.selectedRoom);
    setColors(state.colors);
    setHistoryIndex(nextIndex);
    showToast(<Redo2 size={14} className="text-[var(--color-primary)]" />, 'Redone');
  }, [history, historyIndex, showToast]);

  // "Start from original" — wipes the canvas back to the uploaded photo while
  // pushing a marker into history so users can still undo back to the stacked
  // result if they change their mind. editHistory gets a 'reset' entry.
  const handleStartFromOriginal = useCallback(() => {
    if (!generatedImage) return;
    // F7: snapshot for undo
    const snapshotImage = generatedImage;
    const snapshotMask = maskImage;
    const snapshotSessionId = sessionQueue[sessionIndex]?.id;
    // Push current state into history first so undo returns to it
    pushToHistory();
    setGeneratedImage(null);
    setMaskImage(null);
    if (snapshotSessionId) {
      setSessionQueue(prev => prev.map(s =>
        s.id === snapshotSessionId ? { ...s, editHistory: [...s.editHistory, 'reset'] } : s
      ));
    }
    showToast(
      <RefreshCcw size={14} className="text-[var(--color-primary)]" />,
      'Reset to original',
      {
        durationMs: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            setGeneratedImage(snapshotImage);
            setMaskImage(snapshotMask);
            if (snapshotSessionId) {
              setSessionQueue(prev => prev.map(s =>
                s.id === snapshotSessionId
                  ? { ...s, editHistory: s.editHistory.slice(0, -1) }
                  : s
              ));
            }
          },
        },
      }
    );
  }, [generatedImage, maskImage, pushToHistory, sessionQueue, sessionIndex, showToast]);

  // "Commit & Continue" — promotes the current stacked result to the new base
  // (originalImage). Resets the chain so future edits anchor on a fresh, lossless
  // PNG rather than accumulating diffusion drift. Triggered automatically after
  // the chain cap (3 passes) to match Google's own guidance to restart after
  // iterative drift becomes visible.
  const handleCommitAndContinue = useCallback(() => {
    if (!generatedImage) return;
    // F7: snapshot for undo
    const priorOriginal = originalImage;
    const snapshotImage = generatedImage;
    const snapshotMask = maskImage;
    const snapshotSessionId = sessionQueue[sessionIndex]?.id;
    pushToHistory();
    setOriginalImage(generatedImage);
    setGeneratedImage(null);
    setMaskImage(null);
    if (snapshotSessionId) {
      setSessionQueue(prev => prev.map(s =>
        s.id === snapshotSessionId
          ? { ...s, originalImage: generatedImage!, editHistory: [...s.editHistory, 'commit'] }
          : s
      ));
    }
    // F7+F8: confirm with 6s Undo toast
    showToast(
      <Check size={14} className="text-[#30D158]" />,
      'Committed as new base',
      {
        durationMs: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            setOriginalImage(priorOriginal);
            setGeneratedImage(snapshotImage);
            setMaskImage(snapshotMask);
            if (snapshotSessionId) {
              setSessionQueue(prev => prev.map(s =>
                s.id === snapshotSessionId
                  ? {
                      ...s,
                      originalImage: priorOriginal ?? s.originalImage,
                      editHistory: s.editHistory.slice(0, -1),
                    }
                  : s
              ));
            }
          },
        },
      }
    );
  }, [generatedImage, originalImage, maskImage, pushToHistory, sessionQueue, sessionIndex, showToast]);

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
  const handleGenerate = async (prompt: string, opts?: { fromPack?: boolean }) => {
    if (!originalImage) return;

    if (!subscription.canGenerate) {
      // R7: show a named-value toast before the upgrade modal, so the user
      // understands what hit them (free cap) and what the two next moves are.
      showToast(
        <Crown size={14} className="text-[#FFD60A]" />,
        "You've staged 3 rooms today. That's the free cap.",
        {
          durationMs: 6000,
          action: { label: 'Upgrade', onClick: () => setShowUpgradeModal(true) },
        },
      );
      return;
    }


    // Capture which session this generation belongs to
    const generatingSessionId = sessionQueue[sessionIndex]?.id || '__single__';

    // F16 — Mobile: auto-close sheet on Generate.
    // On <lg viewports the mobile-control-sheet otherwise covers ~45vh of the
    // canvas, blocking the user from seeing the progress overlay. We stash the
    // prior state so we can reopen only if the user had it open.
    const sheetWasOpen = sheetOpen;
    const isMobileViewport =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    if (isMobileViewport && sheetWasOpen) {
      setSheetOpen(false);
    }

    setIsGenerating(true);
    startGenerationTimer();
    generatingSessionsRef.current.add(generatingSessionId);

    // F9: wire a per-session AbortController so the user can cancel this
    // specific generation without killing siblings.
    const abortController = new AbortController();
    // Replace any stale controller on the same session (shouldn't happen but is safe).
    generationAbortersRef.current.get(generatingSessionId)?.abort();
    generationAbortersRef.current.set(generatingSessionId, abortController);

    try {
      lastPromptRef.current = prompt;
      console.log('[StudioAI] Generation prompt:', prompt);

      // Stacking architecture:
      // - Text prompts and cleanup build on the current result ("source of state").
      // - Style packs always replace (restart from original) — compounding two full
      //   room styles produces incoherent output.
      // - ?chain=1 upgrades text-stacking to multi-image anchor mode: Gemini receives
      //   BOTH the original (anchor for pixel fidelity) AND the current result (state),
      //   with explicit role labels. This kills generational drift — every generation
      //   anchors back to the original photo, so 5 stacked edits look as clean as 1.
      // - ?stack=1 kept for backward-compat: text stacks but without the anchor.
      // Chain mode is now default-ON for all users. The anchor + PNG preservation
      // + commit-at-depth-3 architecture is always applied to text and cleanup
      // stacking. `?chain=0` or `?stack=0` can opt out for testing.
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const optOut = params.get('chain') === '0' || params.get('stack') === '0';
      const chainEnabled = !optOut;
      const stackEnabled = !optOut;
      const fromPack = opts?.fromPack === true;
      const cleanupStack = activePanel === 'cleanup' && generatedImage;
      const shouldStack = !fromPack && ((stackEnabled && generatedImage) || cleanupStack);
      const sourceImage = shouldStack ? generatedImage : originalImage;
      // When chain mode is on AND we're stacking, pass the original as an anchor
      // so Gemini can preserve pixel fidelity on unchanged regions.
      // EXCEPTION: cleanup uses masked pixel edits against the current canvas —
      // sending an anchor + mask together confuses Gemini about which image the
      // mask coordinates apply to. Let cleanup keep its current single-image flow.
      const isCleanup = activePanel === 'cleanup';
      const anchorImage = (chainEnabled && shouldStack && !isCleanup) ? originalImage : null;

      // Intent classifier: certain edit intents trigger Gemini to re-stage the whole
      // room when the user only wanted a small tweak. We detect those intents and
      // wrap the prompt with ZERO-TOLERANCE preservation preambles BEFORE handing
      // it to the outer template.
      //
      // Two categories today:
      //   - lighting — "make it evening", "warmer", "sunset"
      //   - spatial  — "move the chair", "turn the bed", "reposition the lamp"
      // Both fail the same way without this guard: Gemini reads the directive as
      // "this should be the new scene" and deletes/replaces everything else.
      const lightingKeywords = /\b(evening|dusk|twilight|night|nighttime|dawn|morning light|golden hour|sunset|sunrise|brighter|dimmer|darker|warmer|cooler|moody|dramatic lighting|soft light|soft lighting|sunny|overcast|cloudy|sky|lighter|ambient|bright light|mood lighting|lighting|relight|relit)\b/i;
      const spatialMoveKeywords = /\b(move|shift|slide|relocate|reposition|place|put|turn|rotate|angle|flip|face|pivot)\b/i;
      const structuralKeywords = /\b(add|remove|delete|swap|change.*(bed|chair|sofa|couch|table|rug|lamp|light fixture|dresser|nightstand|furniture|decor|art|mirror|plant)|stage|re-?stage|different|new furniture|restyle|redecorate)\b/i;
      const isLightingOnly = lightingKeywords.test(prompt) && !structuralKeywords.test(prompt) && !spatialMoveKeywords.test(prompt);
      const isSpatialMove = !isLightingOnly && spatialMoveKeywords.test(prompt) && !structuralKeywords.test(prompt);
      let effectivePrompt = prompt;
      if (isLightingOnly) {
        effectivePrompt = `LIGHTING-ONLY EDIT — ZERO TOLERANCE FOR STRUCTURAL CHANGE.
You are adjusting ambient light, color temperature, and/or sky only. You are NOT restaging, redecorating, or changing any furniture.

ABSOLUTE PROHIBITIONS:
- Do NOT add any new furniture, decor, plants, artwork, pillows, rugs, lamps, or objects.
- Do NOT remove, move, swap, resize, or replace ANY existing furniture or decor.
- Do NOT change wall colors, paint, floors, rugs, textures, or materials.
- Do NOT alter architecture, windows, doors, ceiling, or fixtures.
- Count the furniture in the input. The output must have the EXACT same items in the EXACT same positions.

Allowed changes ONLY:
- Ambient light direction, warmth, and intensity
- Shadow length, softness, and direction (matching new light source)
- Window brightness and sky visible through windows
- Turning on or off lamps/fixtures that ALREADY EXIST in the photo
- Subtle warm glow on existing surfaces consistent with the new lighting

Direction from user: ${prompt}`;
        console.log('[StudioAI] Lighting-only intent detected — using zero-tolerance preamble.');
      } else if (isSpatialMove) {
        effectivePrompt = `SPATIAL MOVE EDIT — ZERO TOLERANCE FOR LOSS OF OTHER ITEMS.
You are relocating/rotating the SPECIFIC item(s) the user named. Every OTHER item in the scene must stay pixel-identical in the same position, same style, same materials.

ABSOLUTE PROHIBITIONS:
- Do NOT delete, replace, or restyle any furniture, decor, art, lamps, rugs, pillows, bedding, plants, or objects that the user did not name.
- Do NOT "re-stage the room" — this is a small targeted move of a named item, not a new staging pass.
- Do NOT change wall colors, floors, windows, doors, lighting, or architecture.
- Do NOT add any new items.
- Count the items in the input image. The output must have the EXACT same count, minus any already-moved items which reappear in the new position.

Allowed changes ONLY:
- The named item(s) move to the described new location with realistic contact shadows at the new spot.
- The original location where the item used to sit should now show the floor/wall/surface that was beneath it (reveal, don't replace).

Direction from user: ${prompt}`;
        console.log('[StudioAI] Spatial-move intent detected — using preservation preamble.');
      }

      const rawResults = await withTimeout(
        generateRoomDesign(
          sourceImage,
          effectivePrompt,
          activePanel === 'cleanup' ? maskImage : null,
          false,
          1,
          subscription.plan === 'pro',
          anchorImage,
          abortController.signal
        ),
        120000,
        'Generation timed out — please try again'
      );

      // Sharpen AI output to counteract diffusion softness.
      // In chain mode, keep PNG (lossless) so the next pass doesn't amplify
      // JPEG artifacts into texture smoothing.
      const sharpenFormat: 'png' | 'jpeg' = chainEnabled ? 'png' : 'jpeg';
      const sharpened = await Promise.all(rawResults.map(img => sharpenImage(img, 0.4, 1, sharpenFormat)));

      // Phase C: mask + composite.
      // Prompts alone can't prevent Gemini from re-rendering unchanged regions
      // and softening their textures — even on a first-gen surgical edit like
      // "remove sign from yard" Gemini touches the entire frame. We diff the
      // new output against the source, build a feathered mask of what changed,
      // and composite so unchanged pixels come BYTE-IDENTICAL from the source.
      // Runs on every non-pack generation; the composite's built-in thresholds
      // (>95% change → bail to raw, <0.1% → bail) naturally handle full-stage
      // vs surgical-edit cases without us classifying upfront. Packs are
      // excluded because they intentionally repaint the full scene.
      //
      // ALSO excluded: restage-with-removal prompts ("remove the old furniture
      // and add X"). These keep cluttered pixels in roughly the same color
      // so pixelmatch flags them as unchanged, letting the original clutter
      // ghost through the new furniture. Auto-detected by pairing remove-verbs
      // with add-verbs; trust Gemini's raw output upscaled instead.
      const removeAddKeywords = /\b(remove|clear|take out|get rid of|strip|empty|replace|swap).{0,40}\b(add|stage|place|put|new|furnish|include)\b|\b(restage|re-?stage|redecorate|refurnish)\b/i;
      const isRestageWithRemoval = removeAddKeywords.test(prompt);
      const shouldComposite = !fromPack && !isRestageWithRemoval && sourceImage;
      if (isRestageWithRemoval) {
        console.log('[StudioAI] Restage-with-removal intent — skipping composite to avoid ghosting.');
      }
      const resultImages = shouldComposite
        ? await Promise.all(
            sharpened.map(img =>
              compositeStackedEdit(sourceImage, img, { format: sharpenFormat }).catch(err => {
                console.warn('[StudioAI] composite failed, falling back to raw output:', err);
                return img;
              })
            )
          )
        : sharpened;

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
        stopGenerationTimer();
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
          stopGenerationTimer();
        }
      }

      subscription.recordGeneration();
    } catch (error: any) {
      // R11: actionable error toasts — probable cause, next step, inline Retry.
      // Retry re-runs handleGenerate with the exact prompt + opts that failed.
      const retryAction = {
        label: 'Retry',
        onClick: () => { void handleGenerate(prompt, opts); },
      };
      if (error.message === 'ABORTED' || error.name === 'AbortError' || abortController.signal.aborted) {
        // F9: user-initiated cancel. Show a muted confirmation, don't log an error.
        showToast(<X size={14} className="text-[var(--color-text)]" />, 'Generation cancelled');
      } else if (error.message?.includes('timed out')) {
        showToast(
          <X size={14} className="text-[#FF375F]" />,
          "This room's taking longer than usual — usually a busy-scene problem. Try cropping tighter, then retry.",
          { durationMs: 6000, action: retryAction },
        );
      } else if (
        error.message === 'API_KEY_REQUIRED' ||
        error.message?.includes('Requested entity was not found') ||
        error.message?.toLowerCase().includes('api key') ||
        error.message?.includes('API_KEY_INVALID')
      ) {
        showToast(
          <X size={14} className="text-[#FF375F]" />,
          "Staging service is offline right now. We're on it — try again in a minute.",
          { durationMs: 6000, action: retryAction },
        );
      } else {
        showToast(
          <X size={14} className="text-[#FF375F]" />,
          "Staging didn't finish. Usually a connection hiccup — retry should do it.",
          { durationMs: 6000, action: retryAction },
        );
      }
      setIsGenerating(false);
      stopGenerationTimer();
    } finally {
      generatingSessionsRef.current.delete(generatingSessionId);
      // F9: clean up the AbortController for this session
      if (generationAbortersRef.current.get(generatingSessionId) === abortController) {
        generationAbortersRef.current.delete(generatingSessionId);
      }
      // F16 — reopen sheet on completion (mobile only + if it was open before).
      // Also guard against the user having manually opened/closed the sheet while
      // the generation was in flight — we only restore when it is currently closed.
      if (isMobileViewport && sheetWasOpen) {
        setSheetOpen(true);
      }
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

      const rawResults = await withTimeout(
        generateRoomDesign(generatedImage, removalPrompt, maskDataUrl, false, 1, subscription.plan === 'pro'),
        120000,
        'Furniture removal timed out — please try again'
      );
      // Chain mode default-on — PNG preserved unless opted out via ?chain=0
      const chainOptOut = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('chain') === '0';
      const resultImages = await Promise.all(rawResults.map(img => sharpenImage(img, 0.4, 1, chainOptOut ? 'jpeg' : 'png')));
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
    } catch (error: any) {
      console.error('Furniture removal failed:', error);
      // R11: probable-cause + next-step error copy with inline Retry.
      const retryAction = {
        label: 'Retry',
        onClick: () => { void handleFurnitureRemoval(maskDataUrl, itemDescriptions); },
      };
      if (error.message?.includes('timed out')) {
        showToast(
          <X size={14} className="text-[#FF375F]" />,
          "Removal is taking longer than usual. Try a smaller mask or retry.",
          { durationMs: 6000, action: retryAction },
        );
      } else {
        showToast(
          <X size={14} className="text-[#FF375F]" />,
          "Removal didn't finish. Usually a connection issue — retry should do it.",
          { durationMs: 6000, action: retryAction },
        );
      }
    } finally {
      setIsRemovingFurniture(false);
    }
  };

  // Re-encode the working-state image to high-quality JPEG for export.
  // The in-app pipeline stores PNG (chain mode keeps it lossless between stacks
  // to avoid the JPEG→Gemini→JPEG compression spiral), but that PNG is 20-30MB
  // for a full-res staged photo. For human/MLS consumption we want a crisp
  // JPEG at a reasonable size. 0.95 quality is visually indistinguishable from
  // lossless but keeps file size materially closer to the original input JPEG
  // (0.92 was too aggressive — users saw sub-MB exports from multi-MB inputs).
  const handleDownload = async () => {
    if (!generatedImage) return;
    try {
      const exportJpeg = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas context unavailable'));
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = generatedImage;
      });
      const link = document.createElement('a');
      link.href = exportJpeg;
      link.download = `studio_export_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('[StudioAI] export re-encode failed, falling back to raw:', err);
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `studio_export_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
      showToast(<BookmarkPlus size={14} className="text-[var(--color-primary)]" />, 'Design saved');
    } catch {
      showToast(<X size={14} className="text-[#FF375F]" />, 'Failed to save');
    }
  };

  // F7: Refresh / Start-over with snapshot-and-undo.
  // Moved to later in the file (inside a useCallback after removeFromSession).
  // Kept as a placeholder so ordering dependents still type-check; the real
  // implementation is the useCallback below that captures removeFromSession.
  // — removed stale feedback-checkpoint refs which no longer exist.
  // Define after removeFromSession so it can depend on it.

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
    setBatchResults(null);
  };

  // Open a single result in the editor WITHOUT dropping the batch. batchImages
  // and batchResults stay populated so the "← Back to Batch" button in the
  // editor header can restore the grid view without re-processing.
  const handleBatchLoadImage = (original: string, generated: string) => {
    setOriginalImage(original);
    setGeneratedImage(generated);
    setHistory([{ generatedImage: generated, stagedFurniture: [], selectedRoom, colors: [] }]);
    setHistoryIndex(0);
    setMaskImage(null);
  };

  // "← Back to Batch" — clears editor state, restores BatchProcessor view.
  // Component remounts and restores from batchResults via initialResults prop.
  const handleBackToBatch = () => {
    setOriginalImage(null);
    setGeneratedImage(null);
    setMaskImage(null);
    setHistory([]);
    setHistoryIndex(-1);
    setSessionQueue([]);
    setSessionIndex(-1);
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

    // F8: silent-success toast on nav
    showToast(
      direction === 'next'
        ? <ChevronRight size={14} className="text-[var(--color-primary)]" />
        : <ChevronLeft size={14} className="text-[var(--color-primary)]" />,
      `Photo ${newIndex + 1} of ${sessionQueue.length}`
    );
  }, [sessionIndex, sessionQueue, saveCurrentSession, loadSession, showToast]);

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

  // F7: Refresh / Start-over handler with snapshot-and-undo.
  // Before blowing away the canvas state, we capture enough to rebuild it
  // and surface a 6s "Undo" toast that restores the previous session queue.
  const handleRefresh = useCallback(() => {
    const priorQueue = sessionQueue;
    const priorIndex = sessionIndex;
    const priorOriginal = originalImage;
    const priorGenerated = generatedImage;
    const priorMask = maskImage;
    const priorHistory = history;
    const priorHistoryIndex = historyIndex;
    const priorSelectedRoom = selectedRoom;
    const priorDetectedRoom = detectedRoom;
    const priorColors = colors;
    const priorStageMode = stageMode;

    if (sessionQueue.length > 1) {
      removeFromSession(sessionIndex);
    } else {
      setOriginalImage(null);
      setGeneratedImage(null);
      setSessionQueue([]);
      setSessionIndex(-1);
    }
    setStageMode('text');

    const labelText = priorQueue.length > 1 ? 'Photo removed' : 'Canvas cleared';
    showToast(
      <RefreshCcw size={14} className="text-[var(--color-primary)]" />,
      labelText,
      {
        durationMs: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            setSessionQueue(priorQueue);
            setSessionIndex(priorIndex);
            setOriginalImage(priorOriginal);
            setGeneratedImage(priorGenerated);
            setMaskImage(priorMask);
            setHistory(priorHistory);
            setHistoryIndex(priorHistoryIndex);
            setSelectedRoom(priorSelectedRoom);
            setDetectedRoom(priorDetectedRoom);
            setColors(priorColors);
            setStageMode(priorStageMode);
          },
        },
      }
    );
  }, [
    sessionQueue,
    sessionIndex,
    originalImage,
    generatedImage,
    maskImage,
    history,
    historyIndex,
    selectedRoom,
    detectedRoom,
    colors,
    stageMode,
    removeFromSession,
    showToast,
  ]);

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
    id: 'tools' | 'cleanup' | 'history' | 'settings' | 'mls' | 'listing' | 'social';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
      { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={20} />, available: true },
      { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={20} />, available: true },
      { id: 'mls', label: 'MLS Export', icon: <Download size={20} />, available: true },
      { id: 'listing', label: 'Description', icon: <FileText size={20} />, available: true },
      { id: 'social', label: 'Social Pack', icon: <Share2 size={20} />, available: true },
      { id: 'history', label: 'History', icon: <HistoryIcon size={20} />, available: true },
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
              <span className="hidden sm:inline">Stage 3 rooms free</span>
              <span className="sm:hidden">Stage 3 free</span>
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
                Upload a photo. Get it staged, de-cluttered, or twilight-converted before your seller meeting. Cancel physical staging.
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
                  Stage 3 rooms free
                </button>
                <a href="#pricing" className="inline-flex items-center px-7 py-3.5 rounded-xl text-sm font-semibold text-zinc-400 border border-white/[0.08] hover:border-white/[0.16] hover:text-white transition-all">
                  See Pricing
                </a>
              </div>

              <div className="flex gap-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {[{ value: '3/day', label: 'Free generations' }, { value: '~15s', label: 'Per render' }, { value: '12+', label: 'Styles' }].map((s) => (
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
                  Stage 3 rooms free
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
                  Stage 3 rooms free
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
                  a: 'Yes — every account gets 3 free generations per day. No credit card required. Just sign in with Google and start uploading photos.',
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
              One staging service costs more than a year of StudioAI.
            </h2>
            <p className="text-base text-zinc-400 mb-10 max-w-xl mx-auto">
              $29/mo covers every listing. Cancel the month you stop listing.
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

      {/* Quick Start Tutorial — R8: fire AFTER the first upload, not first visit.
          `firstUpload` toggles true once an originalImage exists, which the
          tutorial guards behind its own storage-key check. */}
      <QuickStartTutorial
        forceShow={showTutorial}
        firstUpload={Boolean(originalImage)}
        onClose={() => setShowTutorial(false)}
      />

      {showExportModal && generatedImage && (
        <ExportModal
          imageBase64={generatedImage}
          originalImage={originalImage || undefined}
          editHistory={sessionQueue[sessionIndex]?.editHistory || []}
          onClose={() => setShowExportModal(false)}
          onShare={handleShareToGallery}
          brandKit={brandKit}
        />
      )}

      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in"
          onClick={upgradeModal.dialogProps.onOverlayClick}
        >
          <div
            ref={upgradeModal.dialogProps.ref}
            role={upgradeModal.dialogProps.role}
            aria-modal={upgradeModal.dialogProps['aria-modal']}
            aria-labelledby={upgradeModal.dialogProps['aria-labelledby']}
            tabIndex={upgradeModal.dialogProps.tabIndex}
            onKeyDown={upgradeModal.dialogProps.onKeyDown}
            className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in focus:outline-none"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${referralPrice ? 'bg-[rgba(255,214,10,0.15)] text-[#FFD60A]' : 'bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)]'}`}>
                  <Crown size={22} />
                </div>
                <div>
                  <h2 id={upgradeModal.titleId} className="font-display text-xl font-bold text-white">Unlimited listings, forever.</h2>
                  <p className="text-xs text-zinc-400">
                    {referralPrice ? 'Referred — rate locked forever' : 'One price. Every tool. No per-photo math.'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowUpgradeModal(false)} aria-label="Close upgrade dialog" className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-[var(--color-bg)]">
                <X size={16} />
              </button>
            </div>
            <div className={`mb-4 rounded-xl border p-4 ${referralPrice ? 'border-[#FFD60A]/30 bg-[#FFD60A]/[0.06]' : 'border-[rgba(10,132,255,0.3)] bg-[rgba(10,132,255,0.08)]'}`}>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-white">${referralPrice ? (referralPrice / 100).toFixed(0) : '49'}</span>
                <span className="text-sm text-zinc-400">/month</span>
                {!referralPrice && <span className="text-[11px] text-zinc-500 ml-2">or $39/mo billed annually</span>}
              </div>
              {referralPrice && referralCode && (
                <p className="text-[10px] text-[#FFD60A] font-semibold">Referral code {referralCode} applied — locked forever</p>
              )}
              <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
                Less than $0.05 per staged photo at typical use. Stage 12 listings a month and you've paid for the year.
              </p>
            </div>

            {/* Feature bullets — reinforces "every tool" */}
            <ul className="mb-6 space-y-2 text-[12px] text-zinc-300">
              {[
                'Unlimited staging, cleanup, day-to-dusk, sky, virtual reno',
                'Batch processing — upload a full listing at once',
                'Custom-logo watermark + MLS-ready exports',
                'Priority rendering + community showcase access',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={13} className="text-[#30D158] mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

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
              <CreditCard size={16} /> {referralPrice ? `Start Pro — $${(referralPrice / 100).toFixed(0)}/mo` : 'Start Pro — $49/mo'}
            </button>
            <p className="mt-3 text-center text-[10px] text-zinc-500">Cancel anytime. Early Bird + current Pro rates honored per grandfathering. Powered by Stripe.</p>

            {/* Credit Packs Alternative */}
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 text-center mb-3">Or buy credits — no subscription</p>
              <div className="space-y-2">
                {[
                  { id: 'starter' as const, name: '10 Credits', price: '$15', per: '$1.50/image' },
                  { id: 'pro_pack' as const, name: '25 Credits', price: '$29', per: '$1.16/image' },
                  { id: 'agency' as const, name: '75 Credits', price: '$69', per: '$0.92/image' },
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
        <div
          className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in overflow-y-auto"
          onClick={accessPanelModal.dialogProps.onOverlayClick}
        >
          <div
            ref={accessPanelModal.dialogProps.ref}
            role={accessPanelModal.dialogProps.role}
            aria-modal={accessPanelModal.dialogProps['aria-modal']}
            aria-labelledby={accessPanelModal.dialogProps['aria-labelledby']}
            tabIndex={accessPanelModal.dialogProps.tabIndex}
            onKeyDown={accessPanelModal.dialogProps.onKeyDown}
            className="modal-panel w-full max-w-md rounded-2xl p-6 animate-scale-in my-8 focus:outline-none"
          >
            <div className="flex items-start justify-between mb-5">
              <h3 id={accessPanelModal.titleId} className="font-display text-xl font-bold">Profile & Settings</h3>
              <button
                type="button"
                onClick={() => setShowAccessPanel(false)}
                aria-label="Close profile panel"
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
              <BrandKit
                onSaved={() =>
                  showToast(<Check size={14} className="text-[#30D158]" />, 'Brand kit saved')
                }
              />
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
                      <CreditCard size={14} /> Manage Billing
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
                      <Crown size={14} /> Upgrade to Pro
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
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      )}

      <header className="shrink-0 bg-black border-b border-white/[0.06] px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 relative z-50">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0 pr-4 border-r border-[var(--color-border-strong)]">
            <div className="bg-black border border-[var(--color-primary)] shadow-md flex h-10 w-10 items-center justify-center rounded-xl">
              <Camera size={18} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="font-display text-xl font-black leading-none whitespace-nowrap text-white tracking-tight">
              Studio<span className="text-[var(--color-primary)] drop-shadow-md">AI</span>
            </h1>
          </div>

          {originalImage && batchImages && batchResults && batchResults.length > 1 && (
            <>
              <div className="hidden sm:block h-5 w-px bg-[var(--color-border)]" />
              <button
                type="button"
                onClick={handleBackToBatch}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/20 transition"
                title="Return to batch results"
              >
                ← Batch ({batchResults.filter(r => r.status === 'done').length})
              </button>
            </>
          )}

          {originalImage && (
            <>
              <div className="hidden sm:block h-5 w-px bg-[var(--color-border)]" />
              <div className="hidden sm:flex items-center gap-0.5">
                <Tip label="Undo (Ctrl+Z)">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={historyIndex <= 0 || isGenerating}
                    className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                    aria-label="Undo (Ctrl+Z)"
                  >
                    <Undo2 size={16} />
                  </button>
                </Tip>
                <Tip label="Redo (Ctrl+Y)">
                  <button
                    type="button"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1 || isGenerating}
                    className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                    aria-label="Redo (Ctrl+Y)"
                  >
                  <Redo2 size={16} />
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
                      className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                      aria-label="Previous photo"
                      title="Previous photo"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[10px] font-bold text-[var(--color-text)]/70 tabular-nums min-w-[2rem] text-center">
                      {sessionIndex + 1}/{sessionQueue.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateSession('next')}
                      disabled={sessionIndex >= sessionQueue.length - 1}
                      className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-text)] transition hover:bg-[var(--color-bg)] disabled:opacity-30"
                      aria-label="Next photo"
                      title="Next photo"
                    >
                      <ChevronRight size={16} />
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
                    <Download size={14} />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </Tip>
                <Tip label="Save to your render history">
                  <button
                    type="button"
                    onClick={handleSaveStage}
                    className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    {savedStages.some(s => s.generatedImage === generatedImage) ? (
                      <Bookmark size={14} className="fill-[var(--color-primary)] text-[var(--color-primary)]" />
                    ) : (
                      <BookmarkPlus size={14} />
                    )}
                    <span className="hidden sm:inline">Save</span>
                  </button>
                </Tip>
                <label className="cta-secondary rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer">
                  <Plus size={14} />
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
                <Crown size={12} />
                Pro
              </span>
            )}
            <div className="h-5 w-px bg-[var(--color-border)] mx-0.5" />
            {/* Refresh / Help: visible on sm+, folded into overflow menu on mobile (F17) */}
            <button
              type="button"
              onClick={handleRefresh}
              className="hidden sm:inline-flex rounded-lg p-1.5 min-h-[44px] min-w-[44px] items-center justify-center text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title={sessionQueue.length > 1 ? "Remove this photo" : "Start over"}
              aria-label={sessionQueue.length > 1 ? "Remove this photo" : "Start over"}
            >
              <RefreshCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowTutorial(true)}
              className="hidden sm:inline-flex rounded-lg p-1.5 min-h-[44px] min-w-[44px] items-center justify-center text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
              title="Quick start guide"
              aria-label="Open quick start guide"
            >
              <HelpCircle size={16} />
            </button>
            {/* Mobile overflow menu (<sm): Undo / Redo / Refresh / Help (F17) */}
            <div ref={overflowMenuRef} className="sm:hidden relative">
              <button
                type="button"
                onClick={() => setShowOverflowMenu(v => !v)}
                className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
                aria-label="More actions"
                aria-expanded={showOverflowMenu}
                aria-haspopup="menu"
                title="More"
              >
                <MoreHorizontal size={18} />
              </button>
              {showOverflowMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] shadow-xl p-1 z-50 animate-slide-down"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { undo(); setShowOverflowMenu(false); }}
                    disabled={historyIndex <= 0 || isGenerating}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[44px] text-left text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <Undo2 size={16} /> Undo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { redo(); setShowOverflowMenu(false); }}
                    disabled={historyIndex >= history.length - 1 || isGenerating}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[44px] text-left text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <Redo2 size={16} /> Redo
                  </button>
                  <div className="my-1 h-px bg-[var(--color-border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { handleRefresh(); setShowOverflowMenu(false); }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[44px] text-left text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition"
                  >
                    <RefreshCcw size={16} /> {sessionQueue.length > 1 ? "Remove this photo" : "Start over"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowOverflowMenu(false); setShowTutorial(true); }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[44px] text-left text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition"
                  >
                    <HelpCircle size={16} /> Quick start guide
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="rounded-full overflow-hidden h-11 w-11 ring-2 ring-[var(--color-border)] hover:ring-[var(--color-primary)] transition-all"
              title={googleUser.name}
              aria-label="Open account panel"
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
                <Crown size={12} />
                Pro
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="rounded-full overflow-hidden h-8 w-8 ring-2 ring-[var(--color-border)] hover:ring-[var(--color-primary)] transition-all"
              title={googleUser.name}
              aria-label="Open account panel"
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
              initialResults={batchResults ?? undefined}
              onResultsChange={setBatchResults}
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
                Try a Demo
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
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'
                  }`}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
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
                <div className="relative overflow-hidden rounded-[10px] sm:rounded-[14px] bg-black aspect-[4/3] border border-[var(--color-border-strong)]">
                  {/* EditingBadge rendered inline next to the room picker below (see left-2.5 top-2.5 flex row)
                      so the two don't stack or have overlapping dropdowns. */}
                  {isGenerating && (
                    <div role="status" aria-live="polite" aria-label="Generating design" className="absolute inset-0 z-10 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="text-center space-y-4 w-full max-w-md px-6 pointer-events-none">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--color-primary-dark)] bg-black shadow-lg">
                          <BrainCircuit size={18} className="text-[var(--color-primary)] animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                            {activePanel === 'cleanup' ? 'Cleaning up your room' : 'Staging your room'}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--color-text)]/50 tabular-nums">
                            {Math.floor(generationElapsed / 60)}:{String(generationElapsed % 60).padStart(2, '0')}
                          </span>
                        </div>
                        <div className="text-center space-y-2 relative h-16 w-full mask-linear-gradient-bottom">
                          {activePanel === 'cleanup' ? (
                            <>
                              <p className="text-xs text-white/50 typing-effect">Reading what to remove…</p>
                              <p className="text-xs text-white/70 typing-effect" style={{animationDelay: '0.8s'}}>Rebuilding the surface behind it…</p>
                              <p className="text-xs font-medium text-white typing-effect" style={{animationDelay: '1.6s'}}>Matching your lighting</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-white/50 typing-effect">Measuring the room…</p>
                              <p className="text-xs text-white/70 typing-effect" style={{animationDelay: '0.8s'}}>Placing furniture that fits…</p>
                              <p className="text-xs font-medium text-white typing-effect" style={{animationDelay: '1.6s'}}>Matching your lighting</p>
                            </>
                          )}
                        </div>
                      </div>
                      {/* F9: Cancel button — sits OUTSIDE the pointer-events-none wrapper */}
                      <button
                        type="button"
                        onClick={cancelCurrentGeneration}
                        className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-[var(--color-error)] text-white border border-[var(--color-error)] hover:opacity-90 active:scale-95 transition-all shadow-lg"
                        aria-label="Cancel generation"
                      >
                        <X size={14} />
                        Cancel
                      </button>
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

                  <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-2">
                    <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowRoomPicker((prev) => !prev)}
                      className="pill-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium"
                    >
                      {detectedRoom ? (
                        <>
                          <BrainCircuit size={14} className="text-[var(--color-primary)]" />
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
                      <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] shadow-lg p-1 animate-slide-down z-30">
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
                    {originalImage && (() => {
                      const hist = sessionQueue[sessionIndex]?.editHistory || [];
                      const lastBreak = Math.max(hist.lastIndexOf('reset'), hist.lastIndexOf('commit'));
                      const chainDepth = hist.length - (lastBreak + 1);
                      const chainCapped = chainDepth >= 3;
                      return (
                        <EditingBadge
                          hasResult={!!generatedImage}
                          versionCount={hist.length}
                          editHistory={hist}
                          chainDepth={chainDepth}
                          chainCapped={chainCapped}
                          onStartOver={handleStartFromOriginal}
                          onCommitAndContinue={handleCommitAndContinue}
                          onOpenHistory={() => setActivePanel('history')}
                        />
                      );
                    })()}
                  </div>

                  {/* Top-right pill reserved for Mask Mode only. "Generating" has the center
                      overlay; "Detecting Room" already shows in the left-side room picker pill. */}
                  {!isGenerating && !isAnalyzing && activePanel === 'cleanup' && (
                  <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/80 border border-[rgba(10,132,255,0.3)] shadow-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0A84FF] backdrop-blur-xl">
                    <span className="status-dot bg-[#0A84FF] shadow-md" />
                    Mask Mode
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
                    <div className="py-10 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-[var(--color-text)]/60">
                        <ImageIcon size={20} />
                      </div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">Nothing staged yet.</p>
                      <p className="mt-1 text-xs text-[var(--color-text)]/60">Your saved results will live here — one per version.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {history.filter(h => h.generatedImage).map((state, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setGeneratedImage(state.generatedImage); setSelectedRoom(state.selectedRoom); setColors(state.colors); }}
                          className="group relative rounded-lg overflow-hidden border border-[var(--color-border)] aspect-[4/3] hover:ring-2 hover:ring-[var(--color-primary)] transition-all"
                          aria-label={`Restore render ${i + 1}`}
                        >
                          <img src={state.generatedImage!} alt={`Render ${i + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
                    <p className="text-sm text-[var(--color-text)] py-8 text-center">No saved stages. Use <BookmarkPlus size={14} className="inline-block mx-0.5 mb-0.5" /> to save designs.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {savedStages.map((stage) => (
                        <div key={stage.id} className="group relative rounded-lg overflow-hidden border border-[var(--color-border)] aspect-[4/3] hover:ring-2 hover:ring-[var(--color-primary)] transition-all">
                          <img src={stage.generatedImage} alt={stage.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex flex-col justify-end p-1.5 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={() => { setGeneratedImage(stage.generatedImage); setOriginalImage(stage.originalImage); }}
                              className="cta-primary rounded-md py-1 text-xs font-medium w-full mb-1"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => {
                                // F7: snapshot for undo
                                const deletedStage = stage;
                                const prior = savedStages;
                                const updated = savedStages.filter(s => s.id !== stage.id);
                                setSavedStages(updated);
                                localStorage.setItem('realestate_ai_stages', JSON.stringify(updated));
                                showToast(
                                  <Trash2 size={14} className="text-[#FF375F]" />,
                                  'Saved stage deleted',
                                  {
                                    durationMs: 6000,
                                    action: {
                                      label: 'Undo',
                                      onClick: () => {
                                        setSavedStages(prior);
                                        try {
                                          localStorage.setItem('realestate_ai_stages', JSON.stringify(prior));
                                        } catch { /* restore best-effort */ }
                                      },
                                    },
                                  }
                                );
                                // Silence unused warning
                                void deletedStage;
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
                      onGenerate={(p, o) => handleGenerate(p, o)}
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

                    {/* Selective Removal — only show after a generation */}
                    {generatedImage && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                        <button
                          type="button"
                          onClick={() => setShowFurnitureRemover(true)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-white/[0.02] hover:border-[#FF375F]/30 hover:bg-[#FF375F]/5 transition-all group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-[#FF375F]/10 flex items-center justify-center group-hover:bg-[#FF375F]/20 transition-colors">
                            <Trash2 size={16} className="text-[#FF375F]" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-white">Selective Removal</p>
                            <p className="text-[10px] text-zinc-500">Paint over items to remove them</p>
                          </div>
                        </button>
                      </div>
                    )}
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

                {activePanel === 'mls' && (
                  <MLSExport
                    images={
                      sessionQueue.length > 0
                        ? sessionQueue
                            .filter(s => s.generatedImage)
                            .map(s => ({
                              id: s.id,
                              source: s.generatedImage!,
                              label: s.selectedRoom || 'Room',
                              roomType: s.selectedRoom,
                            }))
                        : generatedImage
                          ? [{ id: 'current', source: generatedImage, label: selectedRoom || 'Room', roomType: selectedRoom }]
                          : []
                    }
                    mode={sessionQueue.filter(s => s.generatedImage).length > 1 ? 'batch' : 'single'}
                  />
                )}

                {activePanel === 'listing' && (
                  <ListingDescription
                    roomTypes={
                      sessionQueue.length > 0
                        ? [...new Set(sessionQueue.map(s => s.selectedRoom))]
                        : [selectedRoom]
                    }
                  />
                )}

                {activePanel === 'social' && (
                  <SocialPack
                    images={
                      sessionQueue.length > 0
                        ? sessionQueue
                            .filter(s => s.generatedImage)
                            .map(s => ({
                              id: s.id,
                              source: s.generatedImage!,
                              label: s.selectedRoom || 'Room',
                            }))
                        : generatedImage
                          ? [{ id: 'current', source: generatedImage, label: selectedRoom || 'Room' }]
                          : []
                    }
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
        <div className="toast-container" role="status" aria-live="polite">
          <div className={`toast-notification ${toastMessage.action ? 'animate-toast-long' : 'animate-toast'}`}>
            <span className="toast-icon">{toastMessage.icon}</span>
            <span className="toast-label">{toastMessage.label}</span>
            {toastMessage.action && (
              <button
                type="button"
                onClick={() => {
                  toastMessage.action?.onClick();
                  dismissToast();
                }}
                className="toast-action"
              >
                {toastMessage.action.label}
              </button>
            )}
          </div>
        </div>
      )}

      <Analytics />
    </div>
  );
};

export default App;
