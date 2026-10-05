/* Store hosts: a connected custom domain (buysell.com) or a free subdomain (buysell.datayego.com)
   serve that store at the root. Everything else is the main site, where stores live under /s/slug. */
const MAIN_HOSTS = ["datayego.com", "www.datayego.com", "yiego.shop", "www.yiego.shop", "localhost", "127.0.0.1"];
export function isStoreHost(host = window.location.hostname): boolean {
  const h = host.toLowerCase();
  if (MAIN_HOSTS.includes(h)) return false;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h.endsWith(".lovable.dev")) return false;
  return true;
}
/* Path prefix for store links: "" on a store host, "/s/slug" on the main site. */
export const storeBase = (slug: string) => (isStoreHost() ? "" : `/s/${slug}`);
