import { isStoreHost } from "@/lib/storeHost";

/* Short advert links: datayego.com/go/<tag>.
   Telegram can hide an advert's long link under a word; WhatsApp, Facebook posts, TikTok bios and texts cannot: the
   link you paste is the link people see. So every advert also has a short, plain address that opens the bundle list
   exactly as its long link does (promo price, counted under that advert).
   The address is swapped for the long one before the app reads it, so nothing else needs to know about short links. */

const TAG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

/** A tag that can be an address on its own: letters, digits, dash and underscore. */
export const shortLinkTag = (tag: string | null | undefined): string | null => (tag && TAG.test(tag) ? tag.toLowerCase() : null);

/** Where /go/<tag> really leads, or null for any other address. */
export function shortLinkTarget(pathname: string): string | null {
  const m = /^\/go\/([^/]+)\/?$/.exec(pathname);
  const tag = m ? shortLinkTag(m[1]) : null;
  return tag ? `/shop?promo=1&utm_source=link&utm_medium=paid&utm_campaign=${tag}` : null;
}

/** Run once at start-up, before anything reads the address. Main site only: a store has no adverts of ours. */
export function openShortLink(w: Pick<Window, "location" | "history"> = window): boolean {
  try {
    if (isStoreHost(w.location.hostname)) return false;
    const target = shortLinkTarget(w.location.pathname);
    if (!target) return false;
    w.history.replaceState(null, "", target);
    return true;
  } catch { return false; }
}
