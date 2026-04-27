import React, { useState, useCallback, useEffect, Suspense } from 'react';
import './vellum.css';
import { VellumTopbar } from './VellumTopbar';
import { VellumSidebar } from './VellumSidebar';
import { useVellumStore } from './useVellumStore';

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

  const store = useVellumStore();
  const [credits, setCredits] = useState(200);
  const [refill, setRefill] = useState<RefillState>({ open: false, needed: 0, onAfter: null });
  const [newListingOpen, setNewListingOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const activeProject = store.projects.find(p => p.id === activeProjectId) || null;

  const requestSpend = useCallback((amount: number, after?: (res: any) => void) => {
    if (credits >= amount) {
      setCredits(c => c - amount);
      after?.({ ok: true, charged: amount });
      return true;
    }
    setRefill({ open: true, needed: amount, onAfter: after || null });
    return false;
  }, [credits]);

  const onRefillConfirm = useCallback((added: number) => {
    setCredits(c => c + added);
    if (refill.onAfter) {
      const need = refill.needed;
      const cb = refill.onAfter;
      setTimeout(() => {
        setCredits(c => c - need);
        cb({ ok: true, charged: need, refilled: added });
      }, 50);
    }
  }, [refill]);

  const handleNewListing = useCallback(() => {
    setNewListingOpen(true);
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

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <VellumDashboard setPage={setPage} credits={credits} projects={store.projects} profile={store.profile} onNewListing={handleNewListing} onSelectProject={handleSelectProject} />;
      case 'projects':
        return <VellumProjects setPage={setPage} projects={store.projects} onNewListing={handleNewListing} onSelectProject={handleSelectProject} onDeleteProject={store.deleteProject} />;
      case 'photo':
        return <VellumPhotoEditor setPage={setPage} credits={credits} requestSpend={requestSpend} activeProject={activeProject} updateProject={store.updateProject} />;
      case 'video':
        return <VellumVideoEditor setPage={setPage} credits={credits} requestSpend={requestSpend} activeProject={activeProject} />;
      case 'billing':
        return <VellumBilling setPage={setPage} credits={credits} />;
      case 'settings':
        return <VellumSettings setPage={setPage} profile={store.profile} updateProfile={store.updateProfile} />;
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
          credits={credits}
          profile={store.profile}
          onRefill={() => setRefill({ open: true, needed: 0, onAfter: null })}
        />
        <div className="v-app-body">
          <VellumSidebar page={page} setPage={setPage} onNewListing={handleNewListing} />
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
            balance={credits}
            onClose={() => setRefill({ open: false, needed: 0, onAfter: null })}
            onConfirm={onRefillConfirm}
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
