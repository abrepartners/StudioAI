/**
 * SettingsRoute.tsx — R21
 *
 * Promotes the Access Panel modal contents to a real page with 6 sub-tabs:
 *   /settings/brand          BrandKit form
 *   /settings/team           ManageTeam (admin only)
 *   /settings/billing        Billing status + Stripe portal trigger
 *   /settings/referral       ReferralDashboard
 *   /settings/integrations   shell (Aryeo/GHL/API tokens — Phase 2+)
 *   /settings/account        Google account + sign out
 *
 * Wires to existing components (BrandKit, ManageTeam, ReferralDashboard)
 * unchanged. Billing + Integrations + Account rendered inline until
 * their dedicated components land.
 */

import React, { useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Palette,
  Users,
  CreditCard,
  Share2,
  Plug,
  User as UserIcon,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import BrandKit from '../../components/BrandKit';
import ManageTeam from '../../components/ManageTeam';
import ReferralDashboard from '../../components/ReferralDashboard';
import { isAdmin, readGoogleUser, type GoogleUser } from './authStorage';

type SettingsTab =
  | 'brand'
  | 'team'
  | 'billing'
  | 'referral'
  | 'integrations'
  | 'account';

const TAB_LABELS: Record<SettingsTab, { label: string; icon: React.ElementType; adminOnly?: boolean }> = {
  brand: { label: 'Brand Kit', icon: Palette },
  team: { label: 'Team', icon: Users, adminOnly: true },
  billing: { label: 'Billing', icon: CreditCard },
  referral: { label: 'Referral', icon: Share2 },
  integrations: { label: 'Integrations', icon: Plug },
  account: { label: 'Account', icon: UserIcon },
};

const isValidTab = (t: string | undefined): t is SettingsTab =>
  !!t && Object.prototype.hasOwnProperty.call(TAB_LABELS, t);

const SettingsRoute: React.FC = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const user = useMemo(() => readGoogleUser(), []);

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    document.title = tab ? `${tab[0].toUpperCase()}${tab.slice(1)} · Settings · StudioAI` : 'Settings · StudioAI';
  }, [tab]);

  if (!user) return null;

  const activeTab: SettingsTab = isValidTab(tab) ? tab : 'brand';
  const admin = isAdmin(user);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/" className="font-display text-lg tracking-tight">StudioAI</a>
          <nav className="flex items-center gap-4 text-xs text-zinc-400">
            <a href="/" className="hover:text-white transition">Studio</a>
            <a href="/listings" className="hover:text-white transition">Listings</a>
            <a href="/settings/brand" className="text-white font-semibold">Settings</a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full ring-1 ring-white/20" />
          <span className="hidden sm:inline text-xs text-zinc-400">{user.email}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {(Object.keys(TAB_LABELS) as SettingsTab[]).map((key) => {
              const meta = TAB_LABELS[key];
              if (meta.adminOnly && !admin) return null;
              const Icon = meta.icon;
              return (
                <NavLink
                  key={key}
                  to={`/settings/${key}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                      isActive
                        ? 'bg-white/[0.08] text-white font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`
                  }
                >
                  <Icon size={14} />
                  <span>{meta.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main>
          {activeTab === 'brand' && (
            <section>
              <SectionHeading title="Brand Kit" subtitle="Logo, colors, contact details — applied to every export." />
              <BrandKit />
            </section>
          )}

          {activeTab === 'team' && admin && (
            <section>
              <SectionHeading title="Team" subtitle="Invite and manage your brokerage seats." />
              <ManageTeam adminEmail={user.email} />
            </section>
          )}
          {activeTab === 'team' && !admin && <AccessDenied />}

          {activeTab === 'billing' && (
            <BillingTab user={user} />
          )}

          {activeTab === 'referral' && (
            <section>
              <SectionHeading title="Referral" subtitle="Share StudioAI, earn locked-in pricing." />
              <ReferralDashboard userEmail={user.email} userId={user.sub} />
            </section>
          )}

          {activeTab === 'integrations' && (
            <IntegrationsTab />
          )}

          {activeTab === 'account' && (
            <AccountTab user={user} />
          )}
        </main>
      </div>
    </div>
  );
};

// ─── Sub-tab helpers ────────────────────────────────────────────────────────

const SectionHeading: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-6">
    <h1 className="font-display text-2xl tracking-tight">{title}</h1>
    {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
  </div>
);

const AccessDenied: React.FC = () => (
  <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-8 text-center">
    <h2 className="font-display text-xl mb-2">Admins only</h2>
    <p className="text-sm text-zinc-400">Team management is available to brokerage admin accounts.</p>
  </div>
);

const BillingTab: React.FC<{ user: GoogleUser }> = ({ user }) => {
  // Placeholder — Cluster B owns the real billing page (R19). This tab
  // just surfaces the portal CTA + upgrade hook so /settings/billing is
  // reachable today.
  return (
    <section>
      <SectionHeading title="Billing" subtitle="Plan, usage, and credit packs." />
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current plan</div>
            <div className="text-lg font-semibold mt-0.5">Free</div>
          </div>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition"
          >
            See plans
          </a>
        </div>
        <div className="pt-4 border-t border-white/[0.06] text-xs text-zinc-500">
          Signed in as {user.email}. Stripe customer portal opens from the editor's upgrade flow once you're on a paid plan.
        </div>
      </div>
    </section>
  );
};

const IntegrationsTab: React.FC = () => (
  <section>
    <SectionHeading title="Integrations" subtitle="Connect StudioAI to your listing stack." />
    <div className="grid gap-3">
      {[
        { name: 'Aryeo', desc: 'Pull orders + push staged media back into your Aryeo deliveries.', status: 'Coming soon' },
        { name: 'GoHighLevel', desc: 'Send client updates + listing links into GHL workflows.', status: 'Coming soon' },
        { name: 'Gemini API key', desc: 'Bring your own key for unlimited Pro-tier generations.', status: 'Managed' },
        { name: 'API tokens', desc: 'Programmatic access for brokerage admins.', status: 'Phase 2+' },
      ].map((row) => (
        <div key={row.name} className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">{row.name}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{row.desc}</div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{row.status}</span>
        </div>
      ))}
    </div>
  </section>
);

const AccountTab: React.FC<{ user: GoogleUser }> = ({ user }) => {
  const handleSignOut = () => {
    try {
      localStorage.removeItem('studioai_google_user');
    } catch {}
    window.location.assign('/');
  };
  return (
    <section>
      <SectionHeading title="Account" subtitle="Google sign-in + sign-out." />
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 flex items-center gap-4">
        <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full ring-1 ring-white/20" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{user.name}</div>
          <div className="text-xs text-zinc-400 truncate flex items-center gap-1">
            {user.email}
            <a href="https://myaccount.google.com" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white inline-flex items-center gap-1">
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.12] text-sm text-zinc-300 hover:bg-white/[0.04] transition"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </section>
  );
};

export default SettingsRoute;
