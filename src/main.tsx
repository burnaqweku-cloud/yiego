import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";

// A page left open across a publish asks for code files that no longer exist,
// which shows up as blank sheets or pages. Reload once to pick up the live build.
window.addEventListener("vite:preloadError", (event) => {
  const key = "yg-chunk-reload";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 30_000) return; // already tried; don't loop
  sessionStorage.setItem(key, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

// Stale copies. Some phones (Chrome especially) still run a service worker from an early build,
// which can serve an old app that never reaches the server. On every start: remove any service
// worker and its caches, then compare our build with the live version.json; if the live site is
// newer, reload once so the phone is on the current build.
void (async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      let removed = false;
      for (const r of regs) { removed = (await r.unregister()) || removed; }
      if (removed && "caches" in window) { for (const k of await caches.keys()) await caches.delete(k); }
    }
    const key = "yg-version-reload";
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return; // already reloaded for this
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const live = (await res.json()) as { version?: string };
    if (live.version && typeof __BUILD_VERSION__ === "string" && live.version !== __BUILD_VERSION__) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  } catch { /* offline or blocked: carry on with what we have */ }
})();

// Public pages arrive pre-rendered (see vite.config.ts → prerenderRoutes): hydrate that markup instead of replacing
// it, so the first paint is instant and crawlers and humans see the same page. Anything else starts from the empty div.
const rootEl = document.getElementById("root")!;
const tree = <AppErrorBoundary><App /></AppErrorBoundary>;
if (rootEl.hasChildNodes()) hydrateRoot(rootEl, tree, { onRecoverableError(err) { document.documentElement.dataset.hydration = "recovered"; document.documentElement.dataset.hydrationNote = String((err as Error)?.message ?? err).slice(0, 200); if (import.meta.env.DEV) console.warn(err); } });
else createRoot(rootEl).render(tree);
