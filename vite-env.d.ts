/// <reference types="vite/client" />

interface ImportMetaEnv {
  // VITE_GEMINI_API_KEY removed — browser-side Gemini is purged. All
  // "Gemini-class" capability now runs server-side through Replicate
  // (REPLICATE_API_TOKEN in /api functions). No Gemini key in the client bundle.
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
