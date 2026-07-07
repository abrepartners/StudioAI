import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './vellum.css';
import PricingPage from '../../components/PricingPage';
import { useSubscription } from '../../hooks/useSubscription';
import { readGoogleUser, type GoogleUser } from '../routes/authStorage';
import { trackEvent } from '../lib/analytics';

const GOOGLE_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.GOOGLE_CLIENT_ID) ||
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '114715484927-pbu0mro7f5imhbo5q77k1imqi5etc2a3.apps.googleusercontent.com';

const AUTH_STORAGE_KEY = 'studioai_google_user';

function decodeJwtPayload(token: string): GoogleUser | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (payload.email && payload.sub) {
      return { name: payload.name || '', email: payload.email, picture: payload.picture || '', sub: payload.sub };
    }
    return null;
  } catch { return null; }
}

const FEATURES = [
  { icon: 'armchair', title: 'Virtual Staging', desc: 'AI-furnished rooms that match the architecture. 9 curated style packs from coastal to mid-century.' },
  { icon: 'sparkles', title: 'Smart Cleanup', desc: 'Remove clutter, personal items, and eyesores. AI detects what to remove so you don\'t have to mask.' },
  { icon: 'moon', title: 'Day-to-Dusk', desc: 'Transform daytime exteriors into golden-hour twilight shots. Warm interior glow, purple skies, landscape lighting.' },
  { icon: 'sun', title: 'Sky Replace', desc: 'Swap grey overcast for dramatic blue skies. Consistent lighting that matches the scene naturally.' },
  { icon: 'image', title: 'Lawn Enhancement', desc: 'Turn brown, patchy yards into lush green landscapes. Curb appeal in one click.' },
  { icon: 'download', title: 'MLS Export', desc: 'Resize, strip EXIF, watermark, and zip. One-click delivery for Zillow, Realtor.com, and ARMLS.' },
];

const SHOWCASE_PAIRS = [
  { before: '/showcase-staging-before.jpg', after: '/showcase-staging-after.jpg', label: 'Virtual Staging' },
  { before: '/showcase-reno-before.jpg', after: '/showcase-reno-after.jpg', label: 'Renovation' },
  { before: '/showcase-cleanup-before.jpg', after: '/showcase-cleanup-after.jpg', label: 'Smart Cleanup' },
  { before: '/showcase-dusk-before.jpg', after: '/showcase-dusk-after.png', label: 'Day-to-Dusk' },
  { before: '/showcase-sky-before.jpg', after: '/showcase-sky-after.jpg', label: 'Sky Replace' },
];

const IconSVG: React.FC<{ name: string }> = ({ name }) => {
  const d: Record<string, React.ReactNode> = {
    armchair: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 11h18v6a2 2 0 0 1-2 2h-2v2H7v-2H5a2 2 0 0 1-2-2v-6z"/></>,
    sparkles: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/></>,
    moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    arrow_right: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    check: <><path d="M5 12l5 5L20 7"/></>,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {d[name] || null}
    </svg>
  );
};

const BeforeAfterSlider: React.FC<{ before: string; after: string; label: string; onInteract?: () => void }> = ({ before, after, label, onInteract }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    setPos((x / rect.width) * 100);
  }, []);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    onInteract?.();
  }, [onInteract]);

  useEffect(() => {
    const onUp = () => { dragging.current = false; };
    const onMove = (e: MouseEvent) => { if (dragging.current) handleMove(e.clientX); };
    const onTouch = (e: TouchEvent) => { if (dragging.current) handleMove(e.touches[0].clientX); };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchmove', onTouch);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchmove', onTouch);
    };
  }, [handleMove]);

  return (
    <div className="vl-ba" ref={containerRef}>
      <img src={after} alt={`${label} — after`} className="vl-ba-img" draggable={false} />
      <div className="vl-ba-clip" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={`${label} — before`} className="vl-ba-img" draggable={false} />
      </div>
      <div
        className="vl-ba-handle"
        style={{ left: `${pos}%` }}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
      >
        <div className="vl-ba-knob">&#x2B9C; &#x2B9E;</div>
      </div>
      <span className="vl-ba-tag before">Before</span>
      <span className="vl-ba-tag after">After</span>
    </div>
  );
};

const VellumLanding: React.FC = () => {
  const heroGoogleRef = useRef<HTMLDivElement>(null);
  const ctaGoogleRef = useRef<HTMLDivElement>(null);
  const [activeShowcase, setActiveShowcase] = useState(0);
  const showcasePaused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseShowcase = useCallback(() => {
    showcasePaused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { showcasePaused.current = false; }, 8000);
  }, []);

  const handleGoogleCredential = useCallback((response: any) => {
    const user = decodeJwtPayload(response.credential);
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      trackEvent('signup_completed', { source: 'landing' });
      fetch('/api/track-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleId: user.sub, email: user.email, name: user.name, picture: user.picture }),
      }).catch(() => {});
      window.location.assign('/vellum');
    }
  }, []);

  useEffect(() => {
    const init = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      if (heroGoogleRef.current) {
        heroGoogleRef.current.innerHTML = '';
        google.accounts.id.renderButton(heroGoogleRef.current, {
          type: 'standard', theme: 'filled_black', size: 'large',
          text: 'continue_with', shape: 'pill', width: 280,
        });
      }
      if (ctaGoogleRef.current) {
        ctaGoogleRef.current.innerHTML = '';
        google.accounts.id.renderButton(ctaGoogleRef.current, {
          type: 'standard', theme: 'outline', size: 'large',
          text: 'continue_with', shape: 'pill', width: 280,
        });
      }
    };
    if ((window as any).google?.accounts?.id) { init(); }
    else {
      const interval = setInterval(() => {
        if ((window as any).google?.accounts?.id) { clearInterval(interval); init(); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [handleGoogleCredential]);

  useEffect(() => {
    trackEvent('landing_viewed', { source: 'organic' });
    document.title = 'Vellum — AI-Powered Listing Media';
    return () => { document.title = 'Vellum'; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!showcasePaused.current) {
        setActiveShowcase(prev => (prev + 1) % SHOWCASE_PAIRS.length);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const user = useMemo(() => readGoogleUser(), []);
  const subscription = useSubscription(user?.email || null);

  const onRequireSignIn = () => {
    document.getElementById('vl-hero')?.scrollIntoView({ behavior: 'smooth' });
  };

  const onStartCheckout = (plan: 'starter' | 'pro' | 'team', interval: 'month' | 'year') => {
    if (!user?.sub) { onRequireSignIn(); return; }
    trackEvent('checkout_started', { plan, interval, source: 'landing' });
    subscription.startCheckout(user.sub, { plan, interval });
  };

  return (
    <div className="vl-root">
      {/* ── NAV ─────────────────────────────────────────────────── */}
      <header className="vl-nav">
        <div className="vl-nav-inner">
          <span className="vl-wordmark">Vellum</span>
          <nav className="vl-nav-links">
            <a href="#features" onClick={e => { e.preventDefault(); document.getElementById('vl-features')?.scrollIntoView({ behavior: 'smooth' }); }}>Features</a>
            <a href="#showcase" onClick={e => { e.preventDefault(); document.getElementById('vl-showcase')?.scrollIntoView({ behavior: 'smooth' }); }}>Showcase</a>
            <a href="#pricing" onClick={e => { e.preventDefault(); document.getElementById('vl-pricing')?.scrollIntoView({ behavior: 'smooth' }); }}>Pricing</a>
            <Link to="/faq">FAQ</Link>
          </nav>
          <div className="vl-nav-cta">
            <a
              href="#"
              onClick={e => { e.preventDefault(); document.getElementById('vl-hero')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="vl-btn vl-btn--gold"
            >
              Get started free
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section id="vl-hero" className="vl-hero">
        <div className="vl-hero-inner">
          <div className="vl-hero-eyebrow">AI-powered listing media</div>
          <h1 className="vl-hero-title">
            Stage, clean, relight.<br />
            <em>Deliver in minutes.</em>
          </h1>
          <p className="vl-hero-sub">
            Upload raw listing photos. Get back staged rooms, twilight exteriors,
            clean shots, and MLS-ready exports — all from one platform built for
            real estate.
          </p>
          <div className="vl-hero-cta">
            <div ref={heroGoogleRef} style={{ minHeight: 44 }} />
            <span className="vl-hero-note">5 free edits. No credit card required.</span>
          </div>
          <div className="vl-hero-metrics">
            <div className="vl-metric">
              <span className="vl-metric-val">9</span>
              <span className="vl-metric-lbl">Style packs</span>
            </div>
            <div className="vl-metric-divider" />
            <div className="vl-metric">
              <span className="vl-metric-val">&lt;60s</span>
              <span className="vl-metric-lbl">Per photo</span>
            </div>
            <div className="vl-metric-divider" />
            <div className="vl-metric">
              <span className="vl-metric-val">6</span>
              <span className="vl-metric-lbl">AI tools</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SHOWCASE (Before/After) ─────────────────────────────── */}
      <section id="vl-showcase" className="vl-showcase">
        <div className="vl-section-inner">
          <div className="vl-eyebrow">See the difference</div>
          <h2 className="vl-section-title">Before and <em>after.</em></h2>
          <p className="vl-section-sub">
            Drag the slider to compare. Real uploads, real AI output — no retouching, no Photoshop.
          </p>
          <div className="vl-showcase-tabs">
            {SHOWCASE_PAIRS.map((pair, i) => (
              <button
                key={pair.label}
                className={'vl-showcase-tab' + (activeShowcase === i ? ' active' : '')}
                onClick={() => { setActiveShowcase(i); pauseShowcase(); }}
              >
                {pair.label}
              </button>
            ))}
          </div>
          <BeforeAfterSlider
            key={activeShowcase}
            before={SHOWCASE_PAIRS[activeShowcase].before}
            after={SHOWCASE_PAIRS[activeShowcase].after}
            label={SHOWCASE_PAIRS[activeShowcase].label}
            onInteract={pauseShowcase}
          />
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────── */}
      <section id="vl-features" className="vl-features">
        <div className="vl-section-inner">
          <div className="vl-eyebrow">Everything you need</div>
          <h2 className="vl-section-title">Six tools. <em>One platform.</em></h2>
          <p className="vl-section-sub">
            Each tool is purpose-built for listing media. No generic AI filters —
            every output is designed for MLS, social, and print.
          </p>
          <div className="vl-feature-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="vl-feature-card">
                <div className="vl-feature-icon">
                  <IconSVG name={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="vl-how">
        <div className="vl-section-inner">
          <div className="vl-eyebrow">How it works</div>
          <h2 className="vl-section-title">Three steps to <em>market-ready.</em></h2>
          <div className="vl-steps">
            <div className="vl-step">
              <div className="vl-step-num">01</div>
              <h3>Upload</h3>
              <p>Drag in your raw listing photos. Batch upload supported — do the whole property at once.</p>
            </div>
            <div className="vl-step-arrow"><IconSVG name="arrow_right" /></div>
            <div className="vl-step">
              <div className="vl-step-num">02</div>
              <h3>Choose a tool</h3>
              <p>Stage a room, clean up clutter, swap the sky, or convert to twilight. Pick a style pack or let Auto-Pilot decide.</p>
            </div>
            <div className="vl-step-arrow"><IconSVG name="arrow_right" /></div>
            <div className="vl-step">
              <div className="vl-step-num">03</div>
              <h3>Export</h3>
              <p>Download MLS-ready files, social crops, or a full marketing kit — watermarked, sized, and zipped.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────── */}
      <section id="vl-pricing" className="vl-pricing">
        <PricingPage
          email={user?.email ?? null}
          onRequireSignIn={onRequireSignIn}
          onStartCheckout={onStartCheckout}
          id="pricing"
        />
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────── */}
      <section className="vl-final-cta">
        <div className="vl-section-inner" style={{ textAlign: 'center' }}>
          <h2 className="vl-section-title" style={{ marginBottom: 12 }}>
            Ready to elevate your <em>listings?</em>
          </h2>
          <p className="vl-section-sub" style={{ marginBottom: 32 }}>
            Start with 5 free edits. Upgrade when you're ready.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div ref={ctaGoogleRef} style={{ minHeight: 44 }} />
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="vl-footer">
        <div className="vl-footer-inner">
          <span className="vl-wordmark" style={{ fontSize: 20 }}>Vellum</span>
          <nav className="vl-footer-links">
            <Link to="/pricing">Pricing</Link>
            <Link to="/features">Features</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/gallery">Gallery</Link>
          </nav>
          <span className="vl-footer-copy">&copy; {new Date().getFullYear()} Vellum</span>
        </div>
      </footer>
    </div>
  );
};

export default VellumLanding;
