/**
 * AdminPackMatrixRoute.tsx — Pack Verification Matrix
 *
 * Admin-only visual audit surface: displays a 7 packs × 3 rooms grid so
 * team members can spot-check every style pack against every canonical
 * room type. Renders are static assets committed under
 * public/pack-verification/; regenerate locally via
 *   node tests/qa-harness/generate-pack-verification-matrix.mjs
 * See docs/pack-verification/README.md for the full workflow.
 *
 * Admin gating mirrors the pattern in components/AdminShowcase.tsx +
 * App.tsx gate (email ends with @averyandbryant.com), resolved via
 * authStorage.isAdmin(). Non-admins are redirected to /.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { isAdmin, readGoogleUser } from './authStorage';

interface MatrixCell {
  roomSlug: string;
  roomLabel: string;
  pack: string;
  packSlug: string;
  status: 'ok' | 'fail';
  file?: string;
  w?: number;
  h?: number;
  kb?: number;
  ms?: number;
  retries?: number;
  error?: string;
}

interface RoomMeta {
  slug: string;
  label: string;
  file: string;
  path: string;
}

interface PackMeta {
  name: string;
  slug: string;
  dna: string;
}

interface Manifest {
  generatedAt: string;
  model: string;
  rooms: RoomMeta[];
  packs: PackMeta[];
  cells: MatrixCell[];
  stats: { ok: number; fail: number; retries: number; total: number };
}

const MANIFEST_URL = '/pack-verification/manifest.json';
const ASSET_BASE = '/pack-verification';

const AdminPackMatrixRoute: React.FC = () => {
  const navigate = useNavigate();
  const user = useMemo(() => readGoogleUser(), []);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    if (!isAdmin(user)) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    document.title = 'Pack Matrix · Admin · StudioAI';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${MANIFEST_URL}?ts=${Date.now()}`);
        if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
        const data: Manifest = await res.json();
        if (!cancelled) setManifest(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load manifest');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!user || !isAdmin(user)) return null;

  const cellLookup = useMemo(() => {
    const map = new Map<string, MatrixCell>();
    manifest?.cells.forEach((c) => map.set(`${c.roomSlug}::${c.packSlug}`, c));
    return map;
  }, [manifest]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/" className="font-display text-lg tracking-tight">StudioAI</a>
          <nav className="flex items-center gap-4 text-xs text-zinc-400">
            <a href="/" className="hover:text-white transition">Studio</a>
            <a href="/listings" className="hover:text-white transition">Listings</a>
            <a href="/settings/brand" className="hover:text-white transition">Settings</a>
            <span className="text-white font-semibold">Pack Matrix</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full ring-1 ring-white/20" />
          <span className="hidden sm:inline text-xs text-zinc-400">{user.email}</span>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ImageIcon size={20} className="text-[#0A84FF]" />
              Pack Verification Matrix
            </h1>
            <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
              Every Style Pack rendered against three canonical rooms — living room, bedroom, kitchen. Spot-check new packs or prompt changes here.
              Renders are static assets; regenerate locally with <code className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[11px]">node tests/qa-harness/generate-pack-verification-matrix.mjs</code>.
            </p>
          </div>
          {manifest && (
            <div className="text-right text-xs text-zinc-500 space-y-0.5">
              <div>
                <span className="text-zinc-400 font-semibold">{manifest.stats.ok}/{manifest.stats.total}</span> ok
                {manifest.stats.fail > 0 && (
                  <span className="ml-2 text-[#FF375F] font-semibold">{manifest.stats.fail} fail</span>
                )}
                {manifest.stats.retries > 0 && (
                  <span className="ml-2 text-[#FF9F0A]">{manifest.stats.retries} retries</span>
                )}
              </div>
              <div>Model: {manifest.model}</div>
              <div>Generated {new Date(manifest.generatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-12 justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-[#0A84FF] border-t-transparent animate-spin" />
            Loading matrix…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-[#FF375F]/40 bg-[#FF375F]/10 px-4 py-3 text-sm text-[#FF375F] flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Could not load manifest</div>
              <div className="text-xs text-[#FF375F]/80 mt-0.5">{error}</div>
              <div className="text-xs text-zinc-400 mt-2">
                Run <code className="px-1 rounded bg-white/5">node tests/qa-harness/generate-pack-verification-matrix.mjs</code> locally, then commit <code className="px-1 rounded bg-white/5">public/pack-verification/</code>.
              </div>
            </div>
          </div>
        )}

        {manifest && !loading && (
          <>
            {/* Room header row */}
            <div className="grid gap-3" style={{ gridTemplateColumns: `160px repeat(${manifest.rooms.length}, minmax(0, 1fr))` }}>
              <div />
              {manifest.rooms.map((room) => (
                <div key={room.slug} className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                  <img
                    src={`${ASSET_BASE}/${room.path}`}
                    alt={room.label}
                    className="w-full aspect-[4/3] object-cover cursor-zoom-in"
                    onClick={() => setLightbox({ src: `${ASSET_BASE}/${room.path}`, label: `${room.label} (source)` })}
                  />
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{room.label}</span>
                    <span className="text-[10px] text-zinc-500">source</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Matrix body: one row per pack */}
            {manifest.packs.map((pack) => (
              <div
                key={pack.slug}
                className="grid gap-3 items-start"
                style={{ gridTemplateColumns: `160px repeat(${manifest.rooms.length}, minmax(0, 1fr))` }}
              >
                <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="text-sm font-semibold text-white">{pack.name}</div>
                  <div className="mt-1 text-[11px] leading-snug text-zinc-500 line-clamp-5">{pack.dna}</div>
                </div>
                {manifest.rooms.map((room) => {
                  const cell = cellLookup.get(`${room.slug}::${pack.slug}`);
                  if (!cell || cell.status !== 'ok' || !cell.file) {
                    return (
                      <div
                        key={`${room.slug}-${pack.slug}`}
                        className="rounded-xl border border-[#FF375F]/30 bg-[#FF375F]/5 aspect-[4/3] flex flex-col items-center justify-center text-center px-4"
                      >
                        <AlertCircle size={20} className="text-[#FF375F] mb-2" />
                        <div className="text-xs font-semibold text-[#FF375F]">Render failed</div>
                        <div className="mt-1 text-[10px] text-[#FF375F]/70 line-clamp-3">{cell?.error || 'missing cell'}</div>
                      </div>
                    );
                  }
                  const src = `${ASSET_BASE}/${cell.file}`;
                  return (
                    <div
                      key={`${room.slug}-${pack.slug}`}
                      className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.02] group"
                    >
                      <img
                        src={src}
                        alt={`${pack.name} — ${room.label}`}
                        className="w-full aspect-[4/3] object-cover cursor-zoom-in transition group-hover:brightness-110"
                        loading="lazy"
                        onClick={() => setLightbox({ src, label: `${pack.name} — ${room.label}` })}
                      />
                      <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{cell.w}×{cell.h} · {cell.kb}KB</span>
                        {cell.retries ? (
                          <span className="flex items-center gap-1 text-[#FF9F0A]">
                            <RefreshCw size={10} /> retry
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label={lightbox.label}
        >
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
            <img src={lightbox.src} alt={lightbox.label} className="max-w-full max-h-[85vh] rounded-xl border border-white/10" />
            <div className="text-xs text-zinc-400">{lightbox.label}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPackMatrixRoute;
