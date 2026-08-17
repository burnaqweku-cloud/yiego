import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { PUBLIC_ROUTES, SITE_ORIGIN } from "./src/lib/site";

const BUILD_VERSION = String(Date.now());

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Give every indexable route its own HTML file (dist/shop/index.html, …).
 *
 * The app is client-rendered, so without this every URL served the same shell:
 * Google runs the JS and recovers, but WhatsApp and Facebook do not, so every
 * shared link previewed as the homepage. Static hosts serve an exact file
 * match before the SPA fallback, so these files reach scrapers while humans
 * still land in the normal single-page app — the markup is byte-identical to
 * index.html apart from the head. */
function writeRouteHtml(outDir: string) {
  const shell = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  for (const route of PUBLIC_ROUTES) {
    const url = SITE_ORIGIN + route.path;
    const title = escapeHtml(route.title);
    const description = escapeHtml(route.description);
    const html = shell
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
      .replace("</head>", `    <link rel="canonical" href="${url}" />\n  </head>`);

    if (route.path === "/") {
      fs.writeFileSync(path.join(outDir, "index.html"), html);
      continue;
    }
    const dir = path.join(outDir, route.path.replace(/^\//, ""));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
  console.log(`[seo] wrote ${PUBLIC_ROUTES.length} route HTML files`);
}

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
        // sitemap.xml is generated from the same route list the Seo component
        // canonicalises against (src/lib/site.ts) — one source of truth.
        const today = new Date().toISOString().slice(0, 10);
        const urls = PUBLIC_ROUTES.map((route) =>
          `  <url><loc>${SITE_ORIGIN}${route.path === "/" ? "/" : route.path}</loc><lastmod>${today}</lastmod><changefreq>${route.changefreq}</changefreq><priority>${route.priority.toFixed(1)}</priority></url>`,
        ).join("\n");
        fs.writeFileSync(
          path.join(outDir, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        );
        writeRouteHtml(outDir);
      } catch (err) {
        console.warn("[version.json] write failed:", err);
      }
    },
  };
}

// Public client credentials (safe to ship in the browser bundle; RLS protects data).
// Pinned to the active project so no stale env value can point the app at an old backend.
const PUBLIC_SUPABASE_URL = "https://nhxgebulvqhtiiotetoo.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tAbh99C5tny6sMAiu6ZYrg_BWjkRIAX";
const PUBLIC_SUPABASE_PROJECT_ID = "nhxgebulvqhtiiotetoo";

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
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own long-lived chunks, so
        // shipping app changes doesn't force visitors to re-download React or
        // the Supabase client.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
}));
