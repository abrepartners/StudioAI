import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons';
import type { VellumProfile } from './useVellumStore';
import { clearVellumWorkspace } from './imageStore';

interface TopbarProps {
  page: string;
  setPage: (p: string) => void;
  credits: number;
  profile: VellumProfile;
  onRefill: () => void;
  onUploadFiles: () => void;
  googleUser?: { name: string; picture: string } | null;
  subscription?: { plan: string; generationsLimit: number; subscribed: boolean };
  whatsNewUnread?: boolean;
  onWhatsNew?: () => void;
}

export const VellumTopbar: React.FC<TopbarProps> = ({ page, setPage, credits, profile, onRefill, onUploadFiles, googleUser, subscription, whatsNewUnread, onWhatsNew }) => {
  const isUnlimited = subscription?.generationsLimit === -1;
  const low = !isUnlimited && credits < 5;
  const displayName = googleUser?.name || profile.name || '';
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'V';
  const avatarPic = googleUser?.picture || '';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleSignOut = () => {
    try { void clearVellumWorkspace(); } catch {}
    try { localStorage.removeItem('studioai_google_user'); } catch {}
    try { (window as any).google?.accounts?.id?.disableAutoSelect(); } catch {}
    window.location.assign('/');
  };

  return (
    <div className="v-topbar">
      <button
        type="button"
        className="wordmark"
        onClick={() => setPage('dashboard')}
        title="Dashboard"
      >
        Vellum
      </button>
      <div className="spacer" />
      <div className="right">
        {isUnlimited ? (
          <span className="v-credits-chip" title="Unlimited on your plan">
            <span className="dot" />
            <span>Unlimited</span>
          </span>
        ) : (
          <button
            className={'v-credits-chip' + (low ? ' low' : '')}
            onClick={onRefill}
            title="Edits remaining"
          >
            <span className="dot" />
            <span>{credits} edits</span>
            {low && <span className="chip-cta">Upgrade →</span>}
          </button>
        )}
        <button className="v-btn v-btn--ghost v-btn--sm" onClick={onUploadFiles}>
          <Icon name="upload" size={13} /> Upload
        </button>
        <div className="v-avatar-wrap" ref={menuRef}>
          <div
            className="v-avatar"
            onClick={() => setMenuOpen(v => !v)}
            title="Account menu"
          >
            {whatsNewUnread && <span className="v-avatar-dot" aria-hidden="true" />}
            {avatarPic
              ? <img src={avatarPic} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
              : initial
            }
          </div>
          {menuOpen && (
            <div className="v-avatar-menu">
              {/* Workspace links double as the mobile escape hatch — the
                  sidebar and topbar nav are both hidden under 900px. */}
              <button onClick={() => { setMenuOpen(false); setPage('dashboard'); }}>
                <Icon name="home" size={14} /> Dashboard
              </button>
              <button onClick={() => { setMenuOpen(false); setPage('projects'); }}>
                <Icon name="folder" size={14} /> Projects
              </button>
              <div className="v-avatar-menu-divider" />
              <button onClick={() => { setMenuOpen(false); setPage('settings'); }}>
                <Icon name="settings" size={14} /> Settings
              </button>
              <button onClick={() => { setMenuOpen(false); setPage('billing'); }}>
                <Icon name="card" size={14} /> Billing
              </button>
              <button onClick={() => { setMenuOpen(false); setPage('help'); }}>
                <Icon name="help" size={14} /> Help
              </button>
              {onWhatsNew && (
                <button onClick={() => { setMenuOpen(false); onWhatsNew(); }}>
                  <Icon name="sparkles" size={14} /> What's new
                  {whatsNewUnread && <span className="v-menu-dot" aria-hidden="true" />}
                </button>
              )}
              <div className="v-avatar-menu-divider" />
              <button onClick={handleSignOut}>
                <Icon name="logout" size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
