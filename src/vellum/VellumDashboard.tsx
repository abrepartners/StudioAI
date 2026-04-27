import React from 'react';
import { Icon } from './icons';

const PROJECTS = [
  { id: 'p1', name: '1247 Maple Ridge Drive', sub: 'Single family · 4 bd · 3 ba', addr: 'Highland Park, IL', photos: 24, video: true, status: 'ready', edited: '2h ago', thumb: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400' },
  { id: 'p2', name: '88 Lakeshore Terrace, Unit 12B', sub: 'Condo · 2 bd · 2 ba', addr: 'Chicago, IL', photos: 18, video: false, status: 'processing', edited: '15m ago', thumb: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400' },
  { id: 'p3', name: '34 Willow Bend Court', sub: 'Townhome · 3 bd · 2.5 ba', addr: 'Evanston, IL', photos: 31, video: true, status: 'ready', edited: 'Yesterday', thumb: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400' },
  { id: 'p4', name: '512 Oak Street', sub: 'Bungalow · 2 bd · 1 ba', addr: 'Oak Park, IL', photos: 12, video: false, status: 'draft', edited: 'Apr 22', thumb: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400' },
];

export { PROJECTS };

interface DashboardProps {
  setPage: (p: string) => void;
  credits: number;
}

const VellumDashboard: React.FC<DashboardProps> = ({ setPage, credits }) => {
  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Dashboard</div>
          <h1 className="v-page-title">Good afternoon, <em>Maya.</em></h1>
          <p className="v-page-sub">3 listings are processing · 1 ready for review · You've used {credits} of 200 credits this month.</p>
        </div>
        <div className="v-row gap-sm">
          <button className="v-btn v-btn--secondary" onClick={() => setPage('projects')}>Browse all projects</button>
          <button className="v-btn v-btn--primary" onClick={() => setPage('photo')}>New listing <Icon name="arrow_right" size={13} /></button>
        </div>
      </div>

      <div className="v-kpi-row">
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Listings this month</div>
          <div className="value">14</div>
          <div className="delta">+3 vs. April</div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Photos refined</div>
          <div className="value">312</div>
          <div className="delta">Avg. 22 per listing</div>
        </div>
        <div className="v-kpi">
          <div className="v-gold-rule" />
          <div className="label">Reels exported</div>
          <div className="value">9</div>
          <div className="delta">Across MLS, IG, FB</div>
        </div>
      </div>

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
          {PROJECTS.map(p => (
            <tr key={p.id} onClick={() => setPage('photo')}>
              <td>
                <div className="project-cell">
                  <div className="v-proj-thumb" style={{ backgroundImage: `url(${p.thumb})` }} />
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sub">{p.sub} · {p.addr}</div>
                  </div>
                </div>
              </td>
              <td>{p.photos}</td>
              <td>{p.video ? <span className="v-pill v-pill--gold">Reel</span> : <span className="v-pill v-pill--ghost">—</span>}</td>
              <td>
                {p.status === 'ready' && <span className="v-pill v-pill--ready"><span className="dot" />Ready</span>}
                {p.status === 'processing' && <span className="v-pill v-pill--processing"><span className="dot" />Processing</span>}
                {p.status === 'draft' && <span className="v-pill v-pill--draft">Draft</span>}
              </td>
              <td className="v-muted">{p.edited}</td>
              <td><Icon name="chevron_right" size={14} color="var(--graphite)" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="v-split-2 v-mt-lg">
        <div className="v-kpi" style={{ padding: 28 }}>
          <div className="v-gold-rule" />
          <div className="label">Quick actions</div>
          <div className="v-row gap-sm" style={{ flexWrap: 'wrap', marginTop: 16 }}>
            <button className="v-btn v-btn--primary v-btn--sm" onClick={() => setPage('photo')}><Icon name="image" size={13} /> Create photo project</button>
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
          <div className="v-muted" style={{ fontSize: 13, marginTop: 4 }}>{200 - credits} of 200 credits remaining · renews May 12</div>
          <div style={{ height: 4, background: 'var(--soft-stone)', borderRadius: 2, marginTop: 14, overflow: 'hidden' }}>
            <div style={{ width: `${((200 - credits) / 200) * 100}%`, height: '100%', background: 'var(--deep-charcoal)' }} />
          </div>
          <button className="v-btn v-btn--secondary v-btn--sm" style={{ marginTop: 18 }} onClick={() => setPage('billing')}>Manage plan</button>
        </div>
      </div>
    </div>
  );
};

export default VellumDashboard;
