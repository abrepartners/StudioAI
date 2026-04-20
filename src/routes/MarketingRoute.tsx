import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PricingPage from '../../components/PricingPage';
import { useSubscription } from '../../hooks/useSubscription';
import { getFeatureFlag } from '../config/featureFlags';
import { readGoogleUser } from './authStorage';
import { trackEvent } from '../lib/analytics';

type MarketingAnchor = 'pricing' | 'features' | 'faq' | 'gallery';

interface Props {
  anchor: MarketingAnchor;
}

const FEATURES = [
  {
    title: 'Virtual Staging',
    body: 'Generate listing-ready staged photos while preserving framing and architecture.',
  },
  {
    title: 'Smart Cleanup',
    body: 'Remove clutter and distractions with confidence checks that reduce reframing risk.',
  },
  {
    title: 'Listing Kit',
    body: 'Bundle staged images, cleanup outputs, MLS exports, social assets, and listing copy in one run.',
  },
  {
    title: 'Team Controls',
    body: 'Manage brokerage usage and shared outputs with role-aware access and billing controls.',
  },
];

const FAQS = [
  {
    q: 'Can I try before paying?',
    a: 'Yes. Every account starts with free generations before paid plans are required.',
  },
  {
    q: 'Do you support team billing?',
    a: 'Yes. Team plans include bundled seats and one centralized billing flow.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Manage plan, invoices, and cancellation from billing settings.',
  },
];

const MarketingShell: React.FC<{ children: React.ReactNode; userEmail: string | null }> = ({ children, userEmail }) => (
  <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
    <header className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
      <Link to="/" className="font-display text-lg tracking-tight">StudioAI</Link>
      <nav className="flex items-center gap-5 text-xs text-zinc-400">
        <Link to="/features" className="hover:text-white transition">Features</Link>
        <Link to="/pricing" className="hover:text-white transition">Pricing</Link>
        <Link to="/faq" className="hover:text-white transition">FAQ</Link>
        <Link to="/gallery" className="hover:text-white transition">Gallery</Link>
      </nav>
      <div className="text-xs text-zinc-400">
        {userEmail ? userEmail : <Link to="/" className="hover:text-white transition">Sign in</Link>}
      </div>
    </header>
    <main className="flex-1 px-6 py-12">{children}</main>
  </div>
);

const MarketingRoute: React.FC<Props> = ({ anchor }) => {
  const user = useMemo(() => readGoogleUser(), []);
  const subscription = useSubscription(user?.email || null);
  const routeLinkStability = useMemo(
    () => getFeatureFlag('route_link_stability', { seed: user?.email }),
    [user?.email]
  );

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

  useEffect(() => {
    if (anchor === 'pricing') {
      trackEvent('pricing_viewed', { location: 'route' });
    }
  }, [anchor]);

  useEffect(() => {
    if (!routeLinkStability) {
      window.location.replace('/');
    }
  }, [routeLinkStability]);

  const onRequireSignIn = () => {
    window.location.assign('/');
  };

  if (!routeLinkStability) {
    return null;
  }

  if (anchor === 'pricing') {
    return (
      <MarketingShell userEmail={user?.email || null}>
        <div className="max-w-6xl mx-auto">
          <PricingPage
            email={user?.email ?? null}
            onRequireSignIn={onRequireSignIn}
            onStartCheckout={(plan, interval) => {
              if (!user?.sub) {
                onRequireSignIn();
                return;
              }
              trackEvent('checkout_started', { plan, interval, source: 'pricing_route' });
              subscription.startCheckout(user.sub, { plan, interval });
            }}
            id="pricing"
          />
        </div>
      </MarketingShell>
    );
  }

  if (anchor === 'features') {
    return (
      <MarketingShell userEmail={user?.email || null}>
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="font-display text-4xl tracking-tight">Features</h1>
          <p className="text-zinc-400 text-sm max-w-2xl">
            StudioAI is built for listing workflows: from raw room photos to market-ready assets.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <h2 className="text-lg font-semibold text-white">{feature.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </MarketingShell>
    );
  }

  if (anchor === 'faq') {
    return (
      <MarketingShell userEmail={user?.email || null}>
        <div className="max-w-3xl mx-auto space-y-4">
          <h1 className="font-display text-4xl tracking-tight">FAQ</h1>
          {FAQS.map((item) => (
            <details key={item.q} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-white">{item.q}</summary>
              <p className="mt-2 text-sm text-zinc-400">{item.a}</p>
            </details>
          ))}
        </div>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell userEmail={user?.email || null}>
      <div className="max-w-md mx-auto text-center py-24">
        <h1 className="font-display text-4xl tracking-tight mb-3">Showcase Gallery</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Community-approved renders from StudioAI are rolling out soon.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition"
        >
          Start staging
        </Link>
      </div>
    </MarketingShell>
  );
};

export default MarketingRoute;
