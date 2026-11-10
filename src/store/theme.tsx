import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { isStoreHost } from "@/lib/storeHost";

/** Theme: Daylight (light) only. `light` is set on <html>; a pre-paint script in
 *  index.html does the same before React loads (no flash). */

export type ThemeMode = "dark" | "light" | "system";
type Resolved = "dark" | "light";

/* v2: Daylight became the default for everyone (17 Oct 2026). Bumping the key resets the choice people made under
   the old default once; whatever they pick now is kept. */
const STORAGE_KEY = "yiego_theme_v2";
const THEME_COLOR: Record<Resolved, string> = {
  dark: "#080b0a",
  light: "#f2f7f4",
};

/** The public site: everything on the main host except the agent and admin apps. */
export function isPublicSitePath(pathname: string): boolean {
  return !isStoreHost() && !/^\/(agent|admin)(\/|$)/.test(pathname);
}

/* 10 Nov 2026: the site is light only. Dark mode was removed at the owner's request, so nothing is read from
   the device or from a saved choice any more, and there is no switch. The types and the hook stay so the
   pieces that ask for the theme (toasts, the Android status bar) keep working. */
const loadMode = (): ThemeMode => "light";
const resolve = (_mode: ThemeMode): Resolved => "light";

function apply(resolved: Resolved) {
  document.documentElement.classList.toggle("light", resolved === "light");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[resolved]);
  syncAppSystemBars(resolved);
}

/** Inside the Android app: keep the status-bar icons readable on the chosen theme (dark icons on light, light on dark).
 *  The app's native bridge is only present there; in a browser this does nothing. */
function syncAppSystemBars(resolved: Resolved) {
  try {
    const cap = (window as unknown as { Capacitor?: { nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown> } }).Capacitor;
    void cap?.nativePromise?.("SystemBars", "setStyle", { style: resolved === "light" ? "LIGHT" : "DARK" })?.catch(() => undefined);
  } catch { /* not in the app */ }
}

interface ThemeValue {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = loadMode();
  const resolved = resolve(mode);
  useEffect(() => {
    apply(resolved);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* non-fatal */ }
  }, [resolved]);
  const value = useMemo<ThemeValue>(() => ({ mode, resolved, setMode: () => undefined }), [mode, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
