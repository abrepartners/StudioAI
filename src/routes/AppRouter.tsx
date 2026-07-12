/**
 * AppRouter.tsx — Phase 2 R20
 *
 * Introduces react-router-dom on top of the existing single-shell App.tsx.
 *
 * Strategy (deliberately minimal so Cluster A's in-flight copy edits and
 * Cluster B's pricing-page extract don't collide with structural moves):
 *   - `/` still mounts the existing <App /> unchanged. Its internal
 *     activePanel state drives the editor like before.
 *   - NEW adjacent routes (`/pricing`, `/features`, `/faq`, `/gallery`,
 *     `/try`, `/listings`, `/settings/*`) live in sibling files and reuse
 *     components directly — they do not depend on App.tsx internals.
 *   - A small <AuthedGate> reads the same localStorage key the App shell
 *     uses (`studioai_google_user`) so settings/listings respect auth
 *     without duplicating the OAuth dance.
 *
 * Follow-up (after A/B/D land): lift activePanel into routes proper and
 * retire the mode-based rendering inside App.tsx.
 */

import React, { Suspense, lazy, useMemo } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import App from "../../App";
import MarketingRoute from "./MarketingRoute";
import TryRoute from "./TryRoute";
import ListingsRoute from "./ListingsRoute";
import SettingsRoute from "./SettingsRoute";
import AdminPackMatrixRoute from "./AdminPackMatrixRoute";
import AdminApiDashboardRoute from "./AdminApiDashboardRoute";
import MorphRoute from "./MorphRoute";
import PrivacyRoute from "./PrivacyRoute";
import TermsRoute from "./TermsRoute";
import { readGoogleUser } from "./authStorage";

// A failed lazy chunk (flaky network, stale deploy) otherwise rejects the
// dynamic import and leaves a permanently black screen with no way out.
const ChunkErrorScreen: React.FC = () => (
  <div className="min-h-screen grid place-items-center bg-black px-6">
    <div className="text-center">
      <p className="text-zinc-300 text-sm mb-4">
        Something didn't load — check your connection and try again.
      </p>
      <button
        className="px-4 py-2 rounded-lg bg-zinc-800 text-white text-sm border border-zinc-700"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  </div>
);

const lazyRoute = (
  load: () => Promise<{ default: React.ComponentType<any> }>,
) =>
  lazy(() =>
    load().catch((err) => {
      console.error("route chunk failed to load", err);
      return { default: ChunkErrorScreen };
    }),
  );

const VellumApp = lazyRoute(() => import("../vellum/VellumApp"));
const VellumLanding = lazyRoute(() => import("../vellum/VellumLanding"));
// Admin-only, and it pulls in the full editor (callApiDirect) — lazy so it
// never lands in the initial bundle for regular agents.
const ModelLabRoute = lazyRoute(() => import("./ModelLabRoute"));

const AuthedRoot: React.FC = () => {
  const user = useMemo(() => readGoogleUser(), []);
  if (user) return <Navigate to="/vellum" replace />;
  return <VellumLanding />;
};

const RouteFallback: React.FC = () => (
  <div className="min-h-screen grid place-items-center bg-black text-zinc-400 text-sm">
    Loading…
  </div>
);

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Root: authed users → Vellum editor, unauthed → marketing/pricing */}
          <Route path="/" element={<AuthedRoot />} />

          {/* Legacy editor shell (Gemini-dependent, preserved for reference) */}
          <Route path="/legacy" element={<App />} />

          {/* R24 — real marketing URLs, pre- and post-auth */}
          <Route
            path="/pricing"
            element={<MarketingRoute anchor="pricing" />}
          />
          <Route
            path="/features"
            element={<MarketingRoute anchor="features" />}
          />
          <Route path="/faq" element={<MarketingRoute anchor="faq" />} />
          <Route
            path="/gallery"
            element={<MarketingRoute anchor="gallery" />}
          />

          {/* R25 — unauth single-gen demo (Fork #3 Option D) */}
          <Route path="/try" element={<TryRoute />} />

          {/* R22 — listings surface (ListingDashboard + useListing) */}
          <Route path="/listings" element={<ListingsRoute />} />
          <Route path="/listings/:id" element={<ListingsRoute />} />

          {/* R21 — settings page with 6 sub-tabs */}
          <Route
            path="/settings"
            element={<Navigate to="/settings/brand" replace />}
          />
          <Route path="/settings/:tab" element={<SettingsRoute />} />

          {/* Admin: Pack verification matrix (7×3 grid, admin-only) */}
          <Route path="/admin/pack-matrix" element={<AdminPackMatrixRoute />} />

          {/* Admin: Model Lab — A/B/C test Replicate models per tool */}
          <Route path="/admin/model-lab" element={<ModelLabRoute />} />

          {/* Admin: API registry dashboard */}
          <Route path="/admin/api" element={<AdminApiDashboardRoute />} />

          {/* Owner tool: Property Morph reels (gated to book@averyandbryant.com) */}
          <Route path="/admin/morph" element={<MorphRoute />} />

          {/* Vellum — editorial hi-fi prototype (parallel build) */}
          <Route path="/vellum" element={<VellumApp />} />
          <Route path="/vellum/*" element={<VellumApp />} />

          {/* Legal: Privacy Policy + Terms (Google OAuth consent screen URLs) */}
          <Route path="/privacy" element={<PrivacyRoute />} />
          <Route path="/terms" element={<TermsRoute />} />

          {/* Fallback: unknown path → editor */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRouter;
