import { useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ContactRow { business_name: string; whatsapp_number: string | null; whatsapp_message: string; support_email: string | null; business_hours: string | null; is_whatsapp_enabled: boolean; }

export default function Support() {
  const [contact, setContact] = useState<ContactRow | null>(null);
  useEffect(() => { void (async () => { const { data } = await supabase.schema("phase1").from("public_contact_settings").select("business_name, whatsapp_number, whatsapp_message, support_email, business_hours, is_whatsapp_enabled").limit(1).maybeSingle(); setContact(data as ContactRow | null); })(); }, []);
  const whatsappUrl = useMemo(() => {
    if (!contact?.whatsapp_number) return "";
    const number = contact.whatsapp_number.replace(/\D/g, "");
    return `https://wa.me/${number}?text=${encodeURIComponent(contact.whatsapp_message || "Hello YieGo, I need help.")}`;
  }, [contact]);

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-glow">Help</p><h1 className="mt-2 font-display text-3xl font-semibold text-white">Contact support</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">For faster help, include your order reference and explain what happened. Never send your password, one-time code or full payment credentials.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {contact?.is_whatsapp_enabled && whatsappUrl && <Card><CardContent><MessageCircle className="text-success" /><h2 className="mt-4 font-display text-lg font-semibold text-white">WhatsApp</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Chat with {contact.business_name || "YieGo"} support using the official number configured by the administrator.</p><Button className="mt-5" asChild><a href={whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp</a></Button></CardContent></Card>}
      {contact?.support_email && <Card><CardContent><Mail className="text-primary-glow" /><h2 className="mt-4 font-display text-lg font-semibold text-white">Email</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Use email for detailed dispute information or documents.</p><Button className="mt-5" variant="ghost" asChild><a href={`mailto:${contact.support_email}`}>{contact.support_email}</a></Button></CardContent></Card>}
    </div>
    {contact?.business_hours && <Card><CardContent><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-glow">Support hours</p><p className="mt-2 text-sm text-foreground">{contact.business_hours}</p></CardContent></Card>}
  </div>;
}
