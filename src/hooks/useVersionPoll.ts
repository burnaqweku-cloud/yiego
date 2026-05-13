import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Auto-update: at build time we stamp __BUILD_VERSION__ into the bundle and
// emit dist/version.json. At runtime we poll that file; when it differs from
// the build the user loaded with, we reload.
//
// UX rules:
//   - Dev mode: no-op (HMR handles it).
//   - User on a sensitive flow (checkout, payment, wallet, deposit, telegram
//     mini-app routes): never auto-reload; show a toast with a Refresh
//     action so they can choose. The existing UpdateToast also suppresses
//     these paths.
//   - User typing in a form field: never auto-reload; toast only.
//   - User idle & visible: brief toast then auto-reload after a short delay.
//   - User on a different tab: reload silently the moment they leave (so
//     they come back to the new version with no flash).

const POLL_INTERVAL_MS = 30_000;
const RELOAD_DELAY_MS = 1_500;
const VERSION_URL = "/version.json";

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /^\/checkout/,
  /^\/paystack/,
  /^\/order-confirmation/,
  /\/wallet/,
  /\/deposit/,
  /^\/tg\//,
  /^\/auth/,
];

function isSensitivePath() {
  const p = window.location.pathname;
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(p));
}

function isEditing() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useVersionPoll() {
  const detectedRef = useRef(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let cancelled = false;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const reload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    const scheduleReload = () => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(reload, RELOAD_DELAY_MS);
    };

    const onUpdateAvailable = () => {
      if (detectedRef.current) return;
      detectedRef.current = true;

      // Silent reload if user is away — they'll come back to the new version.
      if (document.visibilityState === "hidden") {
        reload();
        return;
      }

      if (isSensitivePath() || isEditing()) {
        toast("A new version is available", {
          description: "Refresh to load the latest update.",
          duration: Number.POSITIVE_INFINITY,
          action: { label: "Refresh", onClick: reload },
        });
      } else {
        toast.success("Updating to the latest version…", { duration: RELOAD_DELAY_MS });
        scheduleReload();
      }
    };

    const check = async () => {
      try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled) return;
        if (data?.version && String(data.version) !== __BUILD_VERSION__) {
          onUpdateAvailable();
        }
      } catch {
        // Network blip — ignore and try again next interval.
      }
    };

    const interval = setInterval(check, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        check();
      } else if (detectedRef.current && !reloadingRef.current) {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
          reloadTimer = null;
        }
        reload();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
