import React from "react";
import { Link } from "react-router-dom";

/**
 * Shared shell for Vellum's legal pages (Privacy, Terms). Dark editorial
 * layout: Vellum wordmark header linking home, gold section headings, readable
 * prose. Kept dependency-free so it renders instantly at /privacy and /terms
 * (the URLs Google's OAuth consent screen points to).
 */
export const LegalPage: React.FC<{
  title: string;
  updated: string;
  children: React.ReactNode;
}> = ({ title, updated, children }) => {
  React.useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Vellum`;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#c9c6bf]">
      <header className="border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl tracking-tight text-[#d8c79a]"
            style={{
              fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
            }}
          >
            Vellum
          </Link>
          <Link
            to="/"
            className="text-xs text-[#8a857c] hover:text-[#c9c6bf] transition-colors"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <h1
          className="text-4xl sm:text-5xl text-[#f7f6f2] mb-2"
          style={{
            fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
          }}
        >
          {title}
        </h1>
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a857c] mb-10">
          Last updated {updated}
        </p>
        <div className="legal-prose space-y-6 text-[15px] leading-relaxed">
          {children}
        </div>
        <p className="mt-14 pt-6 border-t border-white/[0.06] text-sm text-[#8a857c]">
          Questions? Email{" "}
          <a
            href="mailto:book@averyandbryant.com"
            className="text-[#d8c79a] hover:underline"
          >
            book@averyandbryant.com
          </a>
          .
        </p>
      </main>
    </div>
  );
};

export const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-lg font-semibold text-[#f7f6f2] pt-4">{children}</h2>
);

export default LegalPage;
