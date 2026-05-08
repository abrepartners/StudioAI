import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { readGoogleUser } from './authStorage';

const TryRoute: React.FC = () => {
  const user = useMemo(() => readGoogleUser(), []);

  useEffect(() => {
    if (user) window.location.replace('/');
  }, [user]);

  useEffect(() => {
    document.title = 'Try it free · StudioAI';
  }, []);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <Link to="/" className="font-display text-lg tracking-tight">StudioAI</Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-2xl flex items-center justify-center bg-zinc-900 border border-white/[0.08]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#0A84FF]">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500 mb-3">Coming soon</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">
            Free Try is being upgraded
          </h1>
          <p className="text-sm text-zinc-400 mb-8 max-w-sm mx-auto">
            We're rebuilding the instant demo with a faster, higher-quality generation engine. Sign in to use the full editor now.
          </p>
          <Link
            to="/vellum"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition"
          >
            Open StudioAI Editor
          </Link>
        </div>
      </main>
    </div>
  );
};

export default TryRoute;
