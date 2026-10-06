import WhatsAppFab from "@/components/layout/WhatsAppFab";
import { WHATSAPP_CHANNEL_URL } from "@/lib/site";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useContactSettings } from "@/hooks/useContactSettings";

/** The public DataYego WhatsApp channel — announcements and updates. The
 *  floating bubble opens this; person-to-person chat stays on the support
 *  number via the Support page's "Chat on WhatsApp" button. */

/** WhatsApp brand glyph — lucide ships no brand icons, so it's inlined. */

/**
 * Two floating action buttons on every customer-facing page:
 * WhatsApp (bottom-left) and AI support (bottom-right). The WhatsApp bubble
 * opens the DataYego channel; it only appears while WhatsApp support is
 * enabled in contact settings, so one admin switch still controls both the
 * bubble and the Support page. Sits below modals (z-40).
 */
export default function FloatingSupport() {
  const { whatsappUrl } = useContactSettings();

  return (
    <>
      {whatsappUrl && <div className="fixed bottom-5 left-5 z-40" style={{ marginBottom: "env(safe-area-inset-bottom)" }}><WhatsAppFab href={WHATSAPP_CHANNEL_URL} label="DataYego on WhatsApp" /></div>}

      <Link
        to="/support/ai"
        aria-label="Get support"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-[#04120c] shadow-[0_8px_24px_rgba(34,195,135,0.4)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <MessageCircle size={26} />
      </Link>
    </>
  );
}
