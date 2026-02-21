
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateRoomDesign, analyzeRoomColors, createChatSession, sendMessageToChat, autoArrangeLayout, detectRoomType } from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import CompareSlider from './components/CompareSlider';
import RenovationControls from './components/StyleControls';
import MaskCanvas from './components/MaskCanvas';
import ChatInterface from './components/ChatInterface';
import ColorAnalysis from './components/ColorAnalysis';
import { ChatMessage, ColorData, StagedFurniture, SavedLayout, FurnitureRoomType, SavedStage, HistoryState } from './types';
import { RefreshCcw, Camera, Save, Check, Sparkles, Zap, Key, LayoutPanelLeft, MessageSquare, History, MousePointer2, Download, Trash2, ExternalLink, HelpCircle, AlertTriangle, X, BrainCircuit, ChevronDown, Eraser, Undo2, Redo2, Send, LayoutGrid } from 'lucide-react';

const orientations: StagedFurniture['orientation'][] = ['Default', 'Angled Left', 'Angled Right', 'Facing Away', 'Profile View'];



const App: React.FC = () => {
  // Image State
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  
  // UI Panels State
  const [activePanel, setActivePanel] = useState<'tools' | 'chat' | 'history' | 'cleanup'>('tools');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoArranging, setIsAutoArranging] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [isMaskMode, setIsMaskMode] = useState(false);

  // Analysis State
  const [colors, setColors] = useState<ColorData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedRoom, setDetectedRoom] = useState<FurnitureRoomType | null>(null);

  // Design State
  const [stagedFurniture, setStagedFurniture] = useState<StagedFurniture[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<FurnitureRoomType>('Living Room');
  
  // History State
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<any>(null);

  // Storage State
  const [savedStages, setSavedStages] = useState<SavedStage[]>([]);
  const lastPromptRef = useRef<string>("");



  useEffect(() => {
    const savedS = localStorage.getItem('realestate_ai_stages');
    if (savedS) setSavedStages(JSON.parse(savedS));
  }, []);

  // Helper to save current state to history
  const pushToHistory = useCallback((newState?: Partial<HistoryState>) => {
    const currentState: HistoryState = {
      generatedImage,
      stagedFurniture,
      selectedRoom,
      colors,
      ...newState
    };

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      // Limit history to 30 snapshots to preserve memory
      if (newHistory.length >= 30) newHistory.shift();
      return [...newHistory, currentState];
    });
    setHistoryIndex(prev => Math.min(prev + 1, 29));
  }, [generatedImage, stagedFurniture, selectedRoom, colors, historyIndex]);

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

  // Keyboard Shortcuts
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
    
    try {
      const [colorData, roomType] = await Promise.all([
        analyzeRoomColors(base64),
        detectRoomType(base64)
      ]);
      setColors(colorData);
      setDetectedRoom(roomType);
      setSelectedRoom(roomType);
      
      // Initial history state
      const initialState: HistoryState = {
        generatedImage: null,
        stagedFurniture: [],
        selectedRoom: roomType,
        colors: colorData
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
    pushToHistory(); // Save before change
    const newItem: StagedFurniture = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      orientation: 'Default'
    };
    setStagedFurniture(prev => [...prev, newItem]);
  };

  const removeFurniture = (id: string) => {
    pushToHistory(); // Save before change
    setStagedFurniture(prev => prev.filter(item => item.id !== id));
  };

  const rotateFurniture = (id: string) => {
    pushToHistory(); // Save before change
    setStagedFurniture(prev => prev.map(item => {
      if (item.id === id) {
        const currentIndex = orientations.indexOf(item.orientation);
        const nextIndex = (currentIndex + 1) % orientations.length;
        return { ...item, orientation: orientations[nextIndex] };
      }
      return item;
    }));
  };

  const handleAutoArrange = async () => {
    if (!originalImage || stagedFurniture.length === 0) return;
    setIsAutoArranging(true);
    try {
      const suggestions = await autoArrangeLayout(originalImage, selectedRoom, stagedFurniture);
      pushToHistory(); // Save before applying arrangement
      setStagedFurniture(prev => prev.map(item => ({
        ...item,
        orientation: suggestions[item.name] || item.orientation
      })));
    } catch (error) {
      console.error("Auto arrange failed", error);
    } finally {
      setIsAutoArranging(false);
    }
  };

  const handleApiKeySelection = async () => {
    await (window as any).aistudio.openSelectKey();
    setShowKeyPrompt(false);
  };

  const handleGenerate = async (prompt: string, highRes: boolean = false, isReroll: boolean = false) => {
    if (!originalImage) return;

    if (highRes) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
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
      if (isReroll) finalPrompt = `${prompt}. Provide a completely different variation with new furniture shapes and layout.`;
      lastPromptRef.current = prompt;

      const sourceImage = (generatedImage && activePanel === 'cleanup') ? generatedImage : (generatedImage || originalImage);
      const resultImage = await generateRoomDesign(sourceImage, finalPrompt, maskImage, highRes);
      const newColors = await analyzeRoomColors(resultImage);
      
      // Update state and push to history
      setGeneratedImage(resultImage);
      setColors(newColors);
      setMaskImage(null); 
      setIsMaskMode(false);
      
      // Push the NEW state to history after generation completes
      const generatedState: HistoryState = {
        generatedImage: resultImage,
        stagedFurniture,
        selectedRoom,
        colors: newColors
      };
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        return [...newHistory, generatedState];
      });
      setHistoryIndex(prev => prev + 1);

    } catch (error: any) {
      if (error.message === 'API_KEY_REQUIRED' || error.message?.includes("Requested entity was not found")) {
        setShowKeyPrompt(true);
      } else {
        alert("Generation failed. Check your connection.");
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
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() }]);
    setIsChatLoading(true);
    try {
      const responseText = await sendMessageToChat(chat, text, generatedImage || originalImage);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() }]);
      const editMatch = responseText.match(/\[EDIT: (.*?)\]/);
      if (editMatch && editMatch[1]) handleGenerate(editMatch[1]);
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Error sending message.", timestamp: Date.now() }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const changeDetectedRoom = (room: FurnitureRoomType) => {
    pushToHistory(); // Save before change
    setDetectedRoom(room);
    setSelectedRoom(room);
    setShowRoomPicker(false);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Modals */}
      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl">
            <div className="bg-indigo-100 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto text-indigo-600 rotate-3"><Key size={40} /></div>
            <h2 className="text-3xl font-bold text-center mb-4 font-display">Pro Rendering</h2>
            <p className="text-gray-600 text-center mb-8">Requires a Gemini Pro API key from a paid GCP project.</p>
            <div className="space-y-3">
              <button onClick={handleApiKeySelection} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl">Select API Key</button>
              <button onClick={() => setShowKeyPrompt(false)} className="w-full bg-slate-100 text-slate-500 font-bold py-4 rounded-2xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showProConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] p-8 max-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-indigo-600"><Zap size={24} /><h3 className="text-lg font-bold">2K Rendering</h3></div>
              <button onClick={() => setShowProConfirm(false)} className="text-slate-400"><X size={20}/></button>
            </div>
            <p className="text-sm text-slate-600 mb-8 leading-relaxed">This triggers a high-fidelity 2K render. Ensure your GCP billing is active.</p>
            <button onClick={() => handleGenerate(lastPromptRef.current || "Finalize with realistic textures.", true)} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl mb-2">Confirm & Render</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-40 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-200"><Camera size={22} /></div>
            <h1 className="text-xl font-bold text-slate-900 font-display hidden sm:block">Studio<span className="text-indigo-600">AI</span></h1>
          </div>
          
          {originalImage && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button 
                  onClick={() => setShowRoomPicker(!showRoomPicker)}
                  className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  {detectedRoom ? (
                    <div className="flex items-center gap-2">
                      <BrainCircuit size={14} className="text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900">Room: <span className="text-indigo-600">{detectedRoom}</span></span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${showRoomPicker ? 'rotate-180' : ''}`} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 animate-pulse"><div className="w-2 h-2 rounded-full bg-indigo-600" /><span className="text-[10px] font-bold text-slate-400">Analyzing...</span></div>
                  )}
                </button>
                {showRoomPicker && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[60]">
                    {['Living Room', 'Bedroom', 'Dining Room', 'Office', 'Kitchen', 'Primary Bedroom', 'Exterior'].map(r => (
                      <button key={r} onClick={() => changeDetectedRoom(r as any)} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl">{r}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Header Undo / Redo */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
                 <button 
                   onClick={undo}
                   disabled={historyIndex <= 0 || isGenerating}
                   className="p-1.5 rounded-lg hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 text-slate-500 transition-all"
                   title="Undo (Ctrl+Z)"
                 >
                   <Undo2 size={16} />
                 </button>
                 <button 
                   onClick={redo}
                   disabled={historyIndex >= history.length - 1 || isGenerating}
                   className="p-1.5 rounded-lg hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 text-slate-500 transition-all"
                   title="Redo (Ctrl+Y)"
                 >
                   <Redo2 size={16} />
                 </button>
              </div>

            </div>
          )}
        </div>

        {originalImage && (
          <div className="flex items-center gap-3">
             {generatedImage && (
               <>
                 <button onClick={handleDownload} className="text-sm font-bold bg-white text-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center gap-2">
                   <Download size={16} /><span className="hidden sm:inline">Export</span>
                 </button>
                 <button onClick={() => setShowProConfirm(true)} disabled={isEnhancing} className="text-sm font-bold bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-slate-200">
                   <Zap size={16} className={isEnhancing ? 'animate-pulse' : ''} /><span className="hidden sm:inline">Pro 2K</span>
                 </button>
               </>
             )}
             <button onClick={() => setOriginalImage(null)} className="p-2.5 bg-slate-50 text-slate-500 rounded-xl hover:text-slate-900"><RefreshCcw size={20} /></button>
          </div>
        )}
      </header>

      {!originalImage ? (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 bg-white">
          {/* Left Pane: Content & Uploader */}
          <div className="flex flex-col items-start justify-center p-8 lg:p-16">
            <div className="max-w-md w-full">
              <div className="inline-block p-4 bg-slate-100 rounded-3xl mb-6">
                <Sparkles size={40} className="text-indigo-600" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 font-display leading-tight">
                Virtual Staging <span className="text-indigo-600">Reimagined.</span>
              </h2>
              <p className="text-slate-500 text-lg font-medium mt-4">
                Upload a room photo to start your digital makeover. Instantly redesign with new furniture, flooring, and more.
              </p>
              <div className="bg-white mt-8 p-2 rounded-[2.5rem] shadow-2xl border border-slate-100">
                <ImageUploader onImageUpload={handleImageUpload} isAnalyzing={isAnalyzing} />
              </div>
            </div>
          </div>

          {/* Right Pane: Image */}
          <div className="hidden lg:block h-full w-full">
            <img 
              src="https://images.unsplash.com/photo-1616046229478-9901c5536a45?q=80&w=1920&h=1080&fit=crop"
              alt="Beautifully staged living room"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </main>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <nav className="shrink-0 w-full lg:w-20 bg-white border-r border-slate-200 flex flex-row lg:flex-col items-center justify-center lg:justify-start py-0 lg:py-6 gap-2 sm:gap-4 z-40 order-2 lg:order-1">
            <button onClick={() => setActivePanel('tools')} className={`p-4 rounded-2xl transition-all ${activePanel === 'tools' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`} title="Design Studio"><LayoutGrid size={24} /></button>
            <button onClick={() => setActivePanel('cleanup')} className={`p-4 rounded-2xl transition-all ${activePanel === 'cleanup' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`} title="Canvas Cleanup"><Eraser size={24} /></button>
            <button onClick={() => setActivePanel('chat')} className={`p-4 rounded-2xl transition-all ${activePanel === 'chat' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`} title="Chat"><MessageSquare size={24} /></button>
            <button onClick={() => setActivePanel('history')} className={`p-4 rounded-2xl transition-all ${activePanel === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`} title="History"><History size={24} /></button>
          </nav>

          <main className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center justify-center order-1 lg:order-2 editor-canvas-bg">
            <div className="w-full max-w-5xl space-y-4">
              <div className="relative bg-white rounded-3xl shadow-2xl p-2 border border-slate-200">
                <div className="overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-video bg-slate-100">
                  {generatedImage && activePanel !== 'cleanup' && !isMaskMode ? (
                    <CompareSlider originalImage={originalImage} generatedImage={generatedImage} />
                  ) : (
                    <MaskCanvas imageSrc={generatedImage || originalImage} onMaskChange={setMaskImage} isActive={activePanel === 'cleanup' || isMaskMode} />
                  )}
                </div>
                {generatedImage && activePanel === 'tools' && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                    <button 
                      onClick={() => setIsMaskMode(!isMaskMode)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-xs shadow-xl transition-all border ${
                        isMaskMode ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isMaskMode ? <X size={14} /> : <Send size={14} />}
                      {isMaskMode ? 'Exit Selection' : 'Select Area to Re-generate'}
                    </button>
                  </div>
                )}
                <div className="absolute -top-3 -right-3 z-30">
                   <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg ${isGenerating ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-900 text-white'}`}>
                     {isGenerating ? 'Rendering...' : 'Studio Live'}
                   </div>
                </div>
              </div>


            </div>
          </main>

          <aside className="shrink-0 w-full lg:w-[420px] bg-slate-50 border-l border-slate-200 overflow-y-auto scrollbar-hide z-30 order-3">
            {activePanel === 'tools' && (
              <div className="p-6 space-y-6">
                <ColorAnalysis colors={colors} isLoading={isAnalyzing} />
                <RenovationControls 
                  activeMode={'design'}
                  hasGenerated={!!generatedImage}
                  onGenerate={(p) => handleGenerate(p, false)} 
                  onReroll={() => handleGenerate(lastPromptRef.current || "New variation.", false, true)}
                  isGenerating={isGenerating}
                  hasMask={!!maskImage}
                  stagedFurniture={stagedFurniture}
                  addFurniture={addFurniture}
                  removeFurniture={removeFurniture}
                  rotateFurniture={rotateFurniture}
                  onAutoArrange={handleAutoArrange}
                  isAutoArranging={isAutoArranging}
                  savedLayouts={[]}
                  saveCurrentLayout={() => {}}
                  loadLayout={() => {}}
                  selectedRoom={selectedRoom}
                  setSelectedRoom={setSelectedRoom}
                />
              </div>
            )}
            {activePanel === 'cleanup' && (
               <div className="p-6 space-y-6">
                <RenovationControls 
                    activeMode={'cleanup'}
                    hasGenerated={!!generatedImage}
                    onGenerate={(p) => handleGenerate(p, false)} 
                    onReroll={() => handleGenerate(lastPromptRef.current || "New variation.", false, true)}
                    isGenerating={isGenerating}
                    hasMask={!!maskImage}
                    stagedFurniture={stagedFurniture}
                    addFurniture={addFurniture}
                    removeFurniture={removeFurniture}
                    rotateFurniture={rotateFurniture}
                    onAutoArrange={handleAutoArrange}
                    isAutoArranging={isAutoArranging}
                    savedLayouts={[]}
                    saveCurrentLayout={() => {}}
                    loadLayout={() => {}}
                    selectedRoom={selectedRoom}
                    setSelectedRoom={setSelectedRoom}
                  />
              </div>
            )}
            {activePanel === 'chat' && <ChatInterface messages={messages} onSendMessage={handleSendMessage} isLoading={isChatLoading} />}
            {activePanel === 'history' && (
               <div className="p-6 space-y-6">
                 <h2 className="text-xl font-bold text-slate-900 font-display">Saved Concepts</h2>
                 {savedStages.length === 0 ? <p className="text-slate-400 text-sm">No saved renders yet.</p> : (
                   <div className="grid gap-4">
                     {savedStages.map(s => (
                       <div key={s.id} onClick={() => { setOriginalImage(s.originalImage); setGeneratedImage(s.generatedImage); }} className="relative aspect-video rounded-2xl overflow-hidden cursor-pointer group border border-slate-100">
                         <img src={s.generatedImage} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><p className="text-white text-xs font-bold">Restore Session</p></div>
                       </div>
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
