/**
 * TryRoute.tsx — R25
 *
 * Unauth demo surface (Fork #3 Option D):
 *   - 1 free staging generation before the Google sign-in gate.
 *   - Local-only rate limit (localStorage counter), re-verified server-side
 *     when Phase 2 credit-enforcement lands.
 *
 * Intentionally thin. A full implementation will share the Design Studio
 * right-panel components — for now we render an uploader + CTA so the
 * `/try` URL works today and is linkable from /pricing / /features.
 */

import React, { useEffect, useState } from 'react';
import ImageUploader from '../../components/ImageUploader';
import { readGoogleUser } from './authStorage';

const TRY_COUNT_KEY = 'studioai_try_count';
const TRY_LIMIT = 1;

function readTryCount(): number {
  try {
    const n = parseInt(localStorage.getItem(TRY_COUNT_KEY) || '0', 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

const TryRoute: React.FC = () => {
  const [tryCount, setTryCount] = useState<number>(() => readTryCount());
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Already signed in? Send them to the real editor.
  useEffect(() => {
    const user = readGoogleUser();
    if (user) {
      window.location.replace('/');
    }
  }, []);

  useEffect(() => {
    document.title = 'Try it free · StudioAI';
  }, []);

  const remaining = Math.max(0, TRY_LIMIT - tryCount);
  const gateHit = remaining === 0;

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <a href="/" className="font-display text-lg tracking-tight">StudioAI</a>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>{remaining} free {remaining === 1 ? 'try' : 'tries'} left</span>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition"
          >
            Sign in
          </a>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="w-full max-w-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-zinc-500 mb-3">Instant demo</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">
            Stage one room. No sign-up.
          </h1>
          <p className="text-sm text-zinc-400 mb-8">
            Drop a listing photo below. You'll get one fully-staged result — then sign in
            with Google to stage the rest of the listing.
          </p>

          {gateHit ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 text-center">
              <h2 className="font-display text-xl mb-2">You've used your free stage.</h2>
              <p className="text-sm text-zinc-400 mb-5">
                Sign in with Google to keep going — free tier covers 3 more rooms.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition"
              >
                Continue with Google
              </a>
            </div>
          ) : uploadedImage ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6">
              <p className="text-sm text-zinc-300 mb-4">Photo received. Generating preview…</p>
              <img src={uploadedImage} alt="Uploaded room" className="rounded-xl w-full" />
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => {
                    const next = tryCount + 1;
                    try { localStorage.setItem(TRY_COUNT_KEY, String(next)); } catch {}
                    setTryCount(next);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition"
                >
                  Use my free stage
                </button>
                <a href="/" className="text-xs text-zinc-400 hover:text-white transition">
                  Sign in for more →
                </a>
              </div>
            </div>
          ) : (
            <ImageUploader onImageUpload={(dataUrl) => setUploadedImage(dataUrl)} />
          )}
        </div>
      </main>
    </div>
  );
};

export default TryRoute;
