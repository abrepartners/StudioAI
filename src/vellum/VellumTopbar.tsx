import React from 'react';
import { Icon } from './icons';

interface TopbarProps {
  page: string;
  setPage: (p: string) => void;
  credits: number;
  onRefill: () => void;
}

export const VellumTopbar: React.FC<TopbarProps> = ({ page, setPage, credits, onRefill }) => {
  const low = credits < 20;
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
        <button className="v-btn v-btn--ghost v-btn--sm">
          <Icon name="upload" size={13} /> Upload
        </button>
        <div
          className="v-avatar"
          onClick={() => setPage('settings')}
          title="Account settings"
        >
          M
        </div>
      </div>
    </div>
  );
};
