import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ImageUploader from '../../components/ImageUploader';
import { generateRoomDesign } from '../../services/geminiService';
import { sharpenImage } from '../../utils/sharpen';
import { getFeatureFlag } from '../config/featureFlags';
import { trackEvent } from '../lib/analytics';
import { readGoogleUser } from './authStorage';

const TRY_COUNT_KEY = 'studioai_try_count';
const TRY_LIMIT = 1;

const DEFAULT_TRY_PROMPT =
  'Virtually stage this room with clean, modern furniture while preserving all architecture, framing, and lighting exactly.';

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
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = useMemo(() => readGoogleUser(), []);
  const tryRealGeneration = useMemo(
    () => getFeatureFlag('try_real_generation', { seed: user?.email }),
    [user?.email]
  );

  useEffect(() => {
    if (user) {
      window.location.replace('/');
    }
  }, [user]);

  useEffect(() => {
    document.title = 'Try it free · StudioAI';
  }, []);

  const remaining = Math.max(0, TRY_LIMIT - tryCount);
  const gateHit = remaining === 0;

  const runTryGeneration = async () => {
    if (!uploadedImage || gateHit || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    trackEvent('try_started', { mode: tryRealGeneration ? 'real' : 'fallback' });

    try {
      if (!tryRealGeneration) {
        const preview = await sharpenImage(uploadedImage, 0.2, 1, 'jpeg');
        setGeneratedImage(preview);
      } else {
        const rawResults = await generateRoomDesign(uploadedImage, DEFAULT_TRY_PROMPT, null, false, 1, false);
        const [result] = await Promise.all(rawResults.map((img) => sharpenImage(img, 0.35, 1, 'jpeg')));
        setGeneratedImage(result || rawResults[0]);
      }

      const next = tryCount + 1;
      try {
        localStorage.setItem(TRY_COUNT_KEY, String(next));
      } catch {
        // ignore localStorage failures
      }
      setTryCount(next);
      trackEvent('try_succeeded', { mode: tryRealGeneration ? 'real' : 'fallback' });
    } catch (e: any) {
      const msg =
        e?.message === 'API_KEY_REQUIRED'
          ? 'Try mode is temporarily unavailable. Sign in to continue in the full editor.'
          : e?.message?.includes('timed out')
            ? 'Generation timed out. Try again with a tighter crop.'
            : 'Could not generate your free try. Please retry.';
      setError(msg);
      trackEvent('try_failed', { reason: e?.message || 'unknown' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <Link to="/" className="font-display text-lg tracking-tight">StudioAI</Link>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>{remaining} free {remaining === 1 ? 'try' : 'tries'} left</span>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-zinc-500 mb-3">Instant demo</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">
            Stage one room. No sign-up.
          </h1>
          <p className="text-sm text-zinc-400 mb-8">
            Upload a listing photo and run one real staged generation. After your free try, sign in to continue in StudioAI.
          </p>

          {generatedImage ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Before</p>
                  <img src={uploadedImage || ''} alt="Original room" className="rounded-xl w-full" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">After</p>
                  <img src={generatedImage} alt="Generated room" className="rounded-xl w-full" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">Free try complete.</p>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition"
                >
                  Continue with Google
                </Link>
              </div>
            </div>
          ) : gateHit ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 text-center">
              <h2 className="font-display text-xl mb-2">You've used your free stage.</h2>
              <p className="text-sm text-zinc-400 mb-5">
                Sign in with Google to keep going.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition"
              >
                Continue with Google
              </Link>
            </div>
          ) : uploadedImage ? (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-6 space-y-4">
              <img src={uploadedImage} alt="Uploaded room" className="rounded-xl w-full" />
              {error && (
                <div className="rounded-lg border border-[#FF375F]/30 bg-[#FF375F]/10 px-3 py-2 text-xs text-[#FF9AA9]">
                  {error}
                </div>
              )}
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={runTryGeneration}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Generating…' : 'Run my free stage'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedImage(null);
                    setGeneratedImage(null);
                    setError(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition"
                >
                  Upload a different photo
                </button>
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
