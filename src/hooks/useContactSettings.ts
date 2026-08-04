import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** The business contact block, managed by admins in the database.
 *  Shared by the footer, the Support page and the Contact page. */

export interface ContactSettings {
  business_name: string;
  whatsapp_number: string | null;
  whatsapp_message: string;
  support_email: string | null;
  business_hours: string | null;
  is_whatsapp_enabled: boolean;
}

const COLUMNS =
  "business_name, whatsapp_number, whatsapp_message, support_email, business_hours, is_whatsapp_enabled";

export function useContactSettings() {
  const [contact, setContact] = useState<ContactSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await (
          supabase as unknown as { schema: (name: string) => any }
        )
          .schema("phase1")
          .from("public_contact_settings")
          .select(COLUMNS)
          .limit(1)
          .maybeSingle();
        if (active) setContact((data as ContactSettings | null) ?? null);
      } catch {
        // Contact details are decorative here — never block the page.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const whatsappUrl = useMemo(() => {
    if (!contact?.is_whatsapp_enabled || !contact.whatsapp_number) return "";
    const number = contact.whatsapp_number.replace(/\D/g, "");
    if (!number) return "";
    const message = contact.whatsapp_message || "Hello YieGo, I need help.";
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }, [contact]);

  return { contact, whatsappUrl, loading };
}
