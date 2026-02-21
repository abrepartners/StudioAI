import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateRoomDesign,
  analyzeRoomColors,
  createChatSession,
  sendMessageToChat,
  autoArrangeLayout,
  detectRoomType,
} from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ChatInterface from './components/ChatInterface';
import ColorAnalysis from './components/ColorAnalysis';
import BetaFeedbackForm from './components/BetaFeedbackForm';
import {
  ChatMessage,
  ColorData,
  StagedFurniture,
  SavedLayout,
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
  Send,
  LayoutGrid,
} from 'lucide-react';

const orientations: StagedFurniture['orientation'][] = [
  'Default',
  'Angled Left',
  'Angled Right',
  'Facing Away',
  'Profile View',
];

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

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'tools' | 'chat' | 'history' | 'cleanup'>('tools');
  const [stageMode, setStageMode] = useState<StageMode>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAutoArranging, setIsAutoArranging] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [isMaskMode, setIsMaskMode] = useState(false);
  const [hasProKey, setHasProKey] = useState(false);

  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);

  const [stagedFurniture, setStagedFurniture] = useState<StagedFurniture[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<any>(null);

  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const lastPromptRef = useRef<string>('');

  useEffect(() => {
    const savedS = localStorage.getItem('realestate_ai_stages');
    if (savedS) setSavedStages(JSON.parse(savedS));
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

  useEffect(() => {
    if (originalImage) refreshProKeyStatus();
  }, [originalImage, refreshProKeyStatus]);

  const pushToHistory = useCallback(
    (newState?: Partial<HistoryState>) => {
      const currentState: HistoryState = {
        generatedImage,
        stagedFurniture,
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
    [generatedImage, stagedFurniture, selectedRoom, colors, historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    const state = history[prevIndex];

    setGeneratedImage(state.generatedImage);
    setStagedFurniture(state.stagedFurniture);
    setSelectedRoom(state.selectedRoom);
    setColors(state.colors);
    setHistoryIndex(prevIndex);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];

    setGeneratedImage(state.generatedImage);
    setStagedFurniture(state.stagedFurniture);
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

  const getChatSession = () => {
    if (!chatSessionRef.current) chatSessionRef.current = createChatSession();
    return chatSessionRef.current;
  };

  const handleImageUpload = async (base64: string) => {
    setOriginalImage(base64);
    setGeneratedImage(null);
    setMaskImage(null);
    setColors([]);
    setStagedFurniture([]);
    setDetectedRoom(null);
    setHistory([]);
    setHistoryIndex(-1);
    setIsAnalyzing(true);
    setIsMaskMode(false);
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

  const addFurniture = (name: string) => {
    pushToHistory();
    const newItem: StagedFurniture = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      orientation: 'Default',
    };
    setStagedFurniture((prev) => [...prev, newItem]);
  };

  const removeFurniture = (id: string) => {
    pushToHistory();
    setStagedFurniture((prev) => prev.filter((item) => item.id !== id));
  };

  const rotateFurniture = (id: string) => {
    pushToHistory();
    setStagedFurniture((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const currentIndex = orientations.indexOf(item.orientation);
          const nextIndex = (currentIndex + 1) % orientations.length;
          return { ...item, orientation: orientations[nextIndex] };
        }
        return item;
      })
    );
  };

  const handleAutoArrange = async () => {
    if (!originalImage || stagedFurniture.length === 0) return;
    setIsAutoArranging(true);
    try {
      const suggestions = await autoArrangeLayout(originalImage, selectedRoom, stagedFurniture);
      pushToHistory();
      setStagedFurniture((prev) =>
        prev.map((item) => ({
          ...item,
          orientation: suggestions[item.name] || item.orientation,
        }))
      );
    } catch (error) {
      console.error('Auto arrange failed', error);
    } finally {
      setIsAutoArranging(false);
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

  const handleGenerate = async (prompt: string, highRes = false, isReroll = false) => {
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
      let finalPrompt = prompt;
      if (isReroll) {
        finalPrompt = `${prompt}. Provide a completely different variation with new furniture shapes and layout.`;
      }
      lastPromptRef.current = prompt;

      const sourceImage = generatedImage && activePanel === 'cleanup' ? generatedImage : generatedImage || originalImage;
      const resultImage = await generateRoomDesign(sourceImage, finalPrompt, maskImage, highRes);
      const newColors = await analyzeRoomColors(resultImage);

      setGeneratedImage(resultImage);
      setColors(newColors);
      setMaskImage(null);
      setIsMaskMode(false);

      const generatedState: HistoryState = {
        generatedImage: resultImage,
        stagedFurniture,
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

  const handleSendMessage = async (text: string) => {
    const chat = getChatSession();
    if (!chat) return;

    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() }]);
    setIsChatLoading(true);

    try {
      const responseText = await sendMessageToChat(chat, text, generatedImage || originalImage);
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() }]);
      const editMatch = responseText.match(/\[EDIT: (.*?)\]/);
      if (editMatch && editMatch[1]) handleGenerate(editMatch[1]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: 'Error sending message.', timestamp: Date.now() },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const changeDetectedRoom = (room: FurnitureRoomType) => {
    pushToHistory();
    setDetectedRoom(room);
    setSelectedRoom(room);
    setShowRoomPicker(false);
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

  const panelMeta: Record<
    'tools' | 'cleanup' | 'chat' | 'history',
    { title: string; description: string }
  > = {
    tools: {
      title: 'Design Studio',
      description: 'Primary generation controls.',
    },
    cleanup: {
      title: 'Cleanup Tools',
      description: 'Mask and remove objects while preserving architectural structure.',
    },
    chat: {
      title: 'Design Chat',
      description: 'Describe edits in plain language and let the assistant propose changes.',
    },
    history: {
      title: 'Saved Concepts',
      description: 'Restore previous sessions and compare alternatives quickly.',
    },
  };

  const toolsModeDescription: Record<StageMode, string> = {
    text: 'Text mode is active. Describe your design direction, then generate.',
    packs: 'Packs mode is active. Pick a style pack, then generate.',
    furniture: 'Furniture staging is visible for planning but disabled in this beta.',
  };

  return (
    <div className="studio-shell h-screen overflow-hidden flex flex-col">
      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/52 backdrop-blur-sm p-4">
          <div className="premium-surface-strong w-full max-w-md rounded-[2rem] p-8 sm:p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl cta-secondary text-[var(--color-primary)]">
              <Key size={30} />
            </div>
            <h2 className="font-display text-3xl font-semibold">Pro Rendering</h2>
            <p className="mt-2 text-sm text-[var(--color-text)]/80">
              Select a Gemini Pro API key from a paid GCP project to enable 2K renders.
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
                  <Zap size={14} /> 2K Render
                </p>
                <h3 className="font-display mt-3 text-2xl">Confirm High-Fidelity Pass</h3>
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
              Confirm and Render
            </button>
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
                Real Estate Image Studio
              </p>
            </div>
          </div>

          {originalImage && (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setShowRoomPicker(!showRoomPicker)}
                className="pill-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
              >
                {detectedRoom ? (
                  <>
                    <BrainCircuit size={14} className="text-[var(--color-primary)]" />
                    <span>
                      Room: <span className="text-[var(--color-primary)]">{detectedRoom}</span>
                    </span>
                    <ChevronDown size={13} className={`transition-transform ${showRoomPicker ? 'rotate-180' : ''}`} />
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                    Analyzing room
                  </span>
                )}
              </button>

              {showRoomPicker && (
                <div className="absolute left-0 top-full mt-2 w-52 rounded-2xl premium-surface p-2 z-30">
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
          )}

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
            {generatedImage && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="cta-secondary rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => (hasProKey ? setShowProConfirm(true) : setShowKeyPrompt(true))}
                  disabled={isEnhancing}
                  className={`rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-55 ${
                    hasProKey ? 'cta-primary' : 'cta-secondary'
                  }`}
                >
                  <Zap size={14} className={isEnhancing ? 'animate-pulse' : ''} />
                  <span className="hidden sm:inline">{hasProKey ? 'Pro 2K' : 'Enable Pro'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setOriginalImage(null);
                setStageMode('text');
              }}
              className="cta-secondary rounded-xl p-2 text-[var(--color-text)]"
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
                <Sparkles size={14} /> Before / After Studio
              </div>
              <h2 className="font-display text-[clamp(2.3rem,7vw,5.3rem)] leading-[0.92] font-semibold text-[var(--color-ink)]">
                Re-stage interiors with editorial precision.
              </h2>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-[var(--color-text)]/84">
                Upload a property photo and shape renovation-ready visuals with guided prompts, selective cleanup, and AI-assisted
                staging.
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
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <nav className="shrink-0 w-full lg:w-[172px] premium-surface border-r panel-divider flex lg:flex-col items-center justify-center lg:justify-start gap-2 lg:gap-2 py-2 lg:py-5 order-2 lg:order-1 sticky bottom-0 z-30">
            <div className="hidden lg:block px-3 pb-2">
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
                  className={`flex h-12 w-12 lg:h-auto lg:w-[152px] lg:px-3 lg:py-2.5 items-center justify-center lg:justify-start gap-2 rounded-2xl border transition-all ${
                    active && item.available
                      ? 'cta-primary border-white/15 shadow-[0_12px_24px_rgba(3,105,161,0.3)]'
                      : item.available
                        ? 'cta-secondary border-[var(--color-border)] text-[var(--color-text)] hover:bg-white'
                        : 'border-[var(--color-border)] bg-slate-100/70 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {item.icon}
                  <span className="hidden lg:inline text-[11px] uppercase tracking-[0.14em]">{item.label}</span>
                  {!item.available && (
                    <span className="hidden lg:inline ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700/90">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <main className="order-1 lg:order-2 flex-1 overflow-auto editor-canvas-bg p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className="premium-surface-strong rounded-[2rem] p-2 sm:p-3">
                <div className="relative overflow-hidden rounded-[1.5rem] border panel-divider bg-[var(--color-bg-deep)] aspect-[4/3] sm:aspect-video">
                  {generatedImage && activePanel !== 'cleanup' && !isMaskMode ? (
                    <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
                  ) : (
                    <MaskCanvas
                      imageSrc={generatedImage || originalImage}
                      onMaskChange={setMaskImage}
                      isActive={activePanel === 'cleanup' || isMaskMode}
                    />
                  )}

                  {generatedImage && activePanel === 'tools' && (
                    <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
                      <button
                        type="button"
                        onClick={() => setIsMaskMode(!isMaskMode)}
                        className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide border transition-all ${
                          isMaskMode
                            ? 'cta-primary border-white/10'
                            : 'cta-secondary border-[var(--color-border)] text-[var(--color-text)]'
                        }`}
                      >
                        {isMaskMode ? <X size={14} /> : <Send size={14} />}
                        {isMaskMode ? 'Exit Selection' : 'Select Area to Re-generate'}
                      </button>
                    </div>
                  )}

                  <div className="absolute right-3 top-3 z-20 rounded-full bg-[var(--color-ink)]/76 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">
                    {isGenerating ? 'Rendering...' : 'Studio Live'}
                  </div>
                </div>
              </div>
            </div>
          </main>

          <aside className="order-3 w-full lg:w-[430px] shrink-0 premium-surface border-l panel-divider overflow-y-auto scrollbar-hide">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6">
              <div className="subtle-card rounded-2xl px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Workspace Panel</p>
                <h3 className="font-display text-xl mt-1">{panelMeta[activePanel].title}</h3>
                <p className="text-sm text-[var(--color-text)]/78 mt-1">
                  {activePanel === 'tools' ? toolsModeDescription[stageMode] : panelMeta[activePanel].description}
                </p>
              </div>
              {!hasProKey && generatedImage && (
                <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  Pro 2K is disabled until an API key is selected.
                </div>
              )}
            </div>

            {activePanel === 'tools' && (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                  Beta focus: <strong>Design Studio</strong> only. Cleanup, Chat, and History are staged as coming-soon modules.
                  Feedback intake is active below.
                </div>
                <ColorAnalysis colors={colors} isLoading={isAnalyzing} />
                <RenovationControls
                  activeMode="design"
                  hasGenerated={!!generatedImage}
                  onGenerate={(p) => handleGenerate(p, false)}
                  onReroll={() => handleGenerate(lastPromptRef.current || 'New variation.', false, true)}
                  onStageModeChange={setStageMode}
                  isGenerating={isGenerating}
                  hasMask={!!maskImage}
                  selectedRoom={selectedRoom}
                />
                <BetaFeedbackForm
                  selectedRoom={selectedRoom}
                  hasGenerated={!!generatedImage}
                  stagedFurnitureCount={stagedFurniture.length}
                  stageMode={stageMode}
                />
              </div>
            )}

            {activePanel === 'cleanup' && (
              <div className="p-5 sm:p-6 space-y-5">
                <RenovationControls
                  activeMode="cleanup"
                  hasGenerated={!!generatedImage}
                  onGenerate={(p) => handleGenerate(p, false)}
                  onReroll={() => handleGenerate(lastPromptRef.current || 'New variation.', false, true)}
                  isGenerating={isGenerating}
                  hasMask={!!maskImage}
                  selectedRoom={selectedRoom}
                />
              </div>
            )}

            {activePanel === 'chat' && (
              <ChatInterface messages={messages} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
            )}

            {activePanel === 'history' && (
              <div className="p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="font-display text-2xl">Saved Concepts</h2>
                  <p className="text-sm text-[var(--color-text)]/75">Restore previous renders and continue editing.</p>
                </div>

                {savedStages.length === 0 ? (
                  <div className="premium-surface rounded-3xl p-6 text-center text-[var(--color-text)]/80">
                    <p className="font-semibold text-[var(--color-ink)]">No saved renders yet</p>
                    <p className="text-sm mt-1">Generate a design to start building your concept library.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {savedStages.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setOriginalImage(s.originalImage);
                          setGeneratedImage(s.generatedImage);
                        }}
                        className="group relative aspect-video overflow-hidden rounded-2xl border panel-divider premium-surface text-left"
                      >
                        <img src={s.generatedImage} alt={s.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-90" />
                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/80">Saved Session</p>
                          <p className="text-sm font-semibold">Restore Concept</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default App;
