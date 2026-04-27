import React, { useState } from 'react';
import { Icon } from './icons';

const PROJECTS = [
  { id: 'p1', name: '1247 Maple Ridge Drive', sub: 'Single family · 4 bd · 3 ba', addr: 'Highland Park, IL', photos: 24, video: true, status: 'ready', edited: '2h ago', thumb: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400' },
  { id: 'p2', name: '88 Lakeshore Terrace, Unit 12B', sub: 'Condo · 2 bd · 2 ba', addr: 'Chicago, IL', photos: 18, video: false, status: 'processing', edited: '15m ago', thumb: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400' },
  { id: 'p3', name: '34 Willow Bend Court', sub: 'Townhome · 3 bd · 2.5 ba', addr: 'Evanston, IL', photos: 31, video: true, status: 'ready', edited: 'Yesterday', thumb: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400' },
  { id: 'p4', name: '512 Oak Street', sub: 'Bungalow · 2 bd · 1 ba', addr: 'Oak Park, IL', photos: 12, video: false, status: 'draft', edited: 'Apr 22', thumb: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400' },
  { id: 'p5', name: 'The Knoll Estate', sub: 'Estate · 6 bd · 5 ba', addr: 'Lake Forest, IL', photos: 47, video: true, status: 'ready', edited: 'Apr 18', thumb: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400' },
  { id: 'p6', name: '9 Birch Lane', sub: 'Cottage · 3 bd · 2 ba', addr: 'Winnetka, IL', photos: 16, video: false, status: 'ready', edited: 'Apr 15', thumb: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=400' },
];

interface ProjectsProps {
  setPage: (p: string) => void;
}

const VellumProjects: React.FC<ProjectsProps> = ({ setPage }) => {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? PROJECTS : PROJECTS.filter(p => p.status === filter);

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Projects</div>
          <h1 className="v-page-title">Every <em>listing</em>, in one place.</h1>
        </div>
        <button className="v-btn v-btn--primary" onClick={() => setPage('photo')}>New listing <Icon name="arrow_right" size={13} /></button>
      </div>

      <div className="v-filter-bar">
        <div className="v-search-input">
          <Icon name="search" />
          <input placeholder="Search by address, MLS#, or tag" />
        </div>
        <div className="v-filter-chips">
          <button className={'v-filter-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All ({PROJECTS.length})</button>
          <button className={'v-filter-chip' + (filter === 'ready' ? ' active' : '')} onClick={() => setFilter('ready')}>Ready</button>
          <button className={'v-filter-chip' + (filter === 'processing' ? ' active' : '')} onClick={() => setFilter('processing')}>Processing</button>
          <button className={'v-filter-chip' + (filter === 'draft' ? ' active' : '')} onClick={() => setFilter('draft')}>Drafts</button>
        </div>
      </div>

      <table className="v-tbl">
        <thead>
          <tr>
            <th style={{ width: '42%' }}>Listing</th>
            <th>Address</th>
            <th>Photos</th>
            <th>Reel</th>
            <th>Status</th>
            <th>Last edit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} onClick={() => setPage('photo')}>
              <td>
                <div className="project-cell">
                  <div className="v-proj-thumb" style={{ backgroundImage: `url(${p.thumb})` }} />
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sub">{p.sub}</div>
                  </div>
                </div>
              </td>
              <td className="v-muted">{p.addr}</td>
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
    </div>
  );
};

export default VellumProjects;
