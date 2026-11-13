import { useEffect, useState } from "react";

/* Telling visitors about Services (result checkers, MTN AFA registration), launched 13 Nov 2026.

   Two things, each with an end date so they retire themselves:
   - a pop-up, shown once per device on each site (datayego.com, or one agent's store), until POPUP_UNTIL;
   - a "New" tag on the Services button, until the person has opened Services on that site, or NEW_TAG_UNTIL.

   A visit never gets two pop-ups. The pop-ups (this one, "become an agent" on the main site, a store owner's own
   pop-ups in a store) tell each other through this file: whoever shows first notes it, and the others stand down
   for that visit. While this one is still owed on the page being opened, the others wait for it. */

export const POPUP_UNTIL = Date.UTC(2026, 10, 27, 23, 59, 59); // two weeks from launch
export const NEW_TAG_UNTIL = Date.UTC(2026, 11, 13, 23, 59, 59); // a month from launch
/** How long after arriving on the page the pop-up appears. */
export const POPUP_DELAY_MS = 4000;

/** "main" for datayego.com, "store:<slug>" for an agent's store. */
export const scopeOf = (storeSlug?: string | null) => (storeSlug ? `store:${storeSlug.toLowerCase()}` : "main");

/** The pop-up only appears where people arrive to buy: the home page and the bundle list. `rest` is the path inside the site. */
export const isPopupPage = (rest: string, isStore: boolean) => {
  const p = rest.replace(/\/+$/, "") || "/";
  return p === "/" || p === (isStore ? "/bundles" : "/shop");
};

export interface PopupFacts { now: number; seen: boolean; onPopupPage: boolean; promoVisit: boolean; otherPopupThisVisit: boolean; nothingOnSale: boolean }
/** Whether this visitor is still owed the pop-up on this page. Pure, so the rule can be tested. */
export function popupOwed(f: PopupFacts): boolean {
  if (f.now > POPUP_UNTIL || f.seen || !f.onPopupPage) return false;
  // Someone who came from an advert for a data offer is left alone to take it; they see this on a later visit.
  if (f.promoVisit || f.otherPopupThisVisit || f.nothingOnSale) return false;
  return true;
}
export const newTagLive = (now: number, visited: boolean) => now <= NEW_TAG_UNTIL && !visited;

/** Whole cedis without decimals, otherwise two: GH₵20, GH₵12.50. */
export const cedis = (n: number) => `GH₵${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Storage is optional everywhere: private windows and some in-app browsers refuse it, and then nothing is remembered.
const local = () => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
const session = () => { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } };
const read = (s: Storage | null, k: string) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const write = (s: Storage | null, k: string, v: string) => { try { s?.setItem(k, v); } catch { /* not remembered */ } };

export const popupSeen = (scope: string) => read(local(), `yg-services-pop:${scope}`) !== null;
export const markPopupSeen = (scope: string) => write(local(), `yg-services-pop:${scope}`, String(Date.now()));

export const servicesVisited = (scope: string) => read(local(), `yg-services-visited:${scope}`) !== null;
export function markServicesVisited(scope: string) {
  if (servicesVisited(scope)) return;
  write(local(), `yg-services-visited:${scope}`, String(Date.now()));
  try { window.dispatchEvent(new Event("yg:services-visited")); } catch { /* no window */ }
}

/** Which pop-up this visit has already had on this site, if any. */
export const popupThisVisit = (scope: string) => read(session(), `yg-pop-visit:${scope}`) as "services" | "other" | null;
export const notePopupShown = (scope: string, kind: "services" | "other") => write(session(), `yg-pop-visit:${scope}`, kind);

/** A visit that arrived through an advert's promo link (remembered for the visit, since the link's tag is lost on the next page). */
export function promoVisit(search: string): boolean {
  if (new URLSearchParams(search).has("promo")) write(session(), "yg-promo-visit", "1");
  return read(session(), "yg-promo-visit") === "1";
}
/** Set once the site is known to have no service on sale, so the other pop-ups stop waiting for this one. */
export const nothingOnSale = (scope: string) => read(session(), `yg-services-none:${scope}`) === "1";
export const noteNothingOnSale = (scope: string) => write(session(), `yg-services-none:${scope}`, "1");

/** For the other pop-ups: is the Services pop-up still owed on the page being opened? If so, they wait. */
export function servicesPopupOwed(scope: string, rest: string, search = ""): boolean {
  return popupOwed({ now: Date.now(), seen: popupSeen(scope), onPopupPage: isPopupPage(rest, scope !== "main"), promoVisit: scope === "main" && promoVisit(search),
    otherPopupThisVisit: popupThisVisit(scope) === "other", nothingOnSale: nothingOnSale(scope) });
}

/** Whether to show the "New" tag on the Services button. False on the first paint (so pre-built pages match), then the real answer. */
export function useServicesNew(scope: string): boolean {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    const check = () => setIsNew(newTagLive(Date.now(), servicesVisited(scope)));
    check();
    window.addEventListener("yg:services-visited", check);
    return () => window.removeEventListener("yg:services-visited", check);
  }, [scope]);
  return isNew;
}
