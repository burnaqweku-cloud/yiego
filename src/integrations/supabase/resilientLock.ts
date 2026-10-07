/* The auth library serialises session reads/refreshes across tabs with a
   browser-wide Web Lock. Chrome (especially on Android) freezes old background
   tabs, and a frozen tab that was holding the lock never releases it: every
   live tab then waits the default 10s, fails, and behaves as signed out
   (bundles don't load, admin menu disappears, login hangs). A healthy holder
   releases within milliseconds, so after a short wait we take the lock over
   rather than fail. The frozen tab, when thawed, simply re-reads the session
   from storage. */

const WAIT_MS = 3000;

async function report(message: string) {
  try { const m = await import("@/lib/client-errors"); m.reportClientError("auth_lock", message); } catch { /* never block auth on reporting */ }
}

export async function resilientLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return await fn();

  const ac = new AbortController();
  let granted = false;
  const timer = setTimeout(() => { if (!granted) ac.abort(); }, WAIT_MS);
  try {
    return await locks.request(name, { mode: "exclusive", signal: ac.signal }, async () => { granted = true; clearTimeout(timer); return await fn(); });
  } catch (e) {
    const aborted = !granted && e instanceof DOMException && e.name === "AbortError";
    if (!aborted) throw e;
  } finally {
    clearTimeout(timer);
  }

  // Still held after WAIT_MS: a frozen tab has it. Take it over.
  void report(`lock "${name}" held for over ${WAIT_MS}ms; taken over`);
  return await locks.request(name, { mode: "exclusive", steal: true }, async () => await fn());
}
