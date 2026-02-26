import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Role = 'brokerage_admin' | 'office_admin' | 'team_lead' | 'agent' | 'reviewer'

interface User {
  id: string
  name: string
  email: string
  role: Role
  brokerage: string
  office?: string
  initials: string
}

interface AuthCtx {
  user: User | null
  login: (email: string, password: string, role: Role) => Promise<void>
  signup: (name: string, email: string, password: string, role: Role) => Promise<void>
  logout: () => void
}

interface GeneratedImage {
  id: string
  url: string
  prompt: string
  mode: string
  timestamp: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({} as AuthCtx)
const useAuth = () => useContext(AuthContext)

const ROLE_LABELS: Record<Role, string> = {
  brokerage_admin: 'Brokerage Admin',
  office_admin: 'Office Admin',
  team_lead: 'Team Lead',
  agent: 'Agent',
  reviewer: 'Reviewer',
}

const ROLE_BADGE_CLASS: Record<Role, string> = {
  brokerage_admin: 'role-badge-admin',
  office_admin: 'role-badge-admin',
  team_lead: 'role-badge-reviewer',
  agent: 'role-badge-agent',
  reviewer: 'role-badge-reviewer',
}

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icon = {
  Upload: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Sparkle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.72L20 9.5l-4.94 4.14L16.68 21 12 17.77 7.32 21l1.62-7.36L4 9.5l6.12-.78z"/>
    </svg>
  ),
  Undo: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
    </svg>
  ),
  Redo: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Share: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  Compare: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/>
    </svg>
  ),
  Image: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Sky: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  ),
  Broom: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 20l8-8M18 4l-4 4M14 8L6 16M6 20l4-4"/>
    </svg>
  ),
  Home: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Text: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
      <line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  ),
  Chat: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  History: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14"/><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <polyline points="3 3 3 8 8 8"/>
    </svg>
  ),
  Saved: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Grid: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M1 12h2M21 12h2M12 1v2M12 21v2"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Copy: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  Send: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  LogOut: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Loader: () => (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Arrows: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  Jobs: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  ),
  Dashboard: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: 'success'|'error'|'info'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`toast ${type}`}>
      {type === 'success' && <Icon.Check />}
      {type === 'error' && <span style={{color:'var(--red)'}}>✕</span>}
      {msg}
    </div>
  )
}

// ─── COMPARE SLIDER ───────────────────────────────────────────────────────────
function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pct, setPct] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = useCallback((clientX: number) => {
    if (!ref.current) return
    const { left, width } = ref.current.getBoundingClientRect()
    setPct(Math.max(5, Math.min(95, ((clientX - left) / width) * 100)))
  }, [])

  return (
    <div
      ref={ref}
      className="compare-wrap"
      onMouseDown={(e) => { dragging.current = true; move(e.clientX) }}
      onMouseMove={(e) => { if (dragging.current) move(e.clientX) }}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <div className="compare-before">
        <img src={before} alt="Before" />
        <span className="compare-label" style={{left:'0.6rem'}}>Before</span>
      </div>
      <div className="compare-after" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
        <img src={after} alt="After" />
        <span className="compare-label" style={{right:'0.6rem',left:'auto'}}>After</span>
      </div>
      <div className="compare-line" style={{ left: `${pct}%` }}>
        <div className="compare-handle" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/><polyline points="15 18 9 12 15 6" transform="translate(-9,0)"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
function AuthRight() {
  return (
    <div className="auth-right">
      <div className="auth-right-bg" />
      <div className="auth-right-pattern" />
      <div className="auth-right-overlay" />
      <div className="auth-right-top">
        <div className="auth-showcase">
          <div className="auth-showcase-label">What you can do</div>
          <div className="auth-showcase-items">
            {['Virtual staging in seconds','AI twilight & sky replacement','Declutter & object removal','Renovation previews','AI listing copy generation'].map(item => (
              <div key={item} className="auth-showcase-item">
                <div className="auth-showcase-dot" />
                <span className="auth-showcase-text">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-right-content">
        <div className="auth-testimonial">"Studio AI cut our listing prep from three days to three hours — and the results look better than ever."</div>
        <div className="auth-testimonial-attr">Managing Broker · Berkshire, Pacific Northwest</div>
      </div>
    </div>
  )
}

function LoginScreen({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('agent')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!email || !password) { setErr('Please fill in all fields'); return }
    setErr(''); setLoading(true)
    try { await login(email, password, role) }
    catch { setErr('Invalid credentials. Try any email + 6+ char password.') }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div className="auth-logo">
          <div className="auth-logo-mark">S</div>
          <div className="auth-logo-text">Studio<span>AI</span></div>
        </div>
        <div className="auth-eyebrow">Visual Operations Platform</div>
        <h1 className="auth-headline">Welcome <em>back.</em></h1>
        <p className="auth-sub">Sign in to access your visual workspace and continue transforming listings with AI.</p>
        <div className="auth-input-group">
          <label className="auth-form-label">Email</label>
          <input className="auth-input" type="email" placeholder="you@brokerage.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} />
        </div>
        <div className="auth-input-group">
          <label className="auth-form-label">Password</label>
          <input className="auth-input" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} />
        </div>
        <div className="auth-input-group">
          <label className="auth-form-label">I am signing in as</label>
          <select className="auth-select" value={role} onChange={e=>setRole(e.target.value as Role)}>
            <option value="agent">Agent</option>
            <option value="reviewer">Reviewer</option>
            <option value="team_lead">Team Lead</option>
            <option value="office_admin">Office Admin</option>
            <option value="brokerage_admin">Brokerage Admin</option>
          </select>
        </div>
        {err && <p style={{color:'var(--red)',fontSize:'0.78rem',marginBottom:'0.5rem'}}>{err}</p>}
        <button className="auth-btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
        <div className="auth-switch">
          Don't have an account?{' '}
          <button onClick={onSwitch}>Create one</button>
        </div>
      </div>
      <AuthRight />
    </div>
  )
}

function SignupScreen({ onSwitch }: { onSwitch: () => void }) {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('agent')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name || !email || !password) { setErr('Please fill in all fields'); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return }
    setErr(''); setLoading(true)
    try { await signup(name, email, password, role) }
    catch { setErr('Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div className="auth-logo">
          <div className="auth-logo-mark">S</div>
          <div className="auth-logo-text">Studio<span>AI</span></div>
        </div>
        <div className="auth-eyebrow">Join the platform</div>
        <h1 className="auth-headline">Get <em>started</em> today.</h1>
        <p className="auth-sub">Create your account to start transforming listings with professional AI visual enhancements.</p>
        <div className="auth-input-group">
          <label className="auth-form-label">Full Name</label>
          <input className="auth-input" type="text" placeholder="Jordan Smith" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="auth-input-group">
          <label className="auth-form-label">Work Email</label>
          <input className="auth-input" type="email" placeholder="you@brokerage.com" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div className="auth-input-group">
          <label className="auth-form-label">Password</label>
          <input className="auth-input" type="password" placeholder="Min 6 characters" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} />
        </div>
        <div className="auth-input-group">
          <label className="auth-form-label">I am a</label>
          <select className="auth-select" value={role} onChange={e=>setRole(e.target.value as Role)}>
            <option value="agent">Agent</option>
            <option value="reviewer">Reviewer</option>
            <option value="team_lead">Team Lead</option>
            <option value="office_admin">Office Admin</option>
            <option value="brokerage_admin">Brokerage Admin</option>
          </select>
        </div>
        {err && <p style={{color:'var(--red)',fontSize:'0.78rem',marginBottom:'0.5rem'}}>{err}</p>}
        <button className="auth-btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
        <div className="auth-switch">
          Already have an account?{' '}
          <button onClick={onSwitch}>Sign in</button>
        </div>
      </div>
      <AuthRight />
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
type AppView = 'studio' | 'jobs' | 'saved' | 'history' | 'reports' | 'settings'

const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1200&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80',
]

type EditorMode = 'stage' | 'twilight' | 'sky' | 'declutter' | 'reno' | 'copy' | 'chat'

function MainApp() {
  const { user, logout } = useAuth()
  const [view, setView] = useState<AppView>('studio')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'|'info'}|null>(null)
  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => setToast({msg,type})

  // Studio state
  const [originalImage, setOriginalImage] = useState<string|null>(null)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [savedImages, setSavedImages] = useState<GeneratedImage[]>([])
  const [activeGenerated, setActiveGenerated] = useState<GeneratedImage|null>(null)
  const [mode, setMode] = useState<EditorMode>('stage')
  const [prompt, setPrompt] = useState('')
  const [selectedPack, setSelectedPack] = useState<string|null>(null)
  const [multiGen, setMultiGen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [skyStyle, setSkyStyle] = useState<string|null>(null)
  const [renoDetails, setRenoDetails] = useState('')
  const [copyResult, setCopyResult] = useState<{headline:string;description:string;socialCaption:string}|null>(null)
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [roomLabel, setRoomLabel] = useState('Living Room')
  const [roomDropOpen, setRoomDropOpen] = useState(false)
  const [accordionOpen, setAccordionOpen] = useState<EditorMode|null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [historyImages] = useState<GeneratedImage[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', content: "Hello! I'm your AI staging consultant. Upload a photo and I'll help you plan the perfect visual enhancement strategy for this property." }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      setOriginalImage(e.target?.result as string)
      setActiveGenerated(null)
      setCompareMode(false)
      setCopyResult(null)
      showToast('Image loaded — ready to transform')
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const loadSample = () => {
    const url = SAMPLE_IMAGES[Math.floor(Math.random() * SAMPLE_IMAGES.length)]
    setOriginalImage(url)
    setActiveGenerated(null)
    setCompareMode(false)
    setCopyResult(null)
    showToast('Sample property loaded')
  }

  const buildPrompt = (): string => {
    if (mode === 'stage') {
      const packHints: Record<string, string> = {
        'Modern Minimal': 'minimalist modern furniture with clean lines, neutral tones, Scandinavian aesthetic',
        'Warm Luxury': 'warm luxury staging with rich textures, gold accents, plush seating, ambient lighting',
        'Coastal Light': 'coastal bright staging with light linen, natural wood, ocean-inspired palette',
        'Urban Loft': 'urban industrial loft staging with exposed elements, dark metals, statement art',
      }
      const packDesc = selectedPack ? packHints[selectedPack] || selectedPack : ''
      return `Professionally stage this ${roomLabel.toLowerCase()} with ${packDesc}${prompt ? `. Additional details: ${prompt}` : ''}. Photorealistic real estate photography. No text overlays. Keep room dimensions, windows and architectural features exactly as shown.`
    }
    if (mode === 'twilight') return `Convert this exterior photo to a stunning twilight/dusk scene. Deep blue sky with warm golden interior lighting glowing through windows. Professional HDR real estate photography. ${prompt || 'Cinematic and atmospheric.'}`
    if (mode === 'sky') return `Replace the sky in this photo with a ${skyStyle || 'dramatic'} sky. Keep all ground elements, buildings and landscaping exactly unchanged. Photorealistic result. ${prompt}`
    if (mode === 'declutter') return `Remove all personal items, clutter and furniture from this space. Leave clean empty rooms showing only permanent fixtures, architectural elements and built-ins. White walls, clean floors. ${prompt}`
    if (mode === 'reno') return `Show a photorealistic renovation preview of this space. ${renoDetails || 'Modern update with fresh paint, updated fixtures and flooring'}. ${prompt}`
    return prompt
  }

  const generateImage = async () => {
    if (!originalImage) { showToast('Upload a photo first', 'error'); return }
    if (mode === 'stage' && !selectedPack && !prompt) { showToast('Choose a staging pack or describe your vision', 'error'); return }

    setGenerating(true)
    setCompareMode(false)

    try {
      const count = multiGen ? 3 : 1
      const newImages: GeneratedImage[] = []

      for (let i = 0; i < count; i++) {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800))
        const samplePool = [
          'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80',
          'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80',
          'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1200&q=80',
          'https://images.unsplash.com/photo-1564540583246-934409427776?w=1200&q=80',
          'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80',
          'https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?w=1200&q=80',
          'https://images.unsplash.com/photo-1505577058444-a3dab90d4253?w=1200&q=80',
          'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80',
        ]
        newImages.push({
          id: `gen-${Date.now()}-${i}`,
          url: samplePool[Math.floor(Math.random() * samplePool.length)],
          prompt: buildPrompt(),
          mode,
          timestamp: Date.now(),
        })
      }

      setGeneratedImages(prev => [...newImages, ...prev])
      setActiveGenerated(newImages[0])
      showToast(multiGen ? `${count} variations generated` : 'Image transformed successfully')
    } catch {
      showToast('Generation failed. Please try again.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const generateCopy = async () => {
    if (!originalImage) { showToast('Upload a photo first', 'error'); return }
    setGeneratingCopy(true)
    await new Promise(r => setTimeout(r, 2200))
    setCopyResult({
      headline: `Stunning ${roomLabel} with Designer Finishes & Natural Light`,
      description: `Welcome to this exceptional residence where timeless elegance meets modern living. This beautifully appointed ${roomLabel.toLowerCase()} features soaring ceilings, premium hardwood floors, and an abundance of natural light that creates a warm, inviting atmosphere throughout. The thoughtfully designed space offers seamless flow for both everyday living and sophisticated entertaining. Every detail has been curated with the discerning buyer in mind.`,
      socialCaption: `✨ Just listed — where luxury meets livability. This incredible space speaks for itself. DM for a private showing. #JustListed #LuxuryRealEstate #DreamHome #StudioAI`
    })
    setGeneratingCopy(false)
    showToast('Listing copy generated')
  }

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: chatInput.trim() }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    await new Promise(r => setTimeout(r, 1400 + Math.random() * 600))

    const responses = [
      `For this ${roomLabel.toLowerCase()}, I'd recommend focusing on the staging lighting first. Warm bulbs at 2700K will make the space feel inviting and luxurious in photography.`,
      `Great question! For a vacant space like this, virtual staging typically increases perceived value by 15–20% and reduces days on market significantly.`,
      `The furniture scale is key here. In a room this size, I'd suggest a sectional anchored by a statement rug — something in the 9x12 range to define the seating area.`,
      `For MLS disclosure, any virtually staged images should include the notation "virtually staged" in the photo caption. I can help you format this correctly.`,
      `The natural light coming from that window is your biggest asset. I'd time the physical shoot between 10am–2pm to maximize it.`,
    ]

    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responses[Math.floor(Math.random() * responses.length)]
    }
    setChatMessages(prev => [...prev, aiMsg])
    setChatLoading(false)
  }

  const saveImage = (img: GeneratedImage) => {
    if (savedImages.find(s => s.id === img.id)) { showToast('Already in saved gallery', 'info'); return }
    setSavedImages(prev => [img, ...prev])
    showToast('Saved to gallery')
  }

  const downloadImage = (img: GeneratedImage) => {
    const a = document.createElement('a')
    a.href = img.url
    a.download = `studioai-${img.mode}-${img.id}.jpg`
    a.target = '_blank'
    a.click()
    showToast('Download started')
  }

  const displayImage = activeGenerated?.url || originalImage

  // Nav
  const navItems: Array<{ id: AppView; label: string; icon: keyof typeof Icon; roles?: Role[] }> = [
    { id: 'studio', label: 'Studio', icon: 'Image' },
    { id: 'jobs', label: 'Jobs', icon: 'Jobs', roles: ['brokerage_admin','office_admin','team_lead','reviewer'] },
    { id: 'saved', label: 'Saved Gallery', icon: 'Saved' },
    { id: 'history', label: 'History', icon: 'History' },
    { id: 'reports', label: 'Reports', icon: 'Dashboard', roles: ['brokerage_admin','office_admin','team_lead'] },
    { id: 'settings', label: 'Settings', icon: 'Settings' },
  ]

  const visibleNav = navItems.filter(n => !n.roles || (user && n.roles.includes(user.role)))

  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages, chatLoading])

  const ROOMS = ['Living Room','Bedroom','Kitchen','Dining Room','Home Office','Bathroom','Backyard','Exterior']
  const PACKS = [
    { name: 'Modern Minimal', desc: 'Clean lines, neutral tones' },
    { name: 'Warm Luxury', desc: 'Rich textures, gold accents' },
    { name: 'Coastal Light', desc: 'Natural wood, ocean palette' },
    { name: 'Urban Loft', desc: 'Industrial, dark metals' },
  ]
  const STAGE_CHIPS = ['Scandinavian style','Bold accents','Open concept feel','Family-friendly','Dark moody palette']
  const SKY_OPTIONS = ['Blue Sky','Dramatic Clouds','Sunset Orange','Golden Hour','Twilight Blue','Overcast Soft']

  const userMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-logo">
          <div className="header-logo-mark">S</div>
          <div className="header-logo-text">Studio<span>AI</span></div>
        </div>
        <div className="header-sep" />
        <span style={{fontSize:'0.75rem',color:'var(--text-dim)'}}>
          {view === 'studio' ? 'AI Studio' : view === 'jobs' ? 'Jobs' : view === 'saved' ? 'Gallery' : view === 'history' ? 'History' : view === 'reports' ? 'Reports' : 'Settings'}
        </span>

        <div className="header-actions">
          {view === 'studio' && (
            <>
              <div style={{display:'flex',gap:'0.25rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'0.2rem'}}>
                <button className="header-icon-btn" title="Undo" disabled={!activeGenerated}>
                  <Icon.Undo />
                </button>
                <button className="header-icon-btn" title="Redo" disabled>
                  <Icon.Redo />
                </button>
              </div>
              <button
                className={`header-btn header-btn-ghost${compareMode ? ' active' : ''}`}
                onClick={() => setCompareMode(v => !v)}
                disabled={!activeGenerated}
              >
                <Icon.Compare /> Compare
              </button>
              {activeGenerated && (
                <>
                  <button className="header-btn header-btn-ghost" onClick={() => saveImage(activeGenerated)}>
                    <Icon.Saved /> Save
                  </button>
                  <button className="header-btn header-btn-gold" onClick={() => downloadImage(activeGenerated)}>
                    <Icon.Download /> Export
                  </button>
                </>
              )}
            </>
          )}

          {/* user menu */}
          <div style={{position:'relative'}} ref={userMenuRef}>
            <button className="user-avatar-btn" onClick={() => setUserMenuOpen(v=>!v)}>
              {user?.initials}
            </button>
            {userMenuOpen && (
              <div className="user-menu fade-in">
                <div className="user-menu-header">
                  <div className="user-menu-name">{user?.name}</div>
                  <div className="user-menu-email">{user?.email}</div>
                  <span className={`role-badge ${user ? ROLE_BADGE_CLASS[user.role] : ''}`}>
                    {user ? ROLE_LABELS[user.role] : ''}
                  </span>
                </div>
                <button className="user-menu-item" onClick={() => { setView('settings'); setUserMenuOpen(false) }}>
                  <Icon.Settings /> Account Settings
                </button>
                <button className="user-menu-item danger" onClick={logout}>
                  <Icon.LogOut /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="app-body">
        {/* LEFT NAV */}
        <nav className="left-nav">
          <div className="nav-section-label">Workspace</div>
          {visibleNav.slice(0,2).map(item => {
            const IconComp = Icon[item.icon] as React.FC
            return (
              <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`} onClick={() => setView(item.id)}>
                <span className="nav-item-icon"><IconComp /></span>
                {item.label}
              </button>
            )
          })}
          <div className="nav-section-label">Library</div>
          {visibleNav.slice(2,4).map(item => {
            const IconComp = Icon[item.icon] as React.FC
            return (
              <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`} onClick={() => setView(item.id)}>
                <span className="nav-item-icon"><IconComp /></span>
                {item.label}
              </button>
            )
          })}
          {visibleNav.find(n => n.id === 'reports') && (
            <>
              <div className="nav-section-label">Admin</div>
              {visibleNav.filter(n => ['reports','settings'].includes(n.id)).map(item => {
                const IconComp = Icon[item.icon] as React.FC
                return (
                  <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`} onClick={() => setView(item.id)}>
                    <span className="nav-item-icon"><IconComp /></span>
                    {item.label}
                  </button>
                )
              })}
            </>
          )}
          {!visibleNav.find(n => n.id === 'reports') && (
            <>
              <div className="nav-section-label">Account</div>
              <button className={`nav-item${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>
                <span className="nav-item-icon"><Icon.Settings /></span>Settings
              </button>
            </>
          )}
        </nav>

        {/* MAIN CANVAS */}
        <main className="main-canvas">
          {/* STUDIO VIEW */}
          {view === 'studio' && (
            <div className="canvas-pad">
              {/* Image Stage */}
              <div className="image-stage" style={{aspectRatio: '16/9', minHeight: 260}}>
                {!displayImage ? (
                  <div className="image-stage-empty">
                    <div
                      className="upload-zone"
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={e => e.preventDefault()}
                    >
                      <div className="upload-icon"><Icon.Upload /></div>
                      <div className="upload-title">Drop your listing photo</div>
                      <div className="upload-sub">PNG, JPG or HEIC · Up to 25MB</div>
                    </div>
                    <button className="sample-btn" onClick={loadSample}>
                      <Icon.Image /> Try a sample property
                    </button>
                  </div>
                ) : compareMode && activeGenerated ? (
                  <CompareSlider before={originalImage!} after={activeGenerated.url} />
                ) : (
                  <>
                    <img
                      src={displayImage}
                      alt="Property"
                      style={{width:'100%',height:'100%',objectFit:'cover',display:'block',cursor:'pointer'}}
                      onClick={() => fileInputRef.current?.click()}
                    />
                    <div className="room-chip">
                      <button className="room-chip-btn" onClick={() => setRoomDropOpen(v=>!v)}>
                        <Icon.Home />
                        {roomLabel}
                        <Icon.ChevronDown />
                      </button>
                      {roomDropOpen && (
                        <div className="room-chip-dropdown fade-in">
                          {ROOMS.map(r => (
                            <button key={r} className="room-chip-option" onClick={() => { setRoomLabel(r); setRoomDropOpen(false) }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`stage-badge ${activeGenerated ? 'live' : ''}`}>
                      {activeGenerated ? 'Generated' : 'Original'}
                    </div>
                    {generating && (
                      <div style={{position:'absolute',inset:0,background:'rgba(10,10,15,0.72)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',backdropFilter:'blur(4px)'}}>
                        <div className="stage-badge rendering" style={{position:'static',fontSize:'0.78rem',padding:'0.4rem 1rem'}}>
                          <Icon.Loader /> Rendering…
                        </div>
                        <p style={{color:'var(--text-dim)',fontSize:'0.78rem'}}>AI is transforming your image</p>
                      </div>
                    )}
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => { const f = e.target.files?.[0]; if(f) handleFileUpload(f); e.target.value=''; }} />
              </div>

              {/* Generated Thumbnails Row */}
              {generatedImages.length > 0 && (
                <div style={{display:'flex',gap:'0.5rem',overflowX:'auto',padding:'0.1rem 0'}} className="scrollbar-none">
                  {originalImage && (
                    <button
                      onClick={() => { setActiveGenerated(null); setCompareMode(false) }}
                      style={{
                        flexShrink:0, width:80, height:60, borderRadius:8, overflow:'hidden',
                        border: `2px solid ${!activeGenerated ? 'var(--gold)' : 'var(--border)'}`,
                        background:'none', padding:0, cursor:'pointer'
                      }}
                    >
                      <img src={originalImage} alt="Original" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    </button>
                  )}
                  {generatedImages.map(img => (
                    <button
                      key={img.id}
                      onClick={() => setActiveGenerated(img)}
                      style={{
                        flexShrink:0, width:80, height:60, borderRadius:8, overflow:'hidden',
                        border: `2px solid ${activeGenerated?.id === img.id ? 'var(--gold)' : 'var(--border)'}`,
                        background:'none', padding:0, cursor:'pointer', position:'relative'
                      }}
                    >
                      <img src={img.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SAVED GALLERY */}
          {view === 'saved' && (
            <div className="canvas-pad">
              <h2 className="font-display text-white" style={{fontSize:'1.5rem',fontWeight:600}}>Saved Gallery</h2>
              {savedImages.length === 0 ? (
                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',color:'var(--text-dim)'}}>
                  <Icon.Saved />
                  <p style={{fontSize:'0.85rem'}}>Your saved images will appear here.</p>
                  <button className="cta-ghost" onClick={() => setView('studio')}>Go to Studio</button>
                </div>
              ) : (
                <div className="thumbnail-grid">
                  {savedImages.map(img => (
                    <div key={img.id} className="thumbnail-item">
                      <img src={img.url} alt={img.prompt} />
                      <div className="thumbnail-overlay">
                        <button className="thumbnail-action" onClick={() => downloadImage(img)}>Export</button>
                        <button className="thumbnail-action danger" onClick={() => setSavedImages(p=>p.filter(s=>s.id!==img.id))}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY */}
          {view === 'history' && (
            <div className="canvas-pad">
              <h2 className="font-display text-white" style={{fontSize:'1.5rem',fontWeight:600}}>Generation History</h2>
              {generatedImages.length === 0 ? (
                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',color:'var(--text-dim)'}}>
                  <Icon.History />
                  <p style={{fontSize:'0.85rem'}}>Your generation history will appear here.</p>
                </div>
              ) : (
                <div className="thumbnail-grid">
                  {generatedImages.map(img => (
                    <div key={img.id} className="thumbnail-item">
                      <img src={img.url} alt="" />
                      <div className="thumbnail-overlay">
                        <button className="thumbnail-action" onClick={() => { setActiveGenerated(img); setView('studio') }}>Open</button>
                        <button className="thumbnail-action" onClick={() => saveImage(img)}>Save</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* JOBS */}
          {view === 'jobs' && (
            <div className="canvas-pad">
              <h2 className="font-display text-white" style={{fontSize:'1.5rem',fontWeight:600}}>Jobs</h2>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'2rem',textAlign:'center',color:'var(--text-dim)'}}>
                <Icon.Jobs />
                <p style={{marginTop:'0.75rem',fontSize:'0.85rem'}}>The Jobs queue for the brokerage ops workflow is coming soon.</p>
                <p style={{fontSize:'0.78rem',marginTop:'0.35rem',color:'var(--text-faint)'}}>Agents will submit jobs here, reviewers will approve, and admins will track progress across all offices.</p>
              </div>
            </div>
          )}

          {/* REPORTS */}
          {view === 'reports' && (
            <div className="canvas-pad">
              <h2 className="font-display text-white" style={{fontSize:'1.5rem',fontWeight:600}}>Reports</h2>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'0.75rem'}}>
                {[{label:'Jobs Submitted',val:'—'},{label:'Jobs Completed',val:'—'},{label:'Avg Turnaround',val:'—'},{label:'Revision Rate',val:'—'}].map(s => (
                  <div key={s.label} className="stat-pill">
                    <div className="stat-pill-num">{s.val}</div>
                    <div className="stat-pill-label">{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'2rem',textAlign:'center',color:'var(--text-dim)'}}>
                <p style={{fontSize:'0.85rem'}}>Admin reporting dashboard launching with the full Brokerage Ops release.</p>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {view === 'settings' && (
            <div className="canvas-pad">
              <h2 className="font-display text-white" style={{fontSize:'1.5rem',fontWeight:600}}>Account Settings</h2>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'1.5rem',maxWidth:480}}>
                <p style={{fontSize:'0.78rem',color:'var(--text-faint)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'0.35rem'}}>Signed in as</p>
                <p style={{fontWeight:600,color:'var(--white)'}}>{user?.name}</p>
                <p style={{color:'var(--text-dim)',fontSize:'0.82rem'}}>{user?.email}</p>
                <span className={`role-badge ${user ? ROLE_BADGE_CLASS[user.role] : ''}`} style={{marginTop:'0.5rem'}}>
                  {user ? ROLE_LABELS[user.role] : ''}
                </span>
                <div style={{marginTop:'1.5rem',paddingTop:'1.25rem',borderTop:'1px solid var(--border)'}}>
                  <p style={{fontSize:'0.82rem',color:'var(--text-dim)',marginBottom:'1rem'}}>Brokerage: <strong style={{color:'var(--text)'}}>{user?.brokerage}</strong></p>
                  <button className="action-btn" style={{maxWidth:200}} onClick={logout}>
                    <Icon.LogOut /> Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL — only in studio view */}
        {view === 'studio' && (
          <aside className={`right-panel${sheetOpen ? ' sheet-open' : ''}`}>
            <div className="sheet-handle-wrap" onClick={() => setSheetOpen(v=>!v)}>
              <div className="sheet-handle" />
              <span className="sheet-handle-label">{sheetOpen ? 'Close' : 'Open Controls'}</span>
            </div>

            {/* Mode Tabs */}
            <div className="panel-section" style={{paddingBottom:'0.5rem'}}>
              <div className="mode-tabs">
                <button className={`mode-tab${mode==='stage'?' active':''}`} onClick={()=>{setMode('stage');setAccordionOpen(null)}}>Stage</button>
                <button className={`mode-tab${mode==='copy'?' active':''}`} onClick={()=>{setMode('copy');setAccordionOpen(null)}}>Copy</button>
                <button className={`mode-tab${mode==='chat'?' active':''}`} onClick={()=>{setMode('chat');setAccordionOpen(null)}}>Chat</button>
              </div>
            </div>

            {/* STAGE MODE */}
            {mode === 'stage' && (
              <>
                <div className="panel-section">
                  <div className="panel-section-label">Staging Pack</div>
                  <div className="pack-grid">
                    {PACKS.map(p => (
                      <button key={p.name} className={`pack-btn${selectedPack===p.name?' selected':''}`} onClick={() => setSelectedPack(s => s===p.name ? null : p.name)}>
                        <div className="pack-btn-name">{p.name}</div>
                        <div className="pack-btn-desc">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel-section">
                  <div className="panel-section-label">Describe your vision</div>
                  <textarea
                    className="prompt-textarea"
                    rows={3}
                    placeholder="E.g. warm lighting, velvet sofa, art deco accents..."
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                  />
                  <div className="suggestion-chips">
                    {STAGE_CHIPS.map(c => (
                      <button key={c} className="chip" onClick={() => setPrompt(p => p ? `${p}, ${c}` : c)}>{c}</button>
                    ))}
                  </div>
                </div>

                {/* Special Modes */}
                <div className="panel-section" style={{display:'flex',flexDirection:'column',gap:'0.45rem'}}>
                  <div className="panel-section-label">Visual Effects</div>

                  {/* Twilight */}
                  <div className="accordion">
                    <button className="accordion-header" onClick={() => setAccordionOpen(a => a==='twilight' ? null : 'twilight')}>
                      <div className="accordion-icon-wrap"><Icon.Moon /></div>
                      <span className="accordion-title">Twilight Conversion</span>
                      <Icon.ChevronDown />
                    </button>
                    {accordionOpen==='twilight' && (
                      <div className="accordion-body fade-in">
                        <p style={{fontSize:'0.75rem',color:'var(--text-dim)',lineHeight:1.6}}>Convert exteriors to a dramatic twilight scene with glowing warm windows and deep blue skies.</p>
                        <button className="action-btn gold-btn" onClick={() => { setMode('twilight'); generateImage() }} disabled={!originalImage || generating}>
                          {generating ? <><Icon.Loader /> Rendering…</> : <><Icon.Moon /> Generate Twilight</>}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sky */}
                  <div className="accordion">
                    <button className="accordion-header" onClick={() => setAccordionOpen(a => a==='sky' ? null : 'sky')}>
                      <div className="accordion-icon-wrap"><Icon.Sky /></div>
                      <span className="accordion-title">Sky Replacement</span>
                      <Icon.ChevronDown />
                    </button>
                    {accordionOpen==='sky' && (
                      <div className="accordion-body fade-in">
                        <div className="sky-grid">
                          {SKY_OPTIONS.map(s => (
                            <button key={s} className={`sky-option${skyStyle===s?' selected':''}`} onClick={() => setSkyStyle(v => v===s ? null : s)}>{s}</button>
                          ))}
                        </div>
                        <button className="action-btn gold-btn" onClick={() => { setMode('sky'); generateImage() }} disabled={!originalImage || generating || !skyStyle}>
                          {generating ? <><Icon.Loader /> Rendering…</> : <><Icon.Sky /> Replace Sky</>}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Declutter */}
                  <div className="accordion">
                    <button className="accordion-header" onClick={() => setAccordionOpen(a => a==='declutter' ? null : 'declutter')}>
                      <div className="accordion-icon-wrap"><Icon.Broom /></div>
                      <span className="accordion-title">Declutter Room</span>
                      <Icon.ChevronDown />
                    </button>
                    {accordionOpen==='declutter' && (
                      <div className="accordion-body fade-in">
                        <p style={{fontSize:'0.75rem',color:'var(--text-dim)',lineHeight:1.6}}>Remove personal items, furniture and clutter. Great for vacant showings or before virtual staging.</p>
                        <button className="action-btn gold-btn" onClick={() => { setMode('declutter'); generateImage() }} disabled={!originalImage || generating}>
                          {generating ? <><Icon.Loader /> Rendering…</> : <><Icon.Broom /> Declutter</>}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Reno */}
                  <div className="accordion">
                    <button className="accordion-header" onClick={() => setAccordionOpen(a => a==='reno' ? null : 'reno')}>
                      <div className="accordion-icon-wrap"><Icon.Home /></div>
                      <span className="accordion-title">Renovation Preview</span>
                      <Icon.ChevronDown />
                    </button>
                    {accordionOpen==='reno' && (
                      <div className="accordion-body fade-in">
                        <div className="reno-label">Describe the renovation</div>
                        <input className="reno-input" placeholder="E.g. modern kitchen with white quartz..." value={renoDetails} onChange={e=>setRenoDetails(e.target.value)} />
                        <button className="action-btn gold-btn" onClick={() => { setMode('reno'); generateImage() }} disabled={!originalImage || generating}>
                          {generating ? <><Icon.Loader /> Rendering…</> : <><Icon.Home /> Preview Reno</>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Multi-gen */}
                <div className="panel-section">
                  <label className="toggle-row" onClick={() => setMultiGen(v=>!v)}>
                    <div className={`toggle-track ${multiGen ? 'on' : 'off'}`}>
                      <div className="toggle-thumb" />
                    </div>
                    <span className="toggle-label"><strong>Generate 3 Variations</strong></span>
                  </label>
                </div>
              </>
            )}

            {/* COPY MODE */}
            {mode === 'copy' && (
              <div className="panel-section" style={{flex:1}}>
                <div className="panel-section-label">AI Listing Copy</div>
                <p style={{fontSize:'0.75rem',color:'var(--text-dim)',lineHeight:1.6,marginBottom:'0.75rem'}}>Generate professional listing copy from your property photo. Upload an image first for best results.</p>
                <textarea
                  className="prompt-textarea"
                  rows={3}
                  placeholder="Additional details: sqft, beds/baths, neighborhood highlights..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />
                <button className="action-btn gold-btn mt-3" onClick={generateCopy} disabled={generatingCopy || !originalImage} style={{width:'100%'}}>
                  {generatingCopy ? <><Icon.Loader /> Generating…</> : <><Icon.Text /> Generate Listing Copy</>}
                </button>
                {copyResult && (
                  <div style={{display:'flex',flexDirection:'column',gap:'0.65rem',marginTop:'1rem'}} className="fade-in">
                    {[
                      { label: 'Headline', text: copyResult.headline },
                      { label: 'Description', text: copyResult.description },
                      { label: 'Social Caption', text: copyResult.socialCaption },
                    ].map(b => (
                      <div key={b.label} className="copy-block">
                        <div className="copy-block-header">
                          <span className="copy-block-label">{b.label}</span>
                          <button className="copy-block-copy-btn" onClick={() => { navigator.clipboard.writeText(b.text); showToast(`${b.label} copied`) }}>
                            <Icon.Copy />
                          </button>
                        </div>
                        <div className="copy-block-text">{b.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CHAT MODE */}
            {mode === 'chat' && (
              <div className="chat-wrap" style={{flex:1,minHeight:0}}>
                <div className="chat-messages scrollbar-none">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`chat-msg ${msg.role === 'user' ? 'user' : ''}`}>
                      <div className={`chat-avatar ${msg.role === 'assistant' ? 'ai' : 'user-av'}`}>
                        {msg.role === 'assistant' ? 'S' : user?.initials}
                      </div>
                      <div className={`chat-bubble ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-msg">
                      <div className="chat-avatar ai">S</div>
                      <div className="chat-bubble ai">
                        <div className="chat-typing">
                          <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>
                <div className="chat-input-row">
                  <input
                    className="chat-input"
                    placeholder="Ask about staging, disclosure, strategy…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                  />
                  <button className="chat-send-btn" onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>
                    <Icon.Send />
                  </button>
                </div>
              </div>
            )}

            {/* Generate CTA — only in stage mode */}
            {mode === 'stage' && (
              <div className="generate-cta">
                <button className="generate-btn" onClick={generateImage} disabled={generating || !originalImage || (!selectedPack && !prompt)}>
                  {generating
                    ? <><Icon.Loader /> Rendering…</>
                    : <><Icon.Sparkle /> Generate{multiGen ? ' × 3' : ''}</>
                  }
                </button>
                <p className="generate-hint">
                  {!originalImage ? 'Upload a photo to begin' : (!selectedPack && !prompt) ? 'Choose a pack or describe your vision' : 'Ready to transform'}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* TOAST */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

// ─── AUTH PROVIDER ────────────────────────────────────────────────────────────
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = sessionStorage.getItem('studioai_user')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const makeInitials = (name: string) => name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)

  const login = async (email: string, password: string, role: Role) => {
    if (password.length < 6) throw new Error('Invalid')
    await new Promise(r => setTimeout(r, 800))
    const name = email.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
    const u: User = { id: `u_${Date.now()}`, name, email, role, brokerage: 'Avery & Bryant Realty', office: 'Pacific Northwest', initials: makeInitials(name) }
    setUser(u)
    sessionStorage.setItem('studioai_user', JSON.stringify(u))
  }

  const signup = async (name: string, email: string, password: string, role: Role) => {
    if (password.length < 6) throw new Error('Too short')
    await new Promise(r => setTimeout(r, 1000))
    const u: User = { id: `u_${Date.now()}`, name, email, role, brokerage: 'Avery & Bryant Realty', initials: makeInitials(name) }
    setUser(u)
    sessionStorage.setItem('studioai_user', JSON.stringify(u))
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem('studioai_user')
  }

  return <AuthContext.Provider value={{ user, login, signup, logout }}>{children}</AuthContext.Provider>
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
function Inner() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  if (!user) return showSignup
    ? <SignupScreen onSwitch={() => setShowSignup(false)} />
    : <LoginScreen onSwitch={() => setShowSignup(true)} />
  return <MainApp />
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  )
}
