import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateRoomDesign,
  analyzeRoomColors,
  detectRoomType,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import CompareSlider from './components/CompareSlider';
import StyleControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ColorAnalysis from './components/ColorAnalysis';
import BetaFeedbackForm from './components/BetaFeedbackForm';
import ChatInterface from './components/ChatInterface';
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
  Building2,
  Bot,
  User,
  Send,
  Wand2
} from 'lucide-react';
import PathBOpsPanel from './components/PathBOpsPanel';

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
type AdminInviteCode = {
  code: string;
  inviteLink: string;
  createdAt?: string;
};

const BETA_ACCESS_KEY = 'studioai_beta_access_code';
const BETA_TOKEN_KEY = 'studioai_beta_token';
const BETA_DEVICE_KEY = 'studioai_beta_device_id';
const BETA_ADMIN_TOKEN_KEY = 'studioai_beta_admin_token';
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
const FEEDBACK_REQUIRED_INTERVAL = 3;

const buildInviteLink = (code: string) => {
  if (!code || typeof window === 'undefined') return '';
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
};

const getOrCreateDeviceId = () => {
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(BETA_DEVICE_KEY);
  if (existing) return existing;

  const next =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  localStorage.setItem(BETA_DEVICE_KEY, next);
  return next;
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'tools' | 'ops' | 'chat' | 'history' | 'cleanup'>('tools');
  const [stageMode, setStageMode] = useState<StageMode>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [hasProKey, setHasProKey] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  );
  const [sheetOpen, setSheetOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  );
  const [showQuickTutorial, setShowQuickTutorial] = useState(true);
  const [isCompareDragging, setIsCompareDragging] = useState(false);
  const [showFeedbackCheckpoint, setShowFeedbackCheckpoint] = useState(false);
  const [generationsSinceFeedback, setGenerationsSinceFeedback] = useState(0);

  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const [multiGen, setMultiGen] = useState(false);
  const [galleryTab, setGalleryTab] = useState<'recent' | 'saved'>('recent');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const lastPromptRef = useRef<string>('');

  const [betaAccessCode, setBetaAccessCode] = useState('');
  const [betaInviteCode, setBetaInviteCode] = useState('');
  const [betaReferralCode, setBetaReferralCode] = useState('');
  const [betaInviteLinkValue, setBetaInviteLinkValue] = useState('');
  const [betaToken, setBetaToken] = useState('');
  const [betaUserId, setBetaUserId] = useState('');
  const [acceptedInvites, setAcceptedInvites] = useState(0);
  const [insiderUnlocked, setInsiderUnlocked] = useState(false);
  const [proInviteUnlocked, setProInviteUnlocked] = useState(false);
  const [betaMessage, setBetaMessage] = useState('');
  const [betaError, setBetaError] = useState('');
  const [isBetaLoading, setIsBetaLoading] = useState(true);
  const [isActivatingBeta, setIsActivatingBeta] = useState(false);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [adminCodePrefix, setAdminCodePrefix] = useState('');
  const [adminCodeCount, setAdminCodeCount] = useState(1);
  const [adminGeneratedCodes, setAdminGeneratedCodes] = useState<AdminInviteCode[]>([]);
  const [isGeneratingAdminCodes, setIsGeneratingAdminCodes] = useState(false);
  const [copiedField, setCopiedField] = useState<'link' | 'code' | null>(null);

  const allowedBetaCodes = useMemo(
    () => (ENV_BETA_CODES.size > 0 ? new Set(ENV_BETA_CODES) : new Set(DEFAULT_BETA_CODES)),
    []
  );

  const proUnlocked = Boolean(
    isOwnerAdmin ||
    proInviteUnlocked ||
    (betaAccessCode && (PRO_UNLOCK_ALL || ENV_PRO_CODES.has(betaAccessCode)))
  );
  const betaInviteLink = useMemo(
    () => betaInviteLinkValue || buildInviteLink(betaAccessCode),
    [betaInviteLinkValue, betaAccessCode]
  );

  const applyBetaUser = useCallback((user: any, token?: string) => {
    if (!user) return;
    const referralCode = String(user.referralCode || '').toUpperCase();
    const inviteLink = referralCode ? buildInviteLink(referralCode) : '';

    if (referralCode) {
      setBetaAccessCode(referralCode);
      localStorage.setItem(BETA_ACCESS_KEY, referralCode);
    }
    if (inviteLink) {
      setBetaInviteLinkValue(inviteLink);
    }

    setBetaUserId(String(user.id || ''));
    setAcceptedInvites(Number(user.acceptedInvites) || 0);
    setInsiderUnlocked(Boolean(user.insiderUnlocked));
    setProInviteUnlocked(Boolean(user.pro2kUnlocked));

    if (token) {
      setBetaToken(token);
      localStorage.setItem(BETA_TOKEN_KEY, token);
    }
  }, []);

  const loadAdminCodes = useCallback(async (token: string) => {
    const response = await fetch('/api/beta-router?action=admin-codes&limit=20', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to load admin codes');
    }

    const data = await response.json().catch(() => ({}));
    const list = Array.isArray(data.rootCodes) ? data.rootCodes : [];
    const normalized: AdminInviteCode[] = list.map((entry: any) => ({
      code: String(entry?.code || '').toUpperCase(),
      inviteLink: String(entry?.inviteLink || ''),
      createdAt: String(entry?.createdAt || ''),
    }));
    setAdminGeneratedCodes(normalized);
  }, []);

  useEffect(() => {
    const savedS = localStorage.getItem('realestate_ai_stages');
    if (savedS) setSavedStages(JSON.parse(savedS));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = (params.get('invite') || params.get('code') || '').trim().toUpperCase();
    const ref = (params.get('ref') || '').trim().toUpperCase();

    if (invite) {
      setBetaInviteCode(invite);
      setBetaMessage('Invite accepted. Enter this code to access the private beta.');
    }
    if (ref) {
      setBetaReferralCode(ref);
      if (!invite) {
        setBetaMessage('Referral detected. Enter your invite code to join this beta.');
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrapBeta = async () => {
      setIsBetaLoading(true);
      try {
        const storedAdminToken = (localStorage.getItem(BETA_ADMIN_TOKEN_KEY) || '').trim();
        if (storedAdminToken) {
          try {
            await loadAdminCodes(storedAdminToken);
            if (!mounted) return;

            setIsOwnerAdmin(true);
            setAdminToken(storedAdminToken);
            setBetaAccessCode('OWNER');
            setBetaMessage('Owner session restored.');
            setIsBetaLoading(false);
            return;
          } catch {
            localStorage.removeItem(BETA_ADMIN_TOKEN_KEY);
          }
        }

        const existingToken = (localStorage.getItem(BETA_TOKEN_KEY) || '').trim();
        const deviceId = getOrCreateDeviceId();

        if (existingToken) {
          try {
            const response = await fetch(`/api/beta-router?action=me&deviceId=${encodeURIComponent(deviceId)}`, {
              headers: {
                Authorization: `Bearer ${existingToken}`,
              },
            });

            if (response.ok) {
              const data = await response.json().catch(() => ({}));
              if (data?.ok && data.user) {
                if (!mounted) return;
                applyBetaUser(data.user, existingToken);
                setBetaMessage('Welcome back to the StudioAI beta.');
                setIsBetaLoading(false);
                return;
              }
            } else {
              localStorage.removeItem(BETA_TOKEN_KEY);
            }
          } catch {
            // Keep local-code fallback for offline development.
          }
        }

        try {
          const response = await fetch(`/api/beta-router?action=me&deviceId=${encodeURIComponent(deviceId)}`);
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            if (data?.ok && data.user) {
              if (!mounted) return;
              applyBetaUser(data.user);
              setBetaMessage('Welcome back to the StudioAI beta.');
              setIsBetaLoading(false);
              return;
            }
          }
        } catch {
          // Keep local-code fallback for offline development.
        }

        const existing = (localStorage.getItem(BETA_ACCESS_KEY) || '').trim().toUpperCase();
        if (existing && allowedBetaCodes.has(existing)) {
          setBetaAccessCode(existing);
          setBetaInviteLinkValue(buildInviteLink(existing));
        } else if (existing) {
          localStorage.removeItem(BETA_ACCESS_KEY);
        }
      } finally {
        if (mounted) setIsBetaLoading(false);
      }
    };

    bootstrapBeta();
    return () => {
      mounted = false;
    };
  }, [allowedBetaCodes, applyBetaUser, loadAdminCodes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktopViewport(desktop);
      if (desktop) {
        setSheetOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isDesktopViewport || !isCompareDragging || typeof document === 'undefined') return;

    const body = document.body;
    body.classList.add('compare-lock');

    return () => {
      body.classList.remove('compare-lock');
    };
  }, [isCompareDragging, isDesktopViewport]);

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

  useEffect(() => {
    if (generationsSinceFeedback >= FEEDBACK_REQUIRED_INTERVAL) {
      setShowFeedbackCheckpoint(true);
    }
  }, [generationsSinceFeedback]);

  useEffect(() => {
    if (!generatedImage) {
      setIsCompareDragging(false);
    }
  }, [generatedImage]);

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
    setIsCompareDragging(false);
    setColors([]);
    setDetectedRoom(null);
    setHistory([]);
    setHistoryIndex(-1);
    setIsAnalyzing(true);
    setStageMode('text');
    setShowFeedbackCheckpoint(false);
    setGenerationsSinceFeedback(0);
    setShowQuickTutorial(true);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSheetOpen(false);
    }

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
    if (showFeedbackCheckpoint) {
      alert('Please complete the quick feedback checkpoint to continue generating.');
      return;
    }

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
      const result = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, highRes, multiGen ? 4 : 1);

      const resultImages = Array.isArray(result) ? result : [result];
      const newColors = await analyzeRoomColors(resultImages[0]);

      setGeneratedImage(resultImages[0]);
      setColors(newColors);
      setMaskImage(null);

      resultImages.forEach((img, idx) => {
        const state: HistoryState = {
          generatedImage: img,
          stagedFurniture: [],
          selectedRoom,
          colors: idx === 0 ? newColors : [], // Approximate for speed
        };
        setHistory((prev) => {
          const newHistory = prev.slice(0, historyIndex + 1 + idx);
          return [...newHistory, state];
        });
      });
      setHistoryIndex((prev) => prev + resultImages.length);

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

  const handleSaveStage = () => {
    if (!generatedImage || !originalImage) return;

    const newSave: SavedStage = {
      id: `save_${Date.now()}`,
      name: `${selectedRoom} Concept`,
      originalImage,
      generatedImage,
      timestamp: Date.now(),
    };

    setSavedStages((prev) => {
      const next = [newSave, ...prev];
      localStorage.setItem('realestate_ai_stages', JSON.stringify(next));
      return next;
    });
  };

  const handleRemoveSavedStage = (id: string) => {
    setSavedStages((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem('realestate_ai_stages', JSON.stringify(next));
      return next;
    });
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
      const deviceId = getOrCreateDeviceId();
      let backendActivated = false;

      try {
        const response = await fetch('/api/beta-router?action=activate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteCode: entered,
            referralCode: betaReferralCode || undefined,
            deviceId,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.ok && data.user) {
          backendActivated = true;
          applyBetaUser(data.user, data.token);
          setBetaMessage(String(data.message || 'Welcome to the private StudioAI beta.'));
          return;
        }

        if (data?.code === 'ALREADY_ACTIVATED_DEVICE') {
          const recovery = await fetch(`/api/beta-router?action=me&deviceId=${encodeURIComponent(deviceId)}`).catch(() => null);
          if (recovery?.ok) {
            const recoveryData = await recovery.json().catch(() => ({}));
            if (recoveryData?.ok && recoveryData.user) {
              backendActivated = true;
              applyBetaUser(recoveryData.user);
              setBetaMessage('Welcome back to the StudioAI beta.');
              return;
            }
          }
        }
      } catch {
        // Keep local-code fallback for local/offline usage.
      }

      if (!backendActivated && allowedBetaCodes.has(entered)) {
        setBetaAccessCode(entered);
        setBetaInviteLinkValue(buildInviteLink(entered));
        localStorage.setItem(BETA_ACCESS_KEY, entered);
        setBetaMessage('Welcome to the private StudioAI beta.');
        return;
      }

      setBetaError('That invite code is not valid.');
    } catch {
      setBetaError('Activation failed. Check your connection and retry.');
    } finally {
      setIsActivatingBeta(false);
    }
  };

  const activateOwnerAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) return;

    setIsAdminLoggingIn(true);
    setAdminError('');
    try {
      const response = await fetch('/api/beta-router?action=admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: adminSecret.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.token) {
        const message = data?.error || 'Owner login failed.';
        setAdminError(String(message));
        return;
      }

      const token = String(data.token);
      setAdminToken(token);
      setIsOwnerAdmin(true);
      setBetaAccessCode('OWNER');
      setBetaInviteCode('');
      setBetaMessage('Owner access granted.');
      setShowAdminLogin(false);
      setAdminSecret('');
      localStorage.setItem(BETA_ADMIN_TOKEN_KEY, token);
      await loadAdminCodes(token);
    } catch {
      setAdminError('Owner login failed. Check your connection and retry.');
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const generateOwnerCodes = async () => {
    if (!adminToken || !isOwnerAdmin) return;
    setIsGeneratingAdminCodes(true);
    setAdminError('');

    try {
      const response = await fetch('/api/beta-router?action=admin-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          prefix: adminCodePrefix,
          count: adminCodeCount,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setAdminError(String(data?.error || 'Failed to generate invite codes.'));
        return;
      }

      const generated = Array.isArray(data.generated) ? data.generated : [];
      const normalized: AdminInviteCode[] = generated.map((entry: any) => ({
        code: String(entry?.code || '').toUpperCase(),
        inviteLink: String(entry?.inviteLink || ''),
        createdAt: String(entry?.createdAt || ''),
      }));

      setAdminGeneratedCodes((prev) => {
        const seen = new Set(normalized.map((entry) => entry.code));
        return [...normalized, ...prev.filter((entry) => !seen.has(entry.code))];
      });
      setBetaMessage(`Generated ${normalized.length} invite code${normalized.length === 1 ? '' : 's'}.`);
    } catch {
      setAdminError('Failed to generate invite codes. Check your connection.');
    } finally {
      setIsGeneratingAdminCodes(false);
    }
  };

  const copyText = async (value: string, type: 'link' | 'code') => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(type);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      setCopiedField(null);
    }
  };

  const copyValue = async (type: 'link' | 'code') => {
    if (!betaAccessCode) return;
    const value = type === 'link' ? betaInviteLink : betaAccessCode;
    await copyText(value, type);
  };

  const navItems: Array<{
    id: 'tools' | 'ops' | 'cleanup' | 'chat' | 'history';
    label: string;
    icon: React.ReactNode;
    available: boolean;
  }> = [
      { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
      { id: 'ops', label: 'Ops Console', icon: <Building2 size={21} />, available: true },
      { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: true },
      { id: 'chat', label: 'Chat', icon: <MessageSquare size={21} />, available: true },
      { id: 'history', label: 'Gallery', icon: <HistoryIcon size={21} />, available: true },
    ];

  useEffect(() => {
    if (!showAccessPanel || !isOwnerAdmin || !adminToken) return;
    loadAdminCodes(adminToken).catch(() => {
      setAdminError('Could not refresh invite codes.');
    });
  }, [showAccessPanel, isOwnerAdmin, adminToken, loadAdminCodes]);

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

          <button
            type="button"
            onClick={() => {
              setShowAdminLogin(true);
              setAdminError('');
            }}
            className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-white/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.11em] text-[var(--color-text)]/78"
          >
            Owner Login
          </button>

          {betaMessage && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">{betaMessage}</p>}
          {betaError && <p className="mt-4 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{betaError}</p>}

          <p className="mt-5 text-xs text-[var(--color-text)]/70">
            You can share your access link or code with trusted beta testers.
          </p>
        </div>

        {showAdminLogin && (
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 backdrop-blur-sm p-4">
            <div className="premium-surface-strong w-full max-w-md rounded-[2rem] p-7">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Owner Access</p>
                  <h3 className="font-display text-2xl">Admin Login</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(false)}
                  className="rounded-xl p-2 text-[var(--color-text)]/70 transition hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={activateOwnerAccess} className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[var(--color-text)]/72">Admin secret</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    placeholder="Enter owner secret"
                    className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAdminLoggingIn || !adminSecret.trim()}
                  className="cta-primary w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {isAdminLoggingIn ? 'Signing In...' : 'Unlock Owner Access'}
                </button>
              </form>

              {adminError && <p className="mt-4 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{adminError}</p>}
            </div>
          </div>
        )}
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

            {isOwnerAdmin ? (
              <>
                <p className="text-sm text-[var(--color-text)]/82">
                  Owner mode bypasses the invite gate and lets you mint invite codes directly from backend KV.
                </p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={adminCodePrefix}
                    onChange={(e) => setAdminCodePrefix(e.target.value.toUpperCase())}
                    placeholder="Prefix (optional), e.g. VELVET-EMBER"
                    className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)]"
                  />
                  <select
                    value={adminCodeCount}
                    onChange={(e) => setAdminCodeCount(Number(e.target.value))}
                    className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)]"
                  >
                    {[1, 2, 3, 5, 10].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={generateOwnerCodes}
                  disabled={isGeneratingAdminCodes}
                  className="mt-3 cta-primary w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {isGeneratingAdminCodes ? 'Generating...' : 'Generate Invite Codes'}
                </button>

                <div className="mt-4 max-h-64 overflow-auto space-y-2">
                  {adminGeneratedCodes.length === 0 ? (
                    <p className="text-xs text-[var(--color-text)]/72">No generated codes yet. Create your first batch above.</p>
                  ) : (
                    adminGeneratedCodes.map((entry) => (
                      <div key={entry.code} className="rounded-xl border border-[var(--color-border)] bg-white/85 p-3">
                        <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-ink)]">{entry.code}</p>
                        <p className="mt-1 text-[11px] text-[var(--color-text)]/76 break-all">{entry.inviteLink}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(entry.code, 'code')}
                            className="cta-secondary rounded-lg px-2 py-2 text-[11px] font-semibold inline-flex items-center justify-center gap-1"
                          >
                            {copiedField === 'code' ? <Check size={12} /> : <Copy size={12} />} Copy Code
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(entry.inviteLink, 'link')}
                            className="cta-secondary rounded-lg px-2 py-2 text-[11px] font-semibold inline-flex items-center justify-center gap-1"
                          >
                            {copiedField === 'link' ? <Check size={12} /> : <Copy size={12} />} Copy Link
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
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
              </>
            )}

            {adminError && (
              <p className="mt-4 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{adminError}</p>
            )}

            <p className="mt-4 text-xs text-[var(--color-text)]/75">
              High-res enhancement: <strong>{proUnlocked ? 'Unlocked' : 'Locked'}</strong>
            </p>
          </div>
        </div>
      )}

      <header className="shrink-0 premium-surface-strong border-b panel-divider px-4 py-3 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="cta-primary flex h-11 w-11 items-center justify-center rounded-2xl shadow-[0_10px_24px_rgba(3,105,161,0.28)] animate-float">
              <Camera size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[1.15rem] sm:text-[1.35rem] leading-none whitespace-nowrap tracking-tight">
                Studio<span className="text-[var(--color-primary)]">AI</span>
              </h1>
              <p className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-[var(--color-text)]/60 font-medium">
                Invite-Only Beta
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full subtle-card p-1">
            <button
              type="button"
              onClick={() => setActivePanel('tools')}
              className={`rounded-full px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] transition ${activePanel === 'tools' ? 'cta-primary' : 'text-[var(--color-text)] hover:bg-white'
                }`}
            >
              Studio
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('ops')}
              className={`rounded-full px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] transition ${activePanel === 'ops' ? 'cta-primary' : 'text-[var(--color-text)] hover:bg-white'
                }`}
            >
              Ops
            </button>
          </div>

          {originalImage && activePanel === 'tools' && (
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

        {activePanel === 'ops' ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowAccessPanel(true)}
              className="cta-secondary rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Access</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('tools')}
              className="cta-primary rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Open Studio</span>
            </button>
          </div>
        ) : originalImage ? (
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
                  className="cta-secondary hover-lift rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveStage}
                  className="cta-secondary hover-lift rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px] text-rose-600"
                  title="Save to Gallery"
                >
                  <Sparkles size={14} />
                  <span className="hidden sm:inline">Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!proUnlocked) return;
                    if (hasProKey) setShowProConfirm(true);
                    else setShowKeyPrompt(true);
                  }}
                  disabled={isEnhancing || !proUnlocked}
                  className={`rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px] transition-all hover-lift disabled:opacity-55 ${proUnlocked
                    ? hasProKey
                      ? 'cta-primary shadow-[0_8px_20px_rgba(3,105,161,0.24)]'
                      : 'cta-secondary'
                    : 'border border-amber-300/70 bg-amber-50 text-amber-900'
                    }`}
                >
                  {proUnlocked ? <Zap size={14} className={isEnhancing ? 'animate-pulse' : ''} /> : <Lock size={14} />}
                  <span className="hidden sm:inline">
                    {proUnlocked ? (hasProKey ? 'High-Res Enhance' : 'Enable High-Res') : 'Locked'}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setMultiGen(!multiGen)}
              className={`cta-secondary hover-lift rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 min-h-[44px] ${multiGen ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : ''}`}
              title="Generate multiple variations"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">{multiGen ? 'Multi-Gen: ON' : 'Multi-Gen'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOriginalImage(null);
                setGeneratedImage(null);
                setIsCompareDragging(false);
                setStageMode('text');
                setShowFeedbackCheckpoint(false);
                setGenerationsSinceFeedback(0);
                setShowQuickTutorial(true);
                if (!isDesktopViewport) {
                  setSheetOpen(false);
                }
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

      {activePanel === 'ops' ? (
        <main className="flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-4 sm:p-6 lg:p-8">
          <PathBOpsPanel />
        </main>
      ) : activePanel === 'history' ? (
        <main className="flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-4 sm:p-6 lg:p-8 pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--color-primary)] mb-1">Portfolio</p>
                <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)]">Studio Gallery</h2>
              </div>

              <div className="flex p-1 rounded-full subtle-card w-fit">
                <button
                  onClick={() => setGalleryTab('recent')}
                  className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${galleryTab === 'recent' ? 'cta-primary shadow-lg' : 'text-[var(--color-text)] hover:bg-white'}`}
                >
                  Recent
                </button>
                <button
                  onClick={() => setGalleryTab('saved')}
                  className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${galleryTab === 'saved' ? 'cta-primary shadow-lg' : 'text-[var(--color-text)] hover:bg-white'}`}
                >
                  Saved ({savedStages.length})
                </button>
              </div>
            </div>

            {galleryTab === 'recent' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.filter(h => h.generatedImage).length === 0 ? (
                  <div className="col-span-full py-20 text-center premium-surface rounded-[2.5rem] border border-dashed border-[var(--color-border)]">
                    <HistoryIcon size={40} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-[var(--color-text)]/60 font-medium">No recent generations yet.</p>
                  </div>
                ) : (
                  history.filter(h => h.generatedImage).map((item, idx) => (
                    <div key={idx} className="group premium-surface rounded-[2rem] overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-all hover:shadow-xl hover-lift">
                      <div className="aspect-video relative overflow-hidden bg-slate-100">
                        <img src={item.generatedImage!} alt="Recent" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <button
                            onClick={() => {
                              setGeneratedImage(item.generatedImage);
                              setColors(item.colors);
                              setSelectedRoom(item.selectedRoom);
                              setActivePanel('tools');
                            }}
                            className="w-full py-2.5 rounded-xl cta-primary text-xs font-bold uppercase tracking-widest"
                          >
                            Open in Studio
                          </button>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-semibold text-[var(--color-ink)]">{item.selectedRoom}</p>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--color-text)]/40">Recent</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedStages.length === 0 ? (
                  <div className="col-span-full py-20 text-center premium-surface rounded-[2.5rem] border border-dashed border-[var(--color-border)]">
                    <Sparkles size={40} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-[var(--color-text)]/60 font-medium tracking-wide">Your saved gallery is empty.</p>
                    <button onClick={() => setActivePanel('tools')} className="mt-4 text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest hover:underline">Start Creating</button>
                  </div>
                ) : (
                  savedStages.map((item) => (
                    <div key={item.id} className="group premium-surface rounded-[2rem] overflow-hidden border border-[var(--color-border)] hover:border-rose-200 transition-all hover:shadow-xl hover-lift">
                      <div className="aspect-video relative overflow-hidden bg-slate-100">
                        <img src={item.generatedImage} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <button
                            onClick={() => {
                              setOriginalImage(item.originalImage);
                              setGeneratedImage(item.generatedImage);
                              setSelectedRoom(item.name.replace(' Concept', '') as FurnitureRoomType);
                              setActivePanel('tools');
                            }}
                            className="flex-1 py-2 rounded-xl cta-primary text-[10px] font-bold uppercase tracking-widest"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handleRemoveSavedStage(item.id)}
                            className="p-2 rounded-xl bg-white/20 hover:bg-rose-500 text-white transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--color-ink)]">{item.name}</h4>
                            <p className="text-[10px] text-[var(--color-text)]/60 mt-1">{new Date(item.timestamp).toLocaleDateString()}</p>
                          </div>
                          <span className="p-1.5 rounded-lg bg-rose-50 text-rose-500">
                            <Sparkles size={14} />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </main>
      ) : !originalImage ? (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] overflow-auto">
          <section className="px-6 pb-14 pt-10 sm:px-12 lg:px-16 lg:pt-14 flex items-center">
            <div className="max-w-2xl w-full">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full cta-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                <Sparkles size={14} /> Invite-Only Staging Beta
              </div>
              <h2 className="font-display text-[clamp(2.3rem,7vw,5.3rem)] leading-[0.92] font-semibold text-[var(--color-ink)] tracking-tight">
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
            <div className="absolute bottom-8 left-8 right-8 rounded-3xl glass-overlay p-8 text-slate-900">
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-slate-800/80">Minimal Luxury Direction</p>
              <p className="mt-3 text-2xl font-display font-medium leading-tight">Structure-first redesign with premium restraint.</p>
            </div>
          </section>
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex lg:flex-row overflow-hidden relative">
          <nav className="hidden lg:flex shrink-0 w-[172px] premium-surface border-r panel-divider flex-col items-center justify-start gap-2 py-5 order-1">
            <div className="px-3 pb-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text)]/65">Beta Scope</p>
              <p className="text-xs mt-1 text-[var(--color-text)]/78">Design Studio and Ops Console are active. Other tabs are staged for later rollout.</p>
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
                  className={`flex h-auto w-[152px] px-3 py-2.5 items-center justify-start gap-2 rounded-2xl border transition-all ${active && item.available
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

          <main className="order-1 lg:order-2 flex-1 min-h-0 overflow-y-auto editor-canvas-bg p-4 sm:p-6 lg:p-8 pb-[52vh] sm:pb-[48vh] lg:pb-8">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="premium-surface-strong rounded-[2rem] p-2 sm:p-3">
                <div className="relative overflow-hidden rounded-[1.5rem] border panel-divider bg-[var(--color-bg-deep)] aspect-[4/3] sm:aspect-video">
                  {generatedImage && activePanel !== 'cleanup' ? (
                    <CompareSlider
                      originalImage={originalImage}
                      generatedImage={generatedImage}
                      onDragStateChange={setIsCompareDragging}
                    />
                  ) : (
                    <MaskCanvas
                      imageSrc={generatedImage || originalImage}
                      onMaskChange={setMaskImage}
                      isActive={activePanel === 'cleanup'}
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
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Quick Tutorial</p>
                      <h3 className="font-display text-xl mt-1">How To Use Studio</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowQuickTutorial((prev) => !prev)}
                      className="rounded-xl border border-[var(--color-border)] bg-white/75 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text)]/78"
                    >
                      {showQuickTutorial ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showQuickTutorial && (
                    <ol className="mt-2 space-y-1 text-sm text-[var(--color-text)]/82 list-decimal pl-4">
                      <li>Choose a <strong>Mode</strong> first.</li>
                      <li>Add direction with text or pick one style pack.</li>
                      <li>Tap Generate, then re-generate for new layouts.</li>
                      <li>Submit thumbs feedback when prompted.</li>
                    </ol>
                  )}
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
                {activePanel === 'chat' ? (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <ChatInterface
                      messages={chatMessages}
                      onSendMessage={async (text) => {
                        const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
                        setChatMessages(prev => [...prev, newUserMsg]);
                        setIsChatLoading(true);
                        try {
                          setTimeout(() => {
                            const botMsg: ChatMessage = {
                              id: (Date.now() + 1).toString(),
                              role: 'model',
                              text: `As your personal Design Assistant, I suggest focusing on ${text.includes('modern') ? 'cleaner lines and polished textures' : 'warmer tones and natural materials'}. Would you like me to refine your current prompt with these suggestions?`,
                              timestamp: Date.now()
                            };
                            setChatMessages(prev => [...prev, botMsg]);
                            setIsChatLoading(false);
                          }, 1500);
                        } catch (err) {
                          setIsChatLoading(false);
                        }
                      }}
                      isLoading={isChatLoading}
                    />
                  </div>
                ) : (
                  <StyleControls
                    activeMode={activePanel === 'cleanup' ? 'cleanup' : 'design'}
                    hasGenerated={!!generatedImage}
                    onGenerate={handleGenerate}
                    onStageModeChange={setStageMode}
                    isGenerating={isGenerating}
                    hasMask={!!maskImage}
                    selectedRoom={selectedRoom}
                    feedbackRequired={showFeedbackCheckpoint}
                    compactMobile={!isDesktopViewport}
                  />
                )}

                <div className="hidden lg:block">
                  <BetaFeedbackForm
                    selectedRoom={selectedRoom}
                    hasGenerated={!!generatedImage}
                    stagedFurnitureCount={0}
                    stageMode={stageMode}
                    generatedImage={generatedImage}
                    betaUserId={betaUserId || (betaAccessCode ? `access-${betaAccessCode}` : '')}
                    referralCode={betaAccessCode}
                    acceptedInvites={acceptedInvites}
                    insiderUnlocked={insiderUnlocked}
                    pro2kUnlocked={proUnlocked}
                  />
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showFeedbackCheckpoint && generatedImage && activePanel === 'tools' && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/48 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg premium-surface-strong rounded-[2rem] p-5 sm:p-6">
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Required Checkpoint</p>
              <h3 className="font-display text-2xl">Quick Feedback Needed</h3>
              <p className="mt-1 text-sm text-[var(--color-text)]/82">
                We ask for a thumbs rating every {FEEDBACK_REQUIRED_INTERVAL} generations so beta output quality improves fast.
              </p>
            </div>
            <BetaFeedbackForm
              mode="quick-only"
              quickRequired
              onQuickSubmitted={() => {
                setShowFeedbackCheckpoint(false);
                setGenerationsSinceFeedback(0);
              }}
              selectedRoom={selectedRoom}
              hasGenerated={!!generatedImage}
              stagedFurnitureCount={0}
              stageMode={stageMode}
              generatedImage={generatedImage}
              betaUserId={betaUserId || (betaAccessCode ? `access-${betaAccessCode}` : '')}
              referralCode={betaAccessCode}
              acceptedInvites={acceptedInvites}
              insiderUnlocked={insiderUnlocked}
              pro2kUnlocked={proUnlocked}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
