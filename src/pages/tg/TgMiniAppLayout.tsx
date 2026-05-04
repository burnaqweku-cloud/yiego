import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { loadTelegramSdk, getTg, type TgWebApp } from "@/lib/tg-miniapp/sdk";

/**
 * Layout for all /tg/* Mini App routes.
 * - Injects the Telegram WebApp SDK script
 * - Calls ready() + expand()
 * - Applies Telegram theme colors as CSS variables
 * - Provides a clean, headerless, mobile-first canvas
 *
 * Only this layout loads telegram-web-app.js — never index.html.
 */
export default function TgMiniAppLayout() {
  const [tg, setTg] = useState<TgWebApp | null>(null);
  const [loaded, setLoaded] = useState(false);
  const location = useLocation();

  // Safety net: on every route change inside /tg/*, reset the MainButton so
  // stale text/handlers from a previous page can never bleed through before
  // the new page's useTgMainButton() effect runs.
  useEffect(() => {
    const w = getTg();
    if (!w) return;
    try { w.MainButton.hideProgress(); w.MainButton.hide(); } catch (_) { /* noop */ }
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    // YieGo brand palette (charcoal + gold) — applied uniformly across all
    // Mini App pages, ignoring Telegram's user theme to keep brand consistent.
    const BRAND_BG = "#ffffff";
    const BRAND_SURFACE = "#f8f5ee"; // warm cream surface
    const BRAND_TEXT = "#1f2937";    // charcoal
    const BRAND_HINT = "#6b7280";    // muted slate
    const BRAND_GOLD = "#c9a84c";    // primary gold
    const BRAND_GOLD_TEXT = "#1f2937"; // dark text on gold buttons

    loadTelegramSdk().then((webapp) => {
      if (cancelled) return;
      if (webapp) {
        try {
          webapp.ready();
          webapp.expand();
          if (webapp.setBackgroundColor) webapp.setBackgroundColor(BRAND_BG);
          if (webapp.setHeaderColor) webapp.setHeaderColor(BRAND_BG);
        } catch (e) {
          console.warn("[TgMiniAppLayout] tg setup error:", e);
        }
        const root = document.documentElement;
        root.style.setProperty("--tg-bg", BRAND_BG);
        root.style.setProperty("--tg-text", BRAND_TEXT);
        root.style.setProperty("--tg-hint", BRAND_HINT);
        root.style.setProperty("--tg-link", BRAND_GOLD);
        root.style.setProperty("--tg-button", BRAND_GOLD);
        root.style.setProperty("--tg-button-text", BRAND_GOLD_TEXT);
        root.style.setProperty("--tg-secondary-bg", BRAND_SURFACE);
        document.body.dataset.tgMiniapp = "1";
      }
      setTg(webapp ?? getTg());
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      delete document.body.dataset.tgMiniapp;
    };
  }, []);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "var(--tg-bg, #ffffff)",
        color: "var(--tg-text, #0f172a)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div className="mx-auto max-w-md px-4 py-5">
        {!loaded ? (
          <div className="flex flex-col items-center justify-center py-20 text-sm" style={{ color: "var(--tg-hint)" }}>
            Loading…
          </div>
        ) : !tg ? (
          <NotInTelegram />
        ) : (
          <Outlet context={{ tg }} />
        )}
      </div>
    </div>
  );
}

function NotInTelegram() {
  return (
    <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "#e2e8f0" }}>
      <div className="text-2xl mb-2">🤖</div>
      <h1 className="text-lg font-semibold mb-2">Open inside Telegram</h1>
      <p className="text-sm leading-relaxed" style={{ color: "var(--tg-hint)" }}>
        This page is part of the YieGo Telegram bot and must be opened from inside Telegram.
        Search <strong>@yiego_bot</strong> on Telegram to get started.
      </p>
    </div>
  );
}
