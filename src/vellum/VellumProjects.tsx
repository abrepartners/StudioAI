import React, { useState } from 'react';
import { Icon } from './icons';
import type { VellumProject } from './useVellumStore';

interface ProjectsProps {
  setPage: (p: string) => void;
  projects: VellumProject[];
  onNewListing: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const VellumProjects: React.FC<ProjectsProps> = ({ setPage, projects, onNewListing, onSelectProject, onDeleteProject }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = projects
    .filter(p => filter === 'all' || p.status === filter)
    .filter(p => !search || (p.address + p.city + p.propertyType).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Projects</div>
          <h1 className="v-page-title">Every <em>listing</em>, in one place.</h1>
        </div>
        <button className="v-btn v-btn--primary" onClick={onNewListing}>New listing <Icon name="arrow_right" size={13} /></button>
      </div>

      <div className="v-filter-bar">
        <div className="v-search-input">
          <Icon name="search" />
          <input placeholder="Search by address or type" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="v-filter-chips">
          <button className={'v-filter-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All ({projects.length})</button>
          <button className={'v-filter-chip' + (filter === 'ready' ? ' active' : '')} onClick={() => setFilter('ready')}>Ready</button>
          <button className={'v-filter-chip' + (filter === 'processing' ? ' active' : '')} onClick={() => setFilter('processing')}>Processing</button>
          <button className={'v-filter-chip' + (filter === 'draft' ? ' active' : '')} onClick={() => setFilter('draft')}>Drafts</button>
        </div>
      </div>

      {!projects.length ? (
        <div className="v-empty-state">
          <div className="v-empty-icon">
            <Icon name="folder" size={28} color="var(--pale-gold)" />
          </div>
          <h3>No projects yet</h3>
          <p>Create a listing to start organizing your photos, reels, and exports in one place.</p>
          <button className="v-btn v-btn--primary" onClick={onNewListing}>
            <Icon name="plus" size={13} /> Create first listing
          </button>
        </div>
      ) : !filtered.length ? (
        <div className="v-empty-state">
          <div className="v-empty-icon">
            <Icon name="search" size={28} color="var(--graphite)" />
          </div>
          <h3>No matches</h3>
          <p>Try a different search or filter.</p>
        </div>
      ) : (
        <table className="v-tbl">
          <thead>
            <tr>
              <th style={{ width: '42%' }}>Listing</th>
              <th>Location</th>
              <th>Photos</th>
              <th>Reel</th>
              <th>Status</th>
              <th>Last edit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} onClick={() => onSelectProject(p.id)}>
                <td>
                  <div className="project-cell">
                    {p.thumbnail
                      ? <div className="v-proj-thumb" style={{ backgroundImage: `url(${p.thumbnail})` }} />
                      : <div className="v-proj-thumb v-proj-thumb--empty"><Icon name="image" size={16} color="var(--graphite)" /></div>
                    }
                    <div>
                      <div className="name">{p.address}</div>
                      <div className="sub">{p.propertyType}{p.beds ? ` · ${p.beds} bd` : ''}{p.baths ? ` · ${p.baths} ba` : ''}</div>
                    </div>
                  </div>
                </td>
                <td className="v-muted">{p.city || '—'}</td>
                <td>{p.photoCount}</td>
                <td>{p.hasVideo ? <span className="v-pill v-pill--gold">Reel</span> : <span className="v-pill v-pill--ghost">—</span>}</td>
                <td>
                  {p.status === 'ready' && <span className="v-pill v-pill--ready"><span className="dot" />Ready</span>}
                  {p.status === 'processing' && <span className="v-pill v-pill--processing"><span className="dot" />Processing</span>}
                  {p.status === 'draft' && <span className="v-pill v-pill--draft">Draft</span>}
                </td>
                <td className="v-muted">{timeAgo(p.lastEdited)}</td>
                <td><Icon name="chevron_right" size={14} color="var(--graphite)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VellumProjects;
