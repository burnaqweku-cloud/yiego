import { useEffect, useState } from "react";
import WhatsAppFab from "@/components/layout/WhatsAppFab";
import { WHATSAPP_CHANNEL_URL } from "@/lib/site";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useContactSettings } from "@/hooks/useContactSettings";

/**
 * Floating help on every customer-facing page.
 *
 * The WhatsApp channel bubble bottom left (only while WhatsApp support is
 * enabled in contact settings) and a small "Help" pill bottom right. Both
 * slide away while the page scrolls down and come back when it stops, so
 * they never sit on top of the prices. Both sit below modals (z-40).
 */
export default function FloatingSupport() {
  const { whatsappUrl } = useContactSettings();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 6 && y > 80) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setHidden(false), 900);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); };
  }, []);

  const shift = hidden ? "translate-y-24 opacity-0" : "translate-y-0 opacity-100";

  return (
    <>
      {whatsappUrl && (
        <div className={`fixed bottom-4 left-4 z-40 transition-all duration-300 sm:bottom-5 sm:left-5 ${shift}`} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <WhatsAppFab href={WHATSAPP_CHANNEL_URL} label="DataYego on WhatsApp" />
        </div>
      )}

      <Link
        to="/support"
        aria-label="Get help"
        className={`fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-[13.5px] font-semibold text-[#04120c] shadow-[0_8px_24px_rgba(34,195,135,0.35)] transition-all duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow sm:bottom-5 sm:right-5 ${shift}`}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <MessageCircle size={18} />
        Help
      </Link>
    </>
  );
}
