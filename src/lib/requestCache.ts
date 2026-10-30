/* One copy of slow-changing reads per visit.
 *
 * Every page used to ask the database for the same things again and again (prices, networks, settings, contact
 * details, "am I an agent?") — ~28,000 requests a day for data that changes a few times a week. This keeps one copy
 * in memory for a few minutes and shares a single in-flight request between every component that asks at the same
 * time. Public data is also kept in sessionStorage so moving between pages or reloading doesn't ask again.
 *
 * Nothing here decides money: checkout re-reads prices on the server, and paused networks are refused there too.
 * Per-user values are keyed by the signed-in user, so switching accounts never shows the previous account's data.
 */

type Entry<T> = { at: number; value: T };
const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const STORE_PREFIX = "yg-rc:";

function readStored<T>(key: string, ttlMs: number): Entry<T> | null {
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    return Date.now() - e.at < ttlMs ? e : null;
  } catch { return null; }
}
function writeStored(key: string, e: Entry<unknown>) {
  try { sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify(e)); } catch { /* storage full or blocked: memory copy still works */ }
}

/**
 * Returns the cached value for `key` if it is younger than `ttlMs`, otherwise runs `load` once (concurrent callers
 * share the same request). A result is only kept when `keep(result)` is true, so a failed or empty read is retried
 * on the next call instead of being remembered.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { persist?: boolean; keep?: (v: T) => boolean } = {}): Promise<T> {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (opts.persist) {
    const stored = readStored<T>(key, ttlMs);
    if (stored) { memory.set(key, stored); return stored.value; }
  }
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = (async () => {
    try {
      const value = await load();
      if (!opts.keep || opts.keep(value)) {
        const e = { at: Date.now(), value };
        memory.set(key, e);
        if (opts.persist) writeStored(key, e);
      }
      return value;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/** True when `key` already has a fresh copy (in memory, or in sessionStorage when `persist`). */
export function isFresh(key: string, ttlMs: number, persist = false): boolean {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return true;
  return persist && readStored(key, ttlMs) !== null;
}

/** Put a value in the cache (used by the page-start request to fill several entries at once). */
export function prime<T>(key: string, value: T, opts: { persist?: boolean } = {}) {
  const e = { at: Date.now(), value };
  memory.set(key, e);
  if (opts.persist) writeStored(key, e);
}

/** Forget entries whose key starts with `prefix` (or everything) — after the viewer changes something. */
export function invalidate(prefix = "") {
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(STORE_PREFIX + prefix)) sessionStorage.removeItem(k); } catch { /* ignore */ }
}

/** setInterval that skips ticks while the tab is hidden and runs once when it comes back. */
export function visibleInterval(fn: () => void, ms: number): () => void {
  const t = setInterval(() => { if (typeof document === "undefined" || document.visibilityState === "visible") fn(); }, ms);
  const onVisible = () => { if (document.visibilityState === "visible") fn(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
}
