import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './icons';

interface SidebarProps {
  page: string;
  setPage: (p: string) => void;
}

export const VellumSidebar: React.FC<SidebarProps> = ({ page, setPage }) => {
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (importRef.current && !importRef.current.contains(e.target as Node)) {
        setImportOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const NavItem = ({ id, icon, label }: { id: string; icon: string; label: string }) => (
    <button
      className={'v-nav-link' + (page === id ? ' active' : '')}
      onClick={() => setPage(id)}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="v-sidebar">
      <div className="eyebrow">Workspace</div>
      <NavItem id="dashboard" icon="home" label="Dashboard" />
      <NavItem id="projects" icon="folder" label="Projects" />
      <NavItem id="photo" icon="image" label="Photo editor" />
      <NavItem id="video" icon="video" label="Video reels" />

      <div className="v-create-card">
        <span className="label">Create new</span>
        <button className="v-create-btn" onClick={() => setPage('photo')}>
          <Icon name="image" size={13} /> Photo project
        </button>
        <button className="v-create-btn video" onClick={() => setPage('video')}>
          <Icon name="play" size={13} /> Listing reel
        </button>
        <div className="v-import-row" ref={importRef}>
          <button
            className="v-import-trigger"
            onClick={(e) => { e.stopPropagation(); setImportOpen(o => !o); }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="upload" size={13} /> Import from…
            </span>
            <Icon name="chevron_down" size={12} />
          </button>
          {importOpen && (
            <div className="v-import-menu" onClick={(e) => e.stopPropagation()}>
              <button><Icon name="mls" /> MLS listing</button>
              <button><Icon name="folder" /> Dropbox</button>
              <button><Icon name="image" /> Google Drive</button>
              <button><Icon name="upload" /> Upload files</button>
            </div>
          )}
        </div>
      </div>

      <div className="eyebrow">Account</div>
      <NavItem id="billing" icon="card" label="Plan & billing" />
      <NavItem id="settings" icon="settings" label="Settings" />
      <NavItem id="help" icon="help" label="Help" />
    </aside>
  );
};
