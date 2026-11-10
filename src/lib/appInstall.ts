import { useEffect, useState } from "react";

/* The DataYego Android app and the "Get the app" offer.
   The app is a shell around this site, so the same code runs inside it; everything here answers
   two questions for a visitor in a browser: can we offer them the app, and do they already have it? */

export interface AppVersion { version: string; code: number; size: number; sha256: string; built_at: string; file: string }
export type Device = "android" | "iphone" | "other";

const GOT_KEY = "yg-app-got";
const GOT_FOR_MS = 14 * 86400000;

export function deviceKind(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): Device {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) return "iphone";
  return "other";
}

/** True inside the Android app, and when the site was added to an iPhone or Android home screen. */
export function runningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  if (/DataYegoApp\//.test(navigator.userAgent) || "Capacitor" in window) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

/** Remembered on this browser when someone taps Download, so the offer rests for two weeks. */
export function markAppDownloaded() {
  try { localStorage.setItem(GOT_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
function recentlyDownloaded(): boolean {
  try { const at = Number(localStorage.getItem(GOT_KEY)); return Number.isFinite(at) && at > 0 && Date.now() - at < GOT_FOR_MS; } catch { return false; }
}

/** Chrome on Android can tell us the app is installed (the app declares this site in its manifest). */
async function installedOnThisPhone(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ id?: string }[]> };
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const apps = await nav.getInstalledRelatedApps();
    return apps.some((app) => app.id === "com.datayego.app");
  } catch { return false; }
}

let versionRequest: Promise<AppVersion | null> | null = null;
/** What the build put on the site. Null until a signed app has been published. */
export function loadAppVersion(): Promise<AppVersion | null> {
  versionRequest ??= fetch("/app/version.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((v: AppVersion | null) => (v && typeof v.version === "string" && typeof v.file === "string" ? v : null))
    .catch(() => null);
  return versionRequest;
}

export const formatAppSize = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Should this visitor be offered the app, and which kind of phone are they on? */
export function useAppOffer(): { show: boolean; device: Device; version: AppVersion | null } {
  const [state, setState] = useState<{ show: boolean; device: Device; version: AppVersion | null }>({ show: false, device: "other", version: null });
  useEffect(() => {
    let live = true;
    const device = deviceKind();
    if (device === "other" || runningAsApp() || recentlyDownloaded()) return;
    void (async () => {
      // An iPhone installs from the browser itself; Android needs the app file to exist.
      const version = device === "android" ? await loadAppVersion() : null;
      if (device === "android" && (!version || (await installedOnThisPhone()))) return;
      if (live) setState({ show: true, device, version });
    })();
    return () => { live = false; };
  }, []);
  return state;
}
