import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  Suspense,
} from "react";
import "./vellum.css";
import { Icon } from "./icons";
import { VellumTopbar } from "./VellumTopbar";
import { VellumSidebar } from "./VellumSidebar";
import { useVellumStore } from "./useVellumStore";
import { readGoogleUser, type GoogleUser } from "../routes/authStorage";
import { useSubscription } from "../../hooks/useSubscription";
import {
  resetWorkspaceOnAccountSwitch,
  clearVellumWorkspace,
} from "./imageStore";
import { hasUnreadWhatsNew, markWhatsNewSeen } from "./whatsNew";

const VellumDashboard = React.lazy(() => import("./VellumDashboard"));
const VellumProjects = React.lazy(() => import("./VellumProjects"));
const VellumPhotoEditor = React.lazy(() => import("./VellumPhotoEditor"));
const VellumVideoEditor = React.lazy(() => import("./VellumVideoEditor"));
const VellumBilling = React.lazy(() => import("./VellumBilling"));
const VellumSettings = React.lazy(() => import("./VellumSettings"));
const VellumHelp = React.lazy(() => import("./VellumHelp"));
const VellumRefillModal = React.lazy(() => import("./VellumRefillModal"));
const VellumNewListingModal = React.lazy(
  () => import("./VellumNewListingModal"),
);
const VellumWhatsNew = React.lazy(() => import("./VellumWhatsNew"));

const VALID_PAGES = [
  "dashboard",
  "projects",
  "photo",
  "video",
  "billing",
  "settings",
  "help",
];

// Hash format: #page or #page/proj_123 (active project encoded as 2nd segment)
function parseHash(): { page: string; projectId: string | null } {
  const raw = window.location.hash.replace("#", "");
  const [pageSeg, projectSeg] = raw.split("/");
  const page = VALID_PAGES.includes(pageSeg) ? pageSeg : "dashboard";
  const projectId =
    projectSeg && projectSeg.startsWith("proj_") ? projectSeg : null;
  return { page, projectId };
}

function buildHash(page: string, projectId: string | null): string {
  return projectId ? `${page}/${projectId}` : page;
}

const GOOGLE_CLIENT_ID =
  (typeof process !== "undefined" && process.env?.GOOGLE_CLIENT_ID) ||
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  "114715484927-pbu0mro7f5imhbo5q77k1imqi5etc2a3.apps.googleusercontent.com";

const AUTH_STORAGE_KEY = "studioai_google_user";

function decodeJwtPayload(token: string): GoogleUser | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    if (payload.email && payload.sub) {
      return {
        name: payload.name || "",
        email: payload.email,
        picture: payload.picture || "",
        sub: payload.sub,
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface RefillState {
  open: boolean;
  needed: number;
  onAfter:
    ((res: { ok: boolean; charged: number; refilled?: number }) => void) | null;
}

const VellumApp: React.FC = () => {
  const [page, setPage] = useState(() => parseHash().page);

  // ─── Auth ───────────────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(() =>
    readGoogleUser(),
  );
  const [authLoading, setAuthLoading] = useState(true);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredential = useCallback(async (response: any) => {
    const user = decodeJwtPayload(response.credential);
    if (user) {
      // Different account on this browser -> clear the previous account's local
      // workspace so its projects never leak into this session.
      void resetWorkspaceOnAccountSwitch(user.sub);
      setGoogleUser(user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
    // Exchange the raw Google credential for a StudioAI session cookie: the
    // server verifies the Google token ONCE against Google's JWKS and mints a
    // 7-day HttpOnly session. Same-origin, so the Set-Cookie lands
    // automatically and every /api/* generation call is authenticated without
    // the Google token's 1-hour expiry ever touching the API. (This endpoint
    // also folds in the user upsert that /api/track-login used to do.)
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
    } catch {
      /* non-fatal — auth guard re-prompts if the cookie is missing */
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
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: 300,
        });
      }
    };
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

  const handleSignOut = useCallback(() => {
    void clearVellumWorkspace();
    setGoogleUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    const google = (window as any).google;
    if (google?.accounts?.id) google.accounts.id.disableAutoSelect();
  }, []);

  // ─── Subscription (real Stripe billing) ─────────────────────────────
  const subscription = useSubscription(
    googleUser?.email || null,
    googleUser?.sub || null,
  );

  const canGenerate = subscription.canGenerate;
  const isUnlimited = subscription.generationsLimit === -1;

  // Bridge: map Vellum's credit model to real subscription
  // Each tool use = 1 generation. Pro/Team = unlimited.
  const effectiveCredits = isUnlimited
    ? 999
    : subscription.plan === "credits"
      ? subscription.credits
      : Math.max(
          0,
          subscription.generationsLimit - subscription.generationsUsed,
        );

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

  const [refill, setRefill] = useState<RefillState>({
    open: false,
    needed: 0,
    onAfter: null,
  });
  const [newListingOpen, setNewListingOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewUnread, setWhatsNewUnread] = useState(() =>
    hasUnreadWhatsNew(),
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    // Rehydrate active project from hash; fall back to scratch (null) if the
    // project no longer exists in the store.
    const { projectId } = parseHash();
    if (projectId && store.projects.some((p) => p.id === projectId))
      return projectId;
    return null;
  });

  const activeProject =
    store.projects.find((p) => p.id === activeProjectId) || null;

  // GATE ONLY — checks affordability and either proceeds or opens the refill
  // modal. It does NOT charge; charging happens via subscription.recordGeneration
  // called once per successful photo inside the editor.
  const requestSpend = useCallback(
    (amount: number, onProceed?: (res: any) => void) => {
      if (isUnlimited || effectiveCredits >= amount) {
        onProceed?.({ ok: true, charged: amount });
        return true;
      }
      // Not enough generations — open refill/upgrade modal
      setRefill({ open: true, needed: amount, onAfter: onProceed || null });
      return false;
    },
    [isUnlimited, effectiveCredits],
  );

  const onRefillConfirm = useCallback(
    (added: number) => {
      // Credit pack purchase succeeded — refresh subscription state
      subscription.refresh();
      if (refill.onAfter) {
        const cb = refill.onAfter;
        setTimeout(
          () => cb({ ok: true, charged: refill.needed, refilled: added }),
          50,
        );
      }
    },
    [refill, subscription],
  );

  const handleNewListing = useCallback(() => {
    setNewListingOpen(true);
  }, []);

  const handleUploadFiles = useCallback(() => {
    store.setPendingUploadOpen(true);
    setPage("photo");
  }, [store]);

  const handleCreateListing = useCallback(
    (data: {
      address: string;
      city: string;
      propertyType: string;
      beds: number | null;
      baths: number | null;
    }) => {
      const id = store.addProject(data);
      setActiveProjectId(id);
      setNewListingOpen(false);
      setPage("photo");
    },
    [store],
  );

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setPage("photo");
  }, []);

  useEffect(() => {
    const next = buildHash(page, activeProjectId);
    if (window.location.hash.replace("#", "") !== next) {
      window.location.hash = next;
    }
  }, [page, activeProjectId]);

  useEffect(() => {
    const onHash = () => {
      const { page: nextPage, projectId } = parseHash();
      setPage(nextPage);
      // Validate against the store; fall back to scratch (null) if gone.
      setActiveProjectId(
        projectId && store.projects.some((p) => p.id === projectId)
          ? projectId
          : null,
      );
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [store.projects]);

  // ─── Auth wall ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="vellum">
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100vh",
            background: "var(--background-primary, #0a0a0a)",
          }}
        >
          <div style={{ color: "var(--graphite, #888)", fontSize: 13 }}>
            Loading…
          </div>
        </div>
      </div>
    );
  }

  if (!googleUser) {
    return (
      <div className="vellum">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "var(--background-primary, #0a0a0a)",
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              marginBottom: 12,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--warm-ivory, #f5f0e8)",
            }}
          >
            Vellum
          </div>
          <p
            style={{
              fontSize: 15,
              color: "var(--graphite, #888)",
              maxWidth: 380,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            AI-powered listing media for real estate agents. Stage, clean up,
            relight, and export — all from one place.
          </p>
          <div
            ref={googleButtonRef}
            style={{ minHeight: 44, marginBottom: 24 }}
          />
          <p
            style={{
              fontSize: 12,
              color: "var(--graphite, #888)",
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            5 free edits to start. No credit card required.
          </p>
        </div>
      </div>
    );
  }

  // ─── Authed app ─────────────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return (
          <VellumDashboard
            setPage={setPage}
            credits={effectiveCredits}
            projects={store.projects}
            profile={store.profile}
            onNewListing={handleNewListing}
            onSelectProject={handleSelectProject}
            subscription={subscription}
          />
        );
      case "projects":
        return (
          <VellumProjects
            setPage={setPage}
            projects={store.projects}
            onNewListing={handleNewListing}
            onSelectProject={handleSelectProject}
            onDeleteProject={store.deleteProject}
          />
        );
      case "photo":
        return (
          <VellumPhotoEditor
            setPage={setPage}
            credits={effectiveCredits}
            requestSpend={requestSpend}
            recordGeneration={subscription.recordGeneration}
            activeProject={activeProject}
            updateProject={store.updateProject}
            onSessionExpired={handleSignOut}
          />
        );
      case "video":
        return (
          <VellumVideoEditor
            setPage={setPage}
            credits={effectiveCredits}
            requestSpend={requestSpend}
            recordGeneration={subscription.recordGeneration}
            activeProject={activeProject}
          />
        );
      case "billing":
        return (
          <VellumBilling
            setPage={setPage}
            credits={effectiveCredits}
            subscription={subscription}
            userEmail={googleUser.email}
            userId={googleUser.sub}
          />
        );
      case "settings":
        return (
          <VellumSettings
            setPage={setPage}
            profile={store.profile}
            updateProfile={store.updateProfile}
            googleUser={googleUser}
            onSignOut={handleSignOut}
          />
        );
      case "help":
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
          whatsNewUnread={whatsNewUnread}
          onWhatsNew={() => {
            // Single owner of seen-state: persist + clear the dot here so a
            // future second entry point can't get the two out of sync.
            markWhatsNewSeen();
            setWhatsNewUnread(false);
            setWhatsNewOpen(true);
          }}
        />
        <div className="v-app-body">
          <VellumSidebar
            page={page}
            setPage={setPage}
            onNewListing={handleNewListing}
            onUploadFiles={handleUploadFiles}
          />
          <main className="v-app-main">
            <Suspense
              fallback={
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minHeight: "50vh",
                    color: "var(--graphite)",
                    fontSize: 13,
                  }}
                >
                  Loading…
                </div>
              }
            >
              {renderPage()}
            </Suspense>
          </main>
        </div>

        {/* [MOBILE contract] Global nav dock — the sidebar and topbar nav are
            hidden under 900px, so this is the only persistent way around the
            app on phones. The photo editor owns the dock slot on its page
            (Tools/Adjust), so it is skipped there. Hidden ≥900px via the
            shared .v-mobile-tabbar rule. */}
        {page !== "photo" && (
          <nav className="v-mobile-tabbar" aria-label="Primary">
            {[
              { id: "dashboard", icon: "home", label: "Home" },
              { id: "projects", icon: "folder", label: "Projects" },
              { id: "photo", icon: "image", label: "Photos" },
              { id: "video", icon: "video", label: "Reels" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={page === t.id ? "is-active" : ""}
                aria-current={page === t.id ? "page" : undefined}
                onClick={() => setPage(t.id)}
              >
                <Icon name={t.icon} size={14} /> {t.label}
              </button>
            ))}
            {googleUser?.email === "book@averyandbryant.com" && (
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/admin/morph";
                }}
              >
                <Icon name="video" size={14} /> Morph
              </button>
            )}
          </nav>
        )}

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
          {/* Mounted on demand so the lazy chunk isn't fetched at startup
              for a panel most sessions never open. */}
          {whatsNewOpen && (
            <VellumWhatsNew
              open={whatsNewOpen}
              onClose={() => setWhatsNewOpen(false)}
              userEmail={googleUser.email}
              userName={googleUser.name}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default VellumApp;
