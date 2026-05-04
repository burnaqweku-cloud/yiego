/**
 * Service-worker registration + safe update polling.
 *
 * Goals:
 * 1. Detect new deployments via periodic polling.
 * 2. Apply updates on next navigation — NO automatic reload.
 * 3. Never register inside Lovable preview iframes.
 *
 * Previous bug: controllerchange listener caused repeated auto-reloads
 * whenever the SW updated (every 60s poll could trigger a loop).
 * Fix: removed automatic reload. skipWaiting+clientsClaim still ensures
 * the new SW activates immediately — users get the new code on their
 * next navigation or manual refresh without disruptive forced reloads.
 */

const UPDATE_INTERVAL_MS = 5 * 60_000; // poll every 5 min (was 60s — too aggressive)

/** Guard: skip SW in preview / iframe contexts */
function shouldSkipSW(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true; // cross-origin → iframe
  }
  const host = window.location.hostname;
  if (host.includes('id-preview--') || host.includes('lovableproject.com')) return true;
  return false;
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  if (shouldSkipSW()) {
    // Unregister any stale SW left from a previous context
    const regs = await navigator.serviceWorker.getRegistrations();
    regs.forEach((r) => r.unregister());
    return;
  }

  // NOTE: No controllerchange → reload listener.
  // skipWaiting + clientsClaim means the new SW activates immediately,
  // and the user gets fresh assets on next navigation without a forced reload.

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Immediately check for update on load
    reg.update().catch(() => {});

    // Periodic update polling — catches new deploys without user action
    setInterval(() => {
      reg.update().catch(() => {});
    }, UPDATE_INTERVAL_MS);
  } catch (err) {
    console.debug('[SW] registration failed', err);
  }
}
