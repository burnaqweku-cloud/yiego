import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary";
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

createRoot(document.getElementById("root")!).render(<AppErrorBoundary><App /></AppErrorBoundary>);
