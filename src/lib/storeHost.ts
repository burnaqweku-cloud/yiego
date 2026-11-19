/* Store hosts: a connected custom domain (buysell.com) or a free subdomain (buysell.datayego.com)
   serve that store at the root. Everything else is the main site, where stores live under /s/slug. */
const MAIN_HOSTS = ["datayego.com", "www.datayego.com", "yiego.shop", "www.yiego.shop", "localhost", "127.0.0.1"];
export function isStoreHost(host = typeof window === "undefined" ? "datayego.com" : window.location.hostname): boolean {
  const h = host.toLowerCase();
  if (MAIN_HOSTS.includes(h)) return false;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h.endsWith(".lovable.dev")) return false;
  return true;
}
/* Path prefix for store links: "" on a store host, "/s/slug" on the main site. */
let hostSlug: string | null = null;
export const setHostSlug = (s: string | null) => { hostSlug = s; };
export const getHostSlug = () => hostSlug;
/* On a store host, the host's own store lives at the root; any other store (e.g. a sub-agent on the parent's domain) at /s/slug. */
export const storeBase = (slug: string) => (isStoreHost() && (hostSlug === null || hostSlug === slug) ? "" : `/s/${slug}`);

/* Where datayego.com/s/<slug>/… jumps (19 Nov 2026): the store's home from phase1.store_home (its own domain, or a
   sub-agent's parent's domain + /s/<slug>) plus the rest of the path, the query and the hash. Null when there is
   nowhere to go, or when we are already on that host (a sub-agent's pages on its parent's domain), so it never loops. */
export function storeHomeTarget(home: string | null | undefined, loc: { host: string; pathname: string; search: string; hash: string }, base: string): string | null {
  if (!home || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/s\/[a-z0-9-]+)?$/i.test(home)) return null;
  let host: string;
  try { host = new URL(home).host.toLowerCase(); } catch { return null; }
  if (host === loc.host.toLowerCase()) return null;
  const rest = base && loc.pathname.toLowerCase().startsWith(base.toLowerCase()) ? loc.pathname.slice(base.length) : "";
  return `${home}${rest || (home.includes("/s/") ? "" : "/")}${loc.search}${loc.hash}`;
}
