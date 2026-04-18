/**
 * MarketingRoute.tsx — R24
 *
 * Real URLs for landing-page sections. For now we reuse the existing
 * unauthed marketing scroll (which lives inside App.tsx) by rendering
 * App + auto-scrolling to the anchor id. Works pre- and post-auth:
 *   - unauthed user at /pricing → sees marketing page, scrolls to #pricing
 *   - authed user at /pricing  → editor mounts, but we still honor the URL
 *     by sending them to `/#pricing` so they can bookmark / share.
 *
 * Phase 2 follow-up: extract `<MarketingPage />` out of App.tsx so these
 * routes can render it directly without the editor shell trampoline.
 */

import React, { useEffect } from 'react';
import App from '../../App';
import { readGoogleUser } from './authStorage';

type MarketingAnchor = 'pricing' | 'features' | 'faq' | 'gallery';

interface Props {
  anchor: MarketingAnchor;
}

const MarketingRoute: React.FC<Props> = ({ anchor }) => {
  useEffect(() => {
    const user = readGoogleUser();

    // Unauthed: marketing scroll is embedded in App.tsx, scroll to anchor.
    if (!user) {
      const attemptScroll = () => {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }
        return false;
      };
      // Section may mount one frame late after App hydrates.
      if (!attemptScroll()) {
        const raf = requestAnimationFrame(() => {
          if (!attemptScroll()) {
            setTimeout(attemptScroll, 120);
          }
        });
        return () => cancelAnimationFrame(raf);
      }
    } else {
      // Authed: editor takes over, but bounce them back to `/#anchor` so
      // the URL is still shareable/bookmarkable.
      if (window.location.hash !== `#${anchor}`) {
        window.history.replaceState(null, '', `/#${anchor}`);
      }
    }
    return;
  }, [anchor]);

  // Document title hint — helps deep-linked / bookmarked URLs feel legit.
  useEffect(() => {
    const prev = document.title;
    const label =
      anchor === 'pricing' ? 'Pricing' :
      anchor === 'features' ? 'Features' :
      anchor === 'faq' ? 'FAQ' :
      'Gallery';
    document.title = `${label} · StudioAI`;
    return () => { document.title = prev; };
  }, [anchor]);

  // Gallery doesn't exist in App.tsx yet — render a placeholder shell that
  // still lives under the marketing chrome so the URL is reachable today.
  if (anchor === 'gallery') {
    return <GalleryPlaceholder />;
  }

  return <App />;
};

const GalleryPlaceholder: React.FC = () => (
  <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
    <header className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
      <a href="/" className="font-display text-lg tracking-tight">StudioAI</a>
      <nav className="flex items-center gap-5 text-xs text-zinc-400">
        <a href="/features" className="hover:text-white transition">Features</a>
        <a href="/pricing" className="hover:text-white transition">Pricing</a>
        <a href="/faq" className="hover:text-white transition">FAQ</a>
      </nav>
    </header>
    <main className="flex-1 grid place-items-center px-6 py-24">
      <div className="text-center max-w-md">
        <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">Showcase gallery</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Community-approved renders from StudioAI. Coming this phase — admins can already
          approve submissions from the profile panel.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition"
        >
          Start staging
        </a>
      </div>
    </main>
  </div>
);

export default MarketingRoute;
