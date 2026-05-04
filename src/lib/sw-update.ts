/**
 * Service-worker registration + safe update detection.
 *
 * Strategy (no forced reloads, no loops):
 *  - Poll registration.update() every 60s and on visibility/focus/online.
 *  - When a new SW is found and reaches "installed" while one is already
 *    controlling the page, dispatch `app:update-available` so the UI can
 *    surface a non-intrusive "Refresh for new version" toast.
 *  - The toast triggers a single user-driven reload — never automatic.
 *  - Skip entirely inside Lovable preview iframes.
 */

const UPDATE_INTERVAL_MS = 60_000; // 1 min — fast enough to catch deploys quickly

function shouldSkipSW(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.includes("id-preview--") || host.includes("lovableproject.com")) return true;
  return false;
}

function notifyUpdateAvailable(reg: ServiceWorkerRegistration) {
  window.dispatchEvent(
    new CustomEvent("app:update-available", { detail: { registration: reg } }),
  );
}

function watchInstallingWorker(reg: ServiceWorkerRegistration) {
  const sw = reg.installing;
  if (!sw) return;
  sw.addEventListener("statechange", () => {
    if (sw.state === "installed" && navigator.serviceWorker.controller) {
      // A new version is waiting and an old one is still controlling the page
      notifyUpdateAvailable(reg);
    }
  });
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  if (shouldSkipSW()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    regs.forEach((r) => r.unregister());
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    // If a worker is already waiting at load time, surface immediately
    if (reg.waiting && navigator.serviceWorker.controller) {
      notifyUpdateAvailable(reg);
    }

    // Watch for newly installing workers
    if (reg.installing) watchInstallingWorker(reg);
    reg.addEventListener("updatefound", () => watchInstallingWorker(reg));

    const checkForUpdate = () => reg.update().catch(() => {});

    // Initial + periodic + lifecycle-driven checks
    checkForUpdate();
    setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  } catch (err) {
    console.debug("[SW] registration failed", err);
  }
}

/**
 * Apply the waiting service worker and reload the page once it takes control.
 * Called by the user-facing "Refresh" action — never automatic.
 */
export async function applyUpdateAndReload() {
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const waiting = reg?.waiting;

  if (waiting) {
    // Reload once the new SW takes over
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    waiting.postMessage({ type: "SKIP_WAITING" });
    // Safety fallback if controllerchange never fires
    setTimeout(() => {
      if (!reloaded) window.location.reload();
    }, 1500);
  } else {
    window.location.reload();
  }
}
