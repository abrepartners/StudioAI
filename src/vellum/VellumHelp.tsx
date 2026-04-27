import React, { useState } from 'react';
import { Icon } from './icons';

interface HelpProps {
  setPage: (p: string) => void;
}

const FAQ = [
  { cat: 'Credits & billing', items: [
    { id: 'credits-1', q: 'What counts as one credit?', a: 'One credit = one finished photo with any single Refine or Atmosphere tool applied. Reels charge per scene rendered. Stacking tools on the same photo (e.g. declutter + sky replace) costs the higher of the two, not both.' },
    { id: 'credits-2', q: 'Do credits roll over?', a: 'Yes — Studio and Brokerage plans roll over up to 2× your monthly allowance. Pay-as-you-go credit packs never expire.' },
    { id: 'credits-3', q: 'Why was I asked to refill mid-export?', a: "We check your balance before kicking off a render. If a job would dip you below zero, we route you to the refill modal so the export can finish — your queue is never silently truncated." },
  ]},
  { cat: 'Photo editor', items: [
    { id: 'photo-1', q: 'Can I stage a room without furniture in it?', a: 'Yes. Empty-room staging is the default flow for Virtual staging. Pick a style preset, scope to "Selected room category", and we generate two stage options per photo.' },
    { id: 'photo-2', q: 'How do I undo an applied tool?', a: 'Every applied tool shows in the right-rail Activity feed with an Undo affordance for 24 hours. After that, you can re-import the original and re-apply different settings — original photos are kept for 90 days.' },
    { id: 'photo-3', q: 'What does "MLS-ready" mean for the export?', a: 'JPG, sRGB, 1920×1280 max edge, < 5 MB per file, with metadata stripped to comply with most regional MLS rules. We support Bright, Stellar, MRED, and CRMLS uploads natively.' },
  ]},
  { cat: 'Video reels', items: [
    { id: 'video-1', q: 'Can I bring my own music?', a: 'Yes — drop an MP3 or pick from the licensed library. Uploaded tracks are checked against rights flags before publishing to social destinations.' },
    { id: 'video-2', q: 'Why is my reel longer than 30 seconds?', a: 'Reel duration is the sum of scene lengths. Drag a scene shorter on the storyboard, or use Auto-trim in the right rail to fit a target length without cutting scenes.' },
  ]},
  { cat: 'Imports & integrations', items: [
    { id: 'import-1', q: 'How does MLS import work?', a: 'Connect your MLS in Settings → Integrations. Paste an MLS# and we pull the listing photos, address, beds/baths, and price into a new project. Re-imports overwrite only the photos, never your edits.' },
    { id: 'import-2', q: 'Does Dropbox import keep folder structure?', a: 'Yes — folders become rooms. A folder named "Kitchen" auto-tags those photos as kitchen for room-aware staging.' },
  ]},
];

const VellumHelp: React.FC<HelpProps> = ({ setPage }) => {
  const [openId, setOpenId] = useState('credits-1');
  const [q, setQ] = useState('');

  const filtered = q
    ? FAQ.map(s => ({ ...s, items: s.items.filter(i => (i.q + i.a).toLowerCase().includes(q.toLowerCase())) })).filter(s => s.items.length)
    : FAQ;

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Help center</div>
          <h1 className="v-page-title">How can we <em>help?</em></h1>
          <p className="v-page-sub">Answers to the questions agents ask most. Can't find it? Real humans, weekdays 8a–6p Central.</p>
        </div>
      </div>

      <div className="v-help-search">
        <Icon name="search" size={14} />
        <input placeholder="Search 84 articles" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="v-split-2" style={{ marginTop: 32, alignItems: 'start' }}>
        <div>
          {filtered.map(section => (
            <div key={section.cat} className="v-faq-section">
              <div className="eyebrow" style={{ paddingLeft: 0 }}>{section.cat}</div>
              {section.items.map(it => {
                const isOpen = openId === it.id;
                return (
                  <div key={it.id} className={'v-faq-row' + (isOpen ? ' open' : '')}>
                    <button className="v-faq-q" onClick={() => setOpenId(isOpen ? '' : it.id)}>
                      <span>{it.q}</span>
                      <Icon name={isOpen ? 'chevron_up' : 'chevron_down'} size={14} />
                    </button>
                    {isOpen && <div className="v-faq-a">{it.a}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 88 }}>
          <div className="v-settings-card">
            <div className="v-gold-rule" />
            <h3>Talk to a human</h3>
            <p className="v-muted" style={{ fontSize: 13, marginBottom: 18 }}>Average response time today: <strong>4 minutes</strong>.</p>
            <button className="v-btn v-btn--primary v-btn--sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="sparkles" size={13} /> Start a chat
            </button>
            <button className="v-btn v-btn--secondary v-btn--sm" style={{ width: '100%', justifyContent: 'center' }}>
              <Icon name="folder" size={13} /> Email support
            </button>
            <div className="v-muted" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.6 }}>
              Studio & Brokerage plans get same-day priority. Founders plan: dedicated success manager.
            </div>
          </div>

          <div className="v-settings-card">
            <div className="v-gold-rule" />
            <h3>Quick links</h3>
            <ul className="v-quick-links">
              <li onClick={() => setPage('billing')}>Manage plan & credits →</li>
              <li onClick={() => setPage('settings')}>Set up watermark →</li>
              <li>Connect your MLS →</li>
              <li>Brand guidelines for end cards →</li>
              <li>What's new in Vellum (changelog) →</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VellumHelp;
