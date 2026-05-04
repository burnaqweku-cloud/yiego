import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { applyUpdateAndReload } from "@/lib/sw-update";

/**
 * Listens for `app:update-available` from the service worker and shows a
 * non-intrusive toast prompting the user to refresh.
 *
 * Safety:
 *  - Never auto-reloads.
 *  - Suppresses prompt on payment / checkout / wallet flows so users mid-payment
 *    aren't disrupted. They'll get the toast on their next navigation.
 *  - Shows once per page load.
 */
const UpdateToast = () => {
  const shownRef = useRef(false);

  useEffect(() => {
    const isSensitivePath = () => {
      const p = window.location.pathname;
      return (
        p.startsWith("/checkout") ||
        p.startsWith("/paystack") ||
        p.startsWith("/order-confirmation") ||
        p.includes("/wallet") ||
        p.includes("/deposit") ||
        p.startsWith("/tg/")
      );
    };

    const onUpdate = () => {
      if (shownRef.current) return;
      if (isSensitivePath()) return;
      shownRef.current = true;

      toast("A new YieGo update is available", {
        description: "Refresh to load the latest version.",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => applyUpdateAndReload(),
        },
        icon: <RefreshCw className="h-4 w-4" />,
      });
    };

    window.addEventListener("app:update-available", onUpdate);
    return () => window.removeEventListener("app:update-available", onUpdate);
  }, []);

  return null;
};

export default UpdateToast;
