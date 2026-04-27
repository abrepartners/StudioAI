import React from 'react';
import { Icon } from './icons';
import type { VellumProject, VellumProfile } from './useVellumStore';

interface DashboardProps {
  setPage: (p: string) => void;
  credits: number;
  projects: VellumProject[];
  profile: VellumProfile;
  onNewListing: () => void;
  onSelectProject: (id: string) => void;
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

const VellumDashboard: React.FC<DashboardProps> = ({ setPage, credits, projects, profile, onNewListing, onSelectProject }) => {
  const firstName = profile.name ? profile.name.split(' ')[0] : '';
  const totalPhotos = projects.reduce((s, p) => s + p.refinedCount, 0);
  const totalReels = projects.filter(p => p.hasVideo).length;
  const recent = projects.slice(0, 4);

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Dashboard</div>
          <h1 className="v-page-title">
            {firstName ? <>Welcome back, <em>{firstName}.</em></> : <>Your <em>workspace.</em></>}
          </h1>
          <p className="v-page-sub">
            {projects.length
              ? `${projects.length} listing${projects.length !== 1 ? 's' : ''} · ${credits} of 200 credits remaining this month.`
              : 'Create your first listing to get started.'}
          </p>
        </div>
        <div className="v-row gap-sm">
          <button className="v-btn v-btn--secondary" onClick={() => setPage('projects')}>Browse all projects</button>
          <button className="v-btn v-btn--primary" onClick={onNewListing}>New listing <Icon name="arrow_right" size={13} /></button>
        </div>
      </div>

      <div className="v-kpi-row">
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Listings</div>
          <div className="value">{projects.length}</div>
          <div className="delta">{projects.filter(p => p.status === 'ready').length} ready · {projects.filter(p => p.status === 'draft').length} draft</div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Photos refined</div>
          <div className="value">{totalPhotos}</div>
          <div className="delta">{projects.length ? `Avg. ${Math.round(totalPhotos / projects.length)} per listing` : 'No photos yet'}</div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Reels created</div>
          <div className="value">{totalReels}</div>
          <div className="delta">{totalReels ? 'Across MLS, IG, FB' : 'Create your first reel'}</div>
        </div>
      </div>

      {!projects.length ? (
        <div className="v-empty-state">
          <div className="v-empty-icon">
            <Icon name="image" size={28} color="var(--pale-gold)" />
          </div>
          <h3>No listings yet</h3>
          <p>Create your first listing to start refining photos, building reels, and exporting for MLS.</p>
          <button className="v-btn v-btn--primary" onClick={onNewListing}>
            <Icon name="plus" size={13} /> Create first listing
          </button>
        </div>
      ) : (
        <>
          <div className="v-section-head">
            <div>
              <div className="eyebrow">Recent listings</div>
              <h2 className="title">In progress</h2>
            </div>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => setPage('projects')}>View all <Icon name="arrow_right" size={12} /></button>
          </div>

          <table className="v-tbl">
            <thead>
              <tr>
                <th style={{ width: '46%' }}>Listing</th>
                <th>Photos</th>
                <th>Reel</th>
                <th>Status</th>
                <th>Last edit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map(p => (
                <tr key={p.id} onClick={() => onSelectProject(p.id)}>
                  <td>
                    <div className="project-cell">
                      {p.thumbnail
                        ? <div className="v-proj-thumb" style={{ backgroundImage: `url(${p.thumbnail})` }} />
                        : <div className="v-proj-thumb v-proj-thumb--empty"><Icon name="image" size={16} color="var(--graphite)" /></div>
                      }
                      <div>
                        <div className="name">{p.address}</div>
                        <div className="sub">{p.propertyType}{p.beds ? ` · ${p.beds} bd` : ''}{p.baths ? ` · ${p.baths} ba` : ''}{p.city ? ` · ${p.city}` : ''}</div>
                      </div>
                    </div>
                  </td>
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
        </>
      )}

      <div className="v-split-2 v-mt-lg">
        <div className="v-kpi" style={{ padding: 28 }}>
          <div className="v-gold-rule" />
          <div className="label">Quick actions</div>
          <div className="v-row gap-sm" style={{ flexWrap: 'wrap', marginTop: 16 }}>
            <button className="v-btn v-btn--primary v-btn--sm" onClick={onNewListing}><Icon name="image" size={13} /> New listing</button>
            <button className="v-btn v-btn--primary v-btn--sm" onClick={() => setPage('video')}><Icon name="play" size={13} /> Create listing reel</button>
          </div>
          <div className="v-row gap-sm" style={{ flexWrap: 'wrap', marginTop: 12 }}>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => setPage('photo')}><Icon name="armchair" size={13} /> Stage room</button>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => setPage('photo')}><Icon name="sun" size={13} /> Sky replace</button>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => setPage('photo')}><Icon name="moon" size={13} /> Twilight</button>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={() => setPage('photo')}><Icon name="sparkles" size={13} /> Declutter</button>
          </div>
        </div>
        <div className="v-kpi" style={{ padding: 28 }}>
          <div className="v-gold-rule" />
          <div className="label">Plan</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 500 }}>Studio</div>
            <div className="v-muted" style={{ fontSize: 13 }}>· $89/mo</div>
          </div>
          <div className="v-muted" style={{ fontSize: 13, marginTop: 4 }}>{credits} of 200 credits remaining</div>
          <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, marginTop: 14, overflow: 'hidden' }}>
            <div style={{ width: `${(credits / 200) * 100}%`, height: '100%', background: 'var(--deep-charcoal)' }} />
          </div>
          <button className="v-btn v-btn--secondary v-btn--sm" style={{ marginTop: 18 }} onClick={() => setPage('billing')}>Manage plan</button>
        </div>
      </div>
    </div>
  );
};

export default VellumDashboard;
