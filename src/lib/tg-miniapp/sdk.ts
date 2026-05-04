// Thin typed wrapper around window.Telegram.WebApp.
// Loaded only on /tg/* routes via TgMiniAppLayout.

export interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TgMainButton {
  text: string;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  setText: (text: string) => void;
  setParams: (p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
}

export interface TgBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

export interface TgHapticFeedback {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: TgMainButton;
  BackButton: TgBackButton;
  HapticFeedback: TgHapticFeedback;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string, opts?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, cb?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  showAlert: (msg: string, cb?: () => void) => void;
  showConfirm: (msg: string, cb?: (ok: boolean) => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getTg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Dynamically inject the Telegram WebApp SDK once. Resolves when ready. */
export function loadTelegramSdk(): Promise<TgWebApp | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.Telegram?.WebApp) {
      resolve(window.Telegram.WebApp);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-tg-sdk="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Telegram?.WebApp ?? null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.dataset.tgSdk = "1";
    s.onload = () => resolve(window.Telegram?.WebApp ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
