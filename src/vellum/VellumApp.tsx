import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import './vellum.css';
import { VellumTopbar } from './VellumTopbar';
import { VellumSidebar } from './VellumSidebar';
import { useVellumStore } from './useVellumStore';
import { readGoogleUser, type GoogleUser } from '../routes/authStorage';
import { useSubscription } from '../../hooks/useSubscription';

const VellumDashboard = React.lazy(() => import('./VellumDashboard'));
const VellumProjects = React.lazy(() => import('./VellumProjects'));
const VellumPhotoEditor = React.lazy(() => import('./VellumPhotoEditor'));
const VellumVideoEditor = React.lazy(() => import('./VellumVideoEditor'));
const VellumBilling = React.lazy(() => import('./VellumBilling'));
const VellumSettings = React.lazy(() => import('./VellumSettings'));
const VellumHelp = React.lazy(() => import('./VellumHelp'));
const VellumRefillModal = React.lazy(() => import('./VellumRefillModal'));
const VellumNewListingModal = React.lazy(() => import('./VellumNewListingModal'));

const VALID_PAGES = ['dashboard', 'projects', 'photo', 'video', 'billing', 'settings', 'help'];

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

interface RefillState {
  open: boolean;
  needed: number;
  onAfter: ((res: { ok: boolean; charged: number; refilled?: number }) => void) | null;
}

const VellumApp: React.FC = () => {
  const [page, setPage] = useState(() => {
    const h = window.location.hash.replace('#', '');
    return VALID_PAGES.includes(h) ? h : 'dashboard';
  });

  // ─── Auth ───────────────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(() => readGoogleUser());
  const [authLoading, setAuthLoading] = useState(true);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredential = useCallback((response: any) => {
    const user = decodeJwtPayload(response.credential);
    if (user) {
      setGoogleUser(user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      fetch('/api/track-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleId: user.sub, email: user.email, name: user.name, picture: user.picture }),
      }).catch(() => {});
    }
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    const saved = readGoogleUser();
    if (saved) setGoogleUser(saved);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    if (googleUser || !GOOGLE_CLIENT_ID) return;
    const init = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = '';
        google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard', theme: 'outline', size: 'large',
          text: 'signin_with', shape: 'pill', width: 300,
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
  }, [googleUser, handleGoogleCredential]);

  const handleSignOut = useCallback(() => {
    setGoogleUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    const google = (window as any).google;
    if (google?.accounts?.id) google.accounts.id.disableAutoSelect();
  }, []);

  // ─── Subscription (real Stripe billing) ─────────────────────────────
  const subscription = useSubscription(googleUser?.email || null);

  const canGenerate = subscription.canGenerate;
  const isUnlimited = subscription.generationsLimit === -1;

  // Bridge: map Vellum's credit model to real subscription
  // Each tool use = 1 generation. Pro/Team = unlimited.
  const effectiveCredits = isUnlimited
    ? 999
    : subscription.plan === 'credits'
    ? subscription.credits
    : Math.max(0, subscription.generationsLimit - subscription.generationsUsed);

  // ─── Store + state ──────────────────────────────────────────────────
  const store = useVellumStore();

  useEffect(() => {
    if (!googleUser) return;
    const p = store.profile;
    const updates: Partial<typeof p> = {};
    if (!p.name && googleUser.name) updates.name = googleUser.name;
    if (!p.email && googleUser.email) updates.email = googleUser.email;
    if (Object.keys(updates).length) store.updateProfile(updates);
  }, [googleUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const [refill, setRefill] = useState<RefillState>({ open: false, needed: 0, onAfter: null });
  const [newListingOpen, setNewListingOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const activeProject = store.projects.find(p => p.id === activeProjectId) || null;

  const requestSpend = useCallback((amount: number, after?: (res: any) => void) => {
    if (isUnlimited || canGenerate) {
      // Record generation server-side (fire and forget per generation)
      if (!isUnlimited) {
        for (let i = 0; i < amount; i++) subscription.recordGeneration();
      }
      after?.({ ok: true, charged: amount });
      return true;
    }
    // Out of generations — open refill/upgrade modal
    setRefill({ open: true, needed: amount, onAfter: after || null });
    return false;
  }, [canGenerate, isUnlimited, subscription]);

  const refundCredits = useCallback((_amount: number) => {
    // Server-side generation count can't be decremented.
    // For failed/cancelled jobs this is a no-op — the generation was never
    // successfully completed so recordGeneration wasn't called yet in the
    // success path. The old requestSpend pre-deducted, but we now only
    // record on success.
  }, []);

  const onRefillConfirm = useCallback((added: number) => {
    // Credit pack purchase succeeded — refresh subscription state
    subscription.refresh();
    if (refill.onAfter) {
      const cb = refill.onAfter;
      setTimeout(() => cb({ ok: true, charged: refill.needed, refilled: added }), 50);
    }
  }, [refill, subscription]);

  const handleNewListing = useCallback(() => { setNewListingOpen(true); }, []);

  const handleUploadFiles = useCallback(() => {
    setPage('photo');
    setTimeout(() => window.dispatchEvent(new CustomEvent('vellum:upload-files')), 50);
  }, []);

  const handleCreateListing = useCallback((data: { address: string; city: string; propertyType: string; beds: number | null; baths: number | null }) => {
    const id = store.addProject(data);
    setActiveProjectId(id);
    setNewListingOpen(false);
    setPage('photo');
  }, [store]);

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setPage('photo');
  }, []);

  useEffect(() => { window.location.hash = page; }, [page]);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '');
      if (VALID_PAGES.includes(h)) setPage(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ─── Auth wall ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="vellum">
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'var(--background-primary, #0a0a0a)' }}>
          <div style={{ color: 'var(--graphite, #888)', fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!googleUser) {
    return (
      <div className="vellum">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: 'var(--background-primary, #0a0a0a)',
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ marginBottom: 12, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--warm-ivory, #f5f0e8)' }}>
            StudioAI
          </div>
          <p style={{ fontSize: 15, color: 'var(--graphite, #888)', maxWidth: 380, lineHeight: 1.6, marginBottom: 32 }}>
            AI-powered listing media for real estate agents. Stage, clean up, relight, and export — all from one place.
          </p>
          <div ref={googleButtonRef} style={{ minHeight: 44, marginBottom: 24 }} />
          <p style={{ fontSize: 12, color: 'var(--graphite, #888)', maxWidth: 320, lineHeight: 1.5 }}>
            5 free edits to start. No credit card required.
          </p>
        </div>
      </div>
    );
  }

  // ─── Authed app ─────────────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <VellumDashboard setPage={setPage} credits={effectiveCredits} projects={store.projects} profile={store.profile} onNewListing={handleNewListing} onSelectProject={handleSelectProject} subscription={subscription} />;
      case 'projects':
        return <VellumProjects setPage={setPage} projects={store.projects} onNewListing={handleNewListing} onSelectProject={handleSelectProject} onDeleteProject={store.deleteProject} />;
      case 'photo':
        return <VellumPhotoEditor setPage={setPage} credits={effectiveCredits} requestSpend={requestSpend} refundCredits={refundCredits} activeProject={activeProject} updateProject={store.updateProject} />;
      case 'video':
        return <VellumVideoEditor setPage={setPage} credits={effectiveCredits} requestSpend={requestSpend} activeProject={activeProject} />;
      case 'billing':
        return <VellumBilling setPage={setPage} credits={effectiveCredits} subscription={subscription} userEmail={googleUser.email} userId={googleUser.sub} />;
      case 'settings':
        return <VellumSettings setPage={setPage} profile={store.profile} updateProfile={store.updateProfile} googleUser={googleUser} onSignOut={handleSignOut} />;
      case 'help':
        return <VellumHelp setPage={setPage} />;
      default:
        return null;
    }
  };

  return (
    <div className="vellum">
      <div className="v-app">
        <VellumTopbar
          page={page}
          setPage={setPage}
          credits={effectiveCredits}
          profile={store.profile}
          onRefill={() => setRefill({ open: true, needed: 0, onAfter: null })}
          onUploadFiles={handleUploadFiles}
          googleUser={googleUser}
          subscription={subscription}
        />
        <div className="v-app-body">
          <VellumSidebar page={page} setPage={setPage} onNewListing={handleNewListing} onUploadFiles={handleUploadFiles} />
          <main className="v-app-main">
            <Suspense
              fallback={
                <div style={{
                  display: 'grid', placeItems: 'center',
                  minHeight: '50vh', color: 'var(--graphite)', fontSize: 13
                }}>
                  Loading…
                </div>
              }
            >
              {renderPage()}
            </Suspense>
          </main>
        </div>

        <Suspense fallback={null}>
          <VellumRefillModal
            open={refill.open}
            needed={refill.needed}
            balance={effectiveCredits}
            onClose={() => setRefill({ open: false, needed: 0, onAfter: null })}
            onConfirm={onRefillConfirm}
            subscription={subscription}
            userEmail={googleUser.email}
            userId={googleUser.sub}
          />
          <VellumNewListingModal
            open={newListingOpen}
            onClose={() => setNewListingOpen(false)}
            onCreate={handleCreateListing}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default VellumApp;
