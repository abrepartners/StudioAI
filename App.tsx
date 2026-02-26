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
import StyleControls from './components/StyleControls';
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
  Building2,
  Bot,
  User,
  Send,
  Wand2,
  Heart,
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

const FEEDBACK_REQUIRED_INTERVAL = 3;

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');
  const [colors, setColors] = useState<ColorData[]>([]);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [activePanel, setActivePanel] = useState<'tools' | 'ops' | 'cleanup' | 'chat' | 'history'>('tools');
  const [isCompareDragging, setIsCompareDragging] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [proUnlocked, setProUnlocked] = useState(import.meta.env.VITE_BETA_PRO_UNLOCK === 'true');
  const [hasProKey, setHasProKey] = useState(false);
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [isMultiGen, setIsMultiGen] = useState(false);
  const [stageMode, setStageMode] = useState<'text' | 'packs' | 'furniture'>('text');
  const [showFeedbackCheckpoint, setShowFeedbackCheckpoint] = useState(false);
  const [generationsSinceFeedback, setGenerationsSinceFeedback] = useState(0);
  const [showQuickTutorial, setShowQuickTutorial] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);
  const [betaAccessCode, setBetaAccessCode] = useState(localStorage.getItem('beta_access_code') || '');
  const [betaInviteCode, setBetaInviteCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(localStorage.getItem('is_admin') === 'true');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || '');
  const [adminGeneratedCodes, setAdminGeneratedCodes] = useState<Array<{ code: string; inviteLink: string }>>([]);
  const [isGeneratingAdminCodes, setIsGeneratingAdminCodes] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [copiedField, setCopiedField] = useState<'link' | 'code' | null>(null);
  const [savedStages, setSavedStages] = useState<SavedStage[]>(JSON.parse(localStorage.getItem('saved_stages') || '[]'));
  const [galleryTab, setGalleryTab] = useState<'recent' | 'saved'>('recent');

  const viewportRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>('');
  const isDesktopViewport = useMemo(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  }, []);
  const [sheetOpen, setSheetOpen] = useState(isDesktopViewport);

  const betaInviteLink = useMemo(() => {
    const base = import.meta.env.VITE_APP_BASE_URL || window.location.origin;
    return `${base}?invite=${betaAccessCode}`;
  }, [betaAccessCode]);

  useEffect(() => {
    localStorage.setItem('saved_stages', JSON.stringify(savedStages));
  }, [savedStages]);

  const handleDownload = useCallback(() => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `studioai-${selectedRoom.toLowerCase()}-${Date.now()}.png`;
    link.click();
  }, [generatedImage, selectedRoom]);

  const handleSaveStage = useCallback(() => {
    if (!generatedImage) return;
    const alreadySaved = savedStages.some(s => s.generatedImage === generatedImage);
    if (alreadySaved) {
      setSavedStages(prev => prev.filter(s => s.generatedImage !== generatedImage));
      return;
    }
    const newSaved: SavedStage = {
      id: Date.now().toString(),
      originalImage: originalImage || '',
      generatedImage,
      selectedRoom,
      timestamp: Date.now()
    };
    setSavedStages(prev => [newSaved, ...prev]);
  }, [generatedImage, originalImage, selectedRoom, savedStages]);

  const handleRemoveSavedStage = (id: string) => {
    setSavedStages(prev => prev.filter(s => s.id !== id));
  };

  const handleOwnerLogin = async () => {
    const secret = prompt('Enter Owner Admin Secret:');
    if (!secret) return;
    try {
      const res = await fetch('/api/beta-router?action=admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('is_admin', 'true');
        setAdminToken(data.token);
        setIsOwnerAdmin(true);
        setBetaAccessCode('OWNER');
        localStorage.setItem('beta_access_code', 'OWNER');
      } else {
        alert('Invalid admin secret.');
      }
    } catch {
      alert('Login failed.');
    }
  };

  const loadAdminCodes = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/beta-router?action=admin-codes&limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.codes) setAdminGeneratedCodes(data.codes);
    } catch (err) {
      console.error('Failed to load codes');
    }
  }, []);

  const activateBeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!betaInviteCode.trim()) return;
    setIsActivating(true);
    setActivationError('');
    try {
      const deviceId = localStorage.getItem('device_id') || Math.random().toString(36).substring(7);
      localStorage.setItem('device_id', deviceId);
      const res = await fetch('/api/beta-router?action=activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: betaInviteCode, deviceId }),
      });
      const data = await res.json();
      if (data.success) {
        setBetaAccessCode(betaInviteCode);
        localStorage.setItem('beta_access_code', betaInviteCode);
      } else {
        setActivationError(data.error || 'Invalid or expired invite code.');
      }
    } catch {
      setActivationError('Connection error. Try again.');
    } finally {
      setIsActivating(false);
    }
  };

  const refreshProKeyStatus = async () => {
    if (!betaAccessCode) return false;
    try {
      const deviceId = localStorage.getItem('device_id');
      const res = await fetch(`/api/beta-router?action=me&deviceId=${encodeURIComponent(deviceId || '')}`);
      const data = await res.json();
      if (data.proUnlocked) {
        setProUnlocked(true);
        setHasProKey(true);
        return true;
      }
    } catch { }
    return false;
  };

  const handleGenerate = async (prompt: string, highRes: boolean = false) => {
    if (showFeedbackCheckpoint) return;
    if (!originalImage) return;

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
      const result = await generateRoomDesign(sourceImage, prompt, activePanel === 'cleanup' ? maskImage : null, highRes, count);
      const resultImages = Array.isArray(result) ? result : [result];
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
      } else {
        alert('Generation failed. Check your connection.');
      }
    } finally {
      setIsGenerating(false);
      setIsEnhancing(false);
    }
  };

  const handleChatMessage = async (text: string) => {
    if (!originalImage) return;
    setIsChatLoading(true);
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const session = chatSession ?? createChatSession();
      if (!chatSession) setChatSession(session);
      const currentImage = generatedImage || originalImage;
      const reply = await sendMessageToChat(session, text, currentImage);
      const modelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: reply, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, modelMsg]);

      const editMatch = reply.match(/\[EDIT:\s*(.+?)\]/i);
      if (editMatch && editMatch[1]) {
        await handleGenerate(editMatch[1], false);
      }
    } catch (err) {
      const errorMsg: ChatMessage = { id: (Date.now() + 2).toString(), role: 'model', text: 'Chat error. Please try again.', timestamp: Date.now() };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const copyText = async (value: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(type);
      setTimeout(() => setCopiedField(null), 1600);
    } catch { }
  };

  const navItems = [
    { id: 'tools', label: 'Design Studio', icon: <LayoutGrid size={21} />, available: true },
    { id: 'ops', label: 'Ops Console', icon: <Building2 size={21} />, available: isOwnerAdmin },
    { id: 'cleanup', label: 'Cleanup', icon: <Eraser size={21} />, available: true },
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={21} />, available: true },
    { id: 'history', label: 'Gallery', icon: <HistoryIcon size={21} />, available: true },
  ];

  if (!betaAccessCode) {
    return (
      <div className="studio-shell min-h-screen grid place-items-center px-4 py-8">
        <div className="premium-surface-strong rounded-[2rem] p-8 sm:p-10 max-w-lg w-full">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <h1 className="font-display text-4xl mt-4">StudioAI</h1>
          <form onSubmit={activateBeta} className="mt-6 space-y-3">
            <input
              value={betaInviteCode}
              onChange={(e) => setBetaInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <button disabled={isActivating} className="cta-primary w-full py-3 rounded-xl font-semibold">
              {isActivating ? 'Activating...' : 'Join Beta'}
            </button>
            {activationError && <p className="text-xs text-rose-500">{activationError}</p>}
          </form>
          <button onClick={handleOwnerLogin} className="mt-8 text-xs text-slate-400 hover:text-slate-600 block mx-auto">Owner Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell flex flex-col lg:flex-row h-screen overflow-hidden">
      <header className="lg:hidden p-4 border-b border-[var(--color-border)] bg-white/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <h1 className="font-display text-2xl">StudioAI</h1>
        <div className="flex gap-2">
          {generatedImage && <button onClick={handleDownload} className="cta-secondary p-2 rounded-xl"><Download size={18} /></button>}
          {generatedImage && <button onClick={handleSaveStage} className="cta-secondary p-2 rounded-xl"><Heart size={18} className={savedStages.some(s => s.generatedImage === generatedImage) ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : ''} /></button>}
          <button onClick={() => setOriginalImage(null)} className="cta-secondary p-2 rounded-xl"><RefreshCcw size={18} /></button>
        </div>
      </header>

      <nav className="fixed bottom-0 lg:static w-full lg:w-20 bg-white/90 lg:bg-white backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-[var(--color-border)] z-50 flex lg:flex-col justify-around lg:justify-center items-center py-2 lg:py-8 lg:gap-8">
        {navItems.filter(i => i.available).map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id as any)}
            className={`flex flex-col items-center gap-1 p-2 transition-all ${activePanel === item.id ? 'text-[var(--color-primary)]' : 'text-slate-400'}`}
          >
            {item.icon}
            <span className="text-[10px] font-semibold uppercase tracking-wider hidden lg:block">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="flex-1 min-h-0 relative editor-canvas-bg overflow-y-auto">
        {!originalImage ? (
          <div className="h-full grid place-items-center p-6">
            <div className="max-w-xl w-full">
              <ImageUploader onUpload={(img) => {
                setOriginalImage(img);
                detectRoomType(img).then(setSelectedRoom);
              }} />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col lg:flex-row">
            <div className="flex-1 p-4 lg:p-8 flex items-center justify-center min-h-[50vh] lg:min-h-0">
              {activePanel === 'cleanup' ? (
                <MaskCanvas originalImage={originalImage} generatedImage={generatedImage} onMaskChange={setMaskImage} />
              ) : generatedImage ? (
                <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
              ) : (
                <img src={originalImage} alt="Original" className="max-h-full rounded-2xl shadow-2xl" />
              )}
            </div>

            <aside className={`w-full lg:w-[400px] border-l border-[var(--color-border)] bg-white/95 backdrop-blur-md overflow-y-auto ${!sheetOpen && 'hidden lg:block'}`}>
              <div className="p-6 space-y-6">
                {activePanel === 'chat' ? (
                  <ChatInterface messages={chatMessages} onSendMessage={handleChatMessage} isLoading={isChatLoading} />
                ) : activePanel === 'ops' ? (
                  <PathBOpsPanel />
                ) : activePanel === 'history' ? (
                  <div className="space-y-4">
                    <h2 className="font-display text-xl">Gallery</h2>
                    <div className="flex gap-2">
                      <button onClick={() => setGalleryTab('recent')} className={`flex-1 py-2 rounded-full text-xs font-semibold ${galleryTab === 'recent' ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100'}`}>Recent</button>
                      <button onClick={() => setGalleryTab('saved')} className={`flex-1 py-2 rounded-full text-xs font-semibold ${galleryTab === 'saved' ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100'}`}>Saved</button>
                    </div>
                    {galleryTab === 'saved' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {savedStages.map(s => (
                          <div key={s.id} className="group relative rounded-xl overflow-hidden shadow-sm aspect-[4/3]">
                            <img src={s.generatedImage} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button onClick={() => setGeneratedImage(s.generatedImage)} className="p-2 bg-white rounded-full"><Sparkles size={16} /></button>
                              <button onClick={() => handleRemoveSavedStage(s.id)} className="p-2 bg-white rounded-full text-rose-500"><X size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {history.map((h, i) => (
                          <div key={i} onClick={() => { setGeneratedImage(h.generatedImage); setHistoryIndex(i); }} className={`cursor-pointer rounded-xl overflow-hidden aspect-[4/3] ring-2 ring-transparent ${historyIndex === i && 'ring-[var(--color-primary)]'}`}>
                            <img src={h.generatedImage} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
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
                    compactMobile={false}
                    isMultiGen={isMultiGen}
                    onMultiGenChange={setIsMultiGen}
                  />
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
