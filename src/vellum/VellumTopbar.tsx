import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons';
import type { VellumProfile } from './useVellumStore';

interface TopbarProps {
  page: string;
  setPage: (p: string) => void;
  credits: number;
  profile: VellumProfile;
  onRefill: () => void;
  onUploadFiles: () => void;
}

export const VellumTopbar: React.FC<TopbarProps> = ({ page, setPage, credits, profile, onRefill, onUploadFiles }) => {
  const low = credits < 20;
  const initial = profile.name ? profile.name.charAt(0).toUpperCase() : 'V';
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
    try { localStorage.removeItem('studioai_google_user'); } catch {}
    window.location.assign('/');
  };

  return (
    <div className="v-topbar">
      <div className="wordmark">Vellum</div>
      <nav>
        <a
          className={['dashboard', 'projects', 'photo', 'video'].includes(page) ? 'active' : ''}
          onClick={() => setPage('dashboard')}
        >
          Workspace
        </a>
        <a
          className={['billing', 'settings'].includes(page) ? 'active' : ''}
          onClick={() => setPage('billing')}
        >
          Account
        </a>
        <a
          className={page === 'help' ? 'active' : ''}
          onClick={() => setPage('help')}
        >
          Help
        </a>
      </nav>
      <div className="spacer" />
      <div className="right">
        <button
          className={'v-credits-chip' + (low ? ' low' : '')}
          onClick={onRefill}
          title="Credits remaining this month"
        >
          <span className="dot" />
          <span>{credits} credits</span>
          {low && <span className="chip-cta">Refill →</span>}
        </button>
        <button className="v-btn v-btn--ghost v-btn--sm" onClick={onUploadFiles}>
          <Icon name="upload" size={13} /> Upload
        </button>
        <div className="v-avatar-wrap" ref={menuRef}>
          <div
            className="v-avatar"
            onClick={() => setMenuOpen(v => !v)}
            title="Account menu"
          >
            {initial}
          </div>
          {menuOpen && (
            <div className="v-avatar-menu">
              <button onClick={() => { setMenuOpen(false); setPage('settings'); }}>
                <Icon name="settings" size={14} /> Settings
              </button>
              <button onClick={() => { window.location.assign('/legacy'); }}>
                <Icon name="refresh" size={14} /> Classic editor
              </button>
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
