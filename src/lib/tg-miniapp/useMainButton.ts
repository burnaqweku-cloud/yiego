import { useEffect } from "react";
import { getTg } from "./sdk";

export interface MainButtonConfig {
  text: string;
  visible?: boolean;
  active?: boolean;
  progress?: boolean;
  onClick?: () => void;
}

/**
 * Centralized Telegram MainButton manager for /tg/* pages.
 *
 * Each page/state must explicitly declare what the MainButton should look like.
 * Pass `null` (or omit config) to keep it hidden for that state.
 *
 * On unmount and on every config change, the previous click handler is removed
 * and the button is hidden — preventing leaked text/handlers across pages.
 */
export function useTgMainButton(config: MainButtonConfig | null | undefined): void {
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;
    const mb = tg.MainButton;

    if (!config) {
      try { mb.hide(); } catch (_) { /* noop */ }
      return () => {
        try { mb.hide(); } catch (_) { /* noop */ }
      };
    }

    const handler = config.onClick ?? (() => { /* noop */ });
    try {
      mb.setParams({
        text: config.text,
        is_visible: config.visible !== false,
        is_active: config.active !== false,
      });
      if (config.progress) mb.showProgress(true); else mb.hideProgress();
      mb.onClick(handler);
    } catch (_) { /* noop */ }

    return () => {
      try {
        mb.offClick(handler);
        mb.hideProgress();
        mb.hide();
      } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.text, config?.visible, config?.active, config?.progress, config?.onClick]);
}
