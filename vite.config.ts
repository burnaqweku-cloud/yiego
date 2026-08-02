import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const BUILD_VERSION = String(Date.now());

// Writes dist/version.json at the end of every production build.
// The runtime polls this file to detect new deployments and auto-reload.
function writeVersionFile() {
  return {
    name: "yiego-write-version-json",
    apply: "build" as const,
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      try {
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
          path.join(outDir, "version.json"),
          JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() }),
        );
      } catch (err) {
        console.warn("[version.json] write failed:", err);
      }
    },
  };
}

// Public client credentials (safe to ship in the browser bundle; RLS protects data).
// These act as fallbacks so production builds work even when no .env is present.
const PUBLIC_SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://nhxgebulvqhtiiotetoo.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_tAbh99C5tny6sMAiu6ZYrg_BWjkRIAX";
const PUBLIC_SUPABASE_PROJECT_ID =
  process.env.VITE_SUPABASE_PROJECT_ID || "nhxgebulvqhtiiotetoo";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(PUBLIC_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(PUBLIC_SUPABASE_PROJECT_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // We register manually in main.tsx for update control
      workbox: {
        // Force new SW to activate immediately — no stale UI
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Precache hashed build assets ONLY — NEVER precache HTML (keeps app shell fresh on every visit)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        globPatterns: ["**/*.{js,css,ico,svg,woff2,woff,ttf}"],
        // Exclude large PNGs from precache — they'll be cached at runtime instead
        globIgnores: [
          "**/datasika-icon*.png",
          "**/OneSignalSDKWorker.js",
          "**/OneSignalSDKUpdaterWorker.js",
          "**/index.html",
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/api/,
          /^\/auth/,
          /^\/rest/,
          /^\/functions/,
          /^\/supabase/,
          /^\/OneSignalSDK/,
          /^\/~oauth/,
          /^\/version\.json/,
        ],
        runtimeCaching: [
          {
            // HTML navigations: NetworkFirst so new deploys appear on next nav (no stale shell)
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-navigations",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: false, // We use our own public/manifest.json
    }),
    writeVersionFile(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
