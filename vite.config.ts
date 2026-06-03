import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      hmr: {
        overlay: false,
      },
      watch: {
        ignored: ["**/api/**"],
      },
    },
    plugins: [react()],
    define: {
      // GEMINI_API_KEY is intentionally NOT inlined here. Browser-side Gemini
      // is purged — inlining the key shipped it in the bundle and charged the
      // owner. Gemini-class work now runs server-side via Replicate
      // (REPLICATE_API_TOKEN) inside /api functions, never the client.
      "process.env.GOOGLE_CLIENT_ID": JSON.stringify(env.VITE_GOOGLE_CLIENT_ID),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
