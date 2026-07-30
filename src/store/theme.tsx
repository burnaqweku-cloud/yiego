import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Theme — Onyx Dark (signature), Daylight, or follow the device.
 *  The resolved theme toggles `light` on <html>; a pre-paint script in
 *  index.html applies the same logic before React loads (no flash). */

export type ThemeMode = "dark" | "light" | "system";
type Resolved = "dark" | "light";

const STORAGE_KEY = "yiego_theme_v1";
const THEME_COLOR: Record<Resolved, string> = {
  dark: "#080b0a",
  light: "#f2f7f4",
};

function loadMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* default */
  }
  return "light";
}

function systemPrefersLight(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)").matches
    : false;
}

function resolve(mode: ThemeMode): Resolved {
  if (mode === "system") return systemPrefersLight() ? "light" : "dark";
  return mode;
}

function apply(resolved: Resolved) {
  document.documentElement.classList.toggle("light", resolved === "light");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[resolved]);
}

interface ThemeValue {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadMode);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(loadMode()));

  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  // Follow the OS while in system mode.
  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolved(resolve("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setResolved(resolve(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
