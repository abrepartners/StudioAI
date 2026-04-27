import React, { useState, useRef } from 'react';
import { Icon } from './icons';
import type { VellumProfile } from './useVellumStore';

interface SettingsProps {
  setPage: (p: string) => void;
  profile: VellumProfile;
  updateProfile: (partial: Partial<VellumProfile>) => void;
}

const VellumSettings: React.FC<SettingsProps> = ({ setPage, profile, updateProfile }) => {
  const [tab, setTab] = useState('workspace');
  const [logo, setLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [wm, setWm] = useState({ on: true, position: 'br', opacity: 0.65, color: 'ivory' });
  const [defaults, setDefaults] = useState({
    style: 'contemporary', aesthetic: 'editorial', quality: 'print',
    autoTwilight: true, autoSky: false,
    aspect: '9_16', captions: true, music: true,
    brand: profile.brokerage || '',
  });

  return (
    <div className="v-main">
      <div className="v-page-head">
        <div>
          <div className="v-page-eyebrow">Account</div>
          <h1 className="v-page-title">Settings & <em>branding.</em></h1>
          <p className="v-page-sub">Set defaults so every project starts the way you'd finish it. Branding flows into watermarks, end cards, and exported social copy.</p>
        </div>
      </div>

      <div className="v-seg" style={{ width: 'fit-content', marginBottom: 28 }}>
        <button className={'v-seg-btn' + (tab === 'workspace' ? ' on' : '')} onClick={() => setTab('workspace')}>Workspace</button>
        <button className={'v-seg-btn' + (tab === 'profile' ? ' on' : '')} onClick={() => setTab('profile')}>Profile</button>
        <button className={'v-seg-btn' + (tab === 'branding' ? ' on' : '')} onClick={() => setTab('branding')}>Branding</button>
        <button className={'v-seg-btn' + (tab === 'exports' ? ' on' : '')} onClick={() => setTab('exports')}>Export defaults</button>
      </div>

      {tab === 'workspace' && (
        <div className="v-split-2">
          <div className="v-settings-card">
            <div className="v-gold-rule" />
            <h3>Photo defaults</h3>
            <p className="v-muted" style={{ fontSize: 13, marginBottom: 20 }}>Applied automatically to every new photo project.</p>
            <div className="v-set-row">
              <span>Default style preset</span>
              <select value={defaults.style} onChange={(e) => setDefaults({ ...defaults, style: e.target.value })}>
                <option value="contemporary">Contemporary</option>
                <option value="midcentury">Mid-century</option>
                <option value="coastal">Coastal</option>
                <option value="farmhouse">Farmhouse</option>
              </select>
            </div>
            <div className="v-set-row">
              <span>Aesthetic preset</span>
              <select value={defaults.aesthetic} onChange={(e) => setDefaults({ ...defaults, aesthetic: e.target.value })}>
                <option value="editorial">Warm editorial</option>
                <option value="airy">Bright & airy</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            <div className="v-set-row">
              <span>Output quality</span>
              <div className="v-seg" style={{ width: 'auto' }}>
                <button className={'v-seg-btn' + (defaults.quality === 'print' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, quality: 'print' })}>Print</button>
                <button className={'v-seg-btn' + (defaults.quality === '4k' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, quality: '4k' })}>4K</button>
                <button className={'v-seg-btn' + (defaults.quality === 'web' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, quality: 'web' })}>Web</button>
              </div>
            </div>
            <div className="v-check-row" onClick={() => setDefaults({ ...defaults, autoTwilight: !defaults.autoTwilight })}>
              <span>Auto-suggest twilight on exteriors</span>
              <button className={'v-switch' + (defaults.autoTwilight ? ' on' : '')}><span /></button>
            </div>
            <div className="v-check-row" onClick={() => setDefaults({ ...defaults, autoSky: !defaults.autoSky })}>
              <span>Auto-replace overcast skies</span>
              <button className={'v-switch' + (defaults.autoSky ? ' on' : '')}><span /></button>
            </div>
          </div>

          <div className="v-settings-card">
            <div className="v-gold-rule" />
            <h3>Reel defaults</h3>
            <p className="v-muted" style={{ fontSize: 13, marginBottom: 20 }}>Pre-set for the format you publish most.</p>
            <div className="v-set-row">
              <span>Default aspect</span>
              <div className="v-seg" style={{ width: 'auto' }}>
                <button className={'v-seg-btn' + (defaults.aspect === '9_16' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, aspect: '9_16' })}>9:16</button>
                <button className={'v-seg-btn' + (defaults.aspect === '1_1' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, aspect: '1_1' })}>1:1</button>
                <button className={'v-seg-btn' + (defaults.aspect === '16_9' ? ' on' : '')} onClick={() => setDefaults({ ...defaults, aspect: '16_9' })}>16:9</button>
              </div>
            </div>
            <div className="v-check-row" onClick={() => setDefaults({ ...defaults, captions: !defaults.captions })}>
              <span>Burn-in captions by default</span>
              <button className={'v-switch' + (defaults.captions ? ' on' : '')}><span /></button>
            </div>
            <div className="v-check-row" onClick={() => setDefaults({ ...defaults, music: !defaults.music })}>
              <span>Auto-pick music to scene tone</span>
              <button className={'v-switch' + (defaults.music ? ' on' : '')}><span /></button>
            </div>
            <div className="v-set-row">
              <span>End card brand line</span>
              <input className="v-set-input" value={defaults.brand} onChange={(e) => setDefaults({ ...defaults, brand: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="v-settings-card" style={{ maxWidth: 560 }}>
          <div className="v-gold-rule" />
          <h3>Your profile</h3>
          <p className="v-muted" style={{ fontSize: 13, marginBottom: 20 }}>This information appears in exports, end cards, and team views.</p>
          <div className="v-set-row">
            <span>Full name</span>
            <input
              className="v-set-input"
              value={profile.name}
              onChange={e => updateProfile({ name: e.target.value })}
              placeholder="Your name"
            />
          </div>
          <div className="v-set-row">
            <span>Email</span>
            <input
              className="v-set-input"
              value={profile.email}
              onChange={e => updateProfile({ email: e.target.value })}
              placeholder="you@company.com"
            />
          </div>
          <div className="v-set-row">
            <span>Brokerage / company</span>
            <input
              className="v-set-input"
              value={profile.brokerage}
              onChange={e => updateProfile({ brokerage: e.target.value })}
              placeholder="Your brokerage name"
            />
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="v-settings-card">
            <div className="v-gold-rule" />
            <h3>Brand logo</h3>
            <p className="v-muted" style={{ fontSize: 13, marginBottom: 16 }}>Used in watermarks, end cards, and social exports. PNG or SVG with transparency recommended.</p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = (ev) => setLogo(ev.target?.result as string);
                reader.readAsDataURL(f);
              }}
            />
            <div
              className={'v-logo-drop' + (logo ? ' has-logo' : '')}
              onClick={() => logoInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = (ev) => setLogo(ev.target?.result as string);
                reader.readAsDataURL(f);
              }}
            >
              {logo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
                  <img src={logo} alt="Brand logo" className="v-logo-preview-img" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Logo uploaded</div>
                    <div className="v-muted" style={{ fontSize: 11 }}>Will appear in watermarks, end cards, and exports</div>
                  </div>
                  <button className="v-btn v-btn--ghost v-btn--sm" onClick={(e) => { e.stopPropagation(); setLogo(null); }}>Remove</button>
                </div>
              ) : (
                <div className="v-logo-placeholder">
                  <div className="v-logo-icon"><Icon name="image" size={22} /></div>
                  <div className="v-logo-cta">Drop your logo here</div>
                  <div className="v-logo-sub">or click to browse · PNG · SVG · JPG</div>
                </div>
              )}
            </div>
          </div>

          <div className="v-split-2">
            <div className="v-settings-card">
              <div className="v-gold-rule" />
              <h3>Watermark</h3>
              <p className="v-muted" style={{ fontSize: 13, marginBottom: 20 }}>Subtle by default — most agents disable for MLS exports and keep on for social.</p>
              <div className="v-check-row" onClick={() => setWm({ ...wm, on: !wm.on })}>
                <span>Apply watermark to social exports</span>
                <button className={'v-switch' + (wm.on ? ' on' : '')}><span /></button>
              </div>
              <div className="v-set-row">
                <span>Position</span>
                <div className="v-wm-pos">
                  {([['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']] as const).map(([id, g]) => (
                    <button key={id} className={'v-wm-pos-btn' + (wm.position === id ? ' on' : '')} onClick={() => setWm({ ...wm, position: id })}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="v-set-row">
                <span>Opacity</span>
                <input type="range" min="0.2" max="1" step="0.05" value={wm.opacity} onChange={(e) => setWm({ ...wm, opacity: +e.target.value })} style={{ flex: 1 }} />
                <span style={{ minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(wm.opacity * 100)}%</span>
              </div>
              <div className="v-set-row">
                <span>Color</span>
                <div className="v-seg" style={{ width: 'auto' }}>
                  <button className={'v-seg-btn' + (wm.color === 'ivory' ? ' on' : '')} onClick={() => setWm({ ...wm, color: 'ivory' })}>Ivory</button>
                  <button className={'v-seg-btn' + (wm.color === 'gold' ? ' on' : '')} onClick={() => setWm({ ...wm, color: 'gold' })}>Gold</button>
                  <button className={'v-seg-btn' + (wm.color === 'charcoal' ? ' on' : '')} onClick={() => setWm({ ...wm, color: 'charcoal' })}>Charcoal</button>
                </div>
              </div>
            </div>

            <div className="v-settings-card">
              <div className="v-gold-rule" />
              <h3>Watermark preview</h3>
              <div className="v-wm-preview">
                <div style={{ width: '100%', height: '100%', background: 'var(--soft-stone)', display: 'grid', placeItems: 'center', color: 'var(--graphite)', fontSize: 12 }}>
                  Upload a photo to preview watermark
                </div>
                {wm.on && (
                  <div
                    className={`v-wm-mark v-wm-${wm.position} v-wm-color-${wm.color}`}
                    style={{ opacity: wm.opacity }}
                  >
                    <span className="v-wm-rule" /><span className="v-wm-text">VELLUM</span><span className="v-wm-rule" />
                    <span className="v-wm-sub">{profile.name || 'Your name'} · {profile.brokerage || 'Your brokerage'}</span>
                  </div>
                )}
              </div>
              <div className="v-muted" style={{ fontSize: 12, marginTop: 12 }}>
                Watermarks never appear on MLS exports. Print 4K downloads use the gold variant unless overridden.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'exports' && (
        <div className="v-settings-card" style={{ maxWidth: 720 }}>
          <div className="v-gold-rule" />
          <h3>Default export destinations</h3>
          <p className="v-muted" style={{ fontSize: 13, marginBottom: 20 }}>Each project will pre-tick the destinations below. You can change per export.</p>
          {[
            { id: 'mls', name: 'MLS upload', sub: 'JPG · sRGB · 1920×1280', on: false, badge: 'Connect →' },
            { id: 'dropbox', name: 'Dropbox', sub: '/Listings/{address}', on: false, badge: 'Connect →' },
            { id: 'drive', name: 'Google Drive', sub: 'Shared with brokerage', on: false, badge: 'Connect →' },
            { id: 'social', name: 'Social pack (IG · FB · TikTok)', sub: 'Auto-resized for each platform', on: true, badge: '' },
            { id: 'zip', name: 'Direct download', sub: '.zip · grouped by room', on: true, badge: '' },
          ].map(d => (
            <div key={d.id} className="v-dest-row">
              <div className="v-dest-meta">
                <div className="v-dest-name">{d.name}</div>
                <div className="v-muted" style={{ fontSize: 12 }}>{d.sub}</div>
              </div>
              {d.badge && <span className={'v-pill ' + (d.badge.startsWith('Connected') ? 'v-pill--ready' : 'v-pill--ghost')}>{d.badge}</span>}
              <button className={'v-switch' + (d.on ? ' on' : '')}><span /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VellumSettings;
