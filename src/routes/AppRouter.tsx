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

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import App from '../../App';
import MarketingRoute from './MarketingRoute';
import TryRoute from './TryRoute';
import ListingsRoute from './ListingsRoute';
import SettingsRoute from './SettingsRoute';

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
          {/* Editor shell — existing App mounts at / */}
          <Route path="/" element={<App />} />

          {/* R24 — real marketing URLs, pre- and post-auth */}
          <Route path="/pricing" element={<MarketingRoute anchor="pricing" />} />
          <Route path="/features" element={<MarketingRoute anchor="features" />} />
          <Route path="/faq" element={<MarketingRoute anchor="faq" />} />
          <Route path="/gallery" element={<MarketingRoute anchor="gallery" />} />

          {/* R25 — unauth single-gen demo (Fork #3 Option D) */}
          <Route path="/try" element={<TryRoute />} />

          {/* R22 — listings surface (ListingDashboard + useListing) */}
          <Route path="/listings" element={<ListingsRoute />} />
          <Route path="/listings/:id" element={<ListingsRoute />} />

          {/* R21 — settings page with 6 sub-tabs */}
          <Route path="/settings" element={<Navigate to="/settings/brand" replace />} />
          <Route path="/settings/:tab" element={<SettingsRoute />} />

          {/* Fallback: unknown path → editor */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRouter;
