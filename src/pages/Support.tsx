import { useEffect, useMemo, useState } from "react";
import { Bot, Mail, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ContactRow { business_name: string; whatsapp_number: string | null; whatsapp_message: string; support_email: string | null; business_hours: string | null; is_whatsapp_enabled: boolean; }

export default function Support() {
  const [contact, setContact] = useState<ContactRow | null>(null);
  useEffect(() => { void (async () => { const { data } = await (supabase as unknown as { schema: (name: string) => any }).schema("phase1").from("public_contact_settings").select("business_name, whatsapp_number, whatsapp_message, support_email, business_hours, is_whatsapp_enabled").limit(1).maybeSingle(); setContact(data as ContactRow | null); })(); }, []);
  const whatsappUrl = useMemo(() => {
    if (!contact?.whatsapp_number) return "";
    const number = contact.whatsapp_number.replace(/\D/g, "");
    return `https://wa.me/${number}?text=${encodeURIComponent(contact.whatsapp_message || "Hello YieGo, I need help.")}`;
  }, [contact]);

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-glow">Help</p><h1 className="mt-2 font-display text-3xl font-semibold text-white">Support</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Start with our 24/7 AI assistant for immediate guidance. For account-specific or unresolved issues, contact the YieGo team and include your order reference.</p></div>
    <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><Bot size={22} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold text-white">24/7 AI support</h2><span className="rounded-full bg-success/[0.1] px-2.5 py-1 text-[11px] font-semibold text-success">Always available</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask about buying data, payments, wallets, pending orders, shared payments, tracking and disputes.</p><Button className="mt-5" asChild><Link to="/support/ai">Chat with YieGo AI</Link></Button></div></div></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2">
      {contact?.is_whatsapp_enabled && whatsappUrl && <Card><CardContent><MessageCircle className="text-success" /><h2 className="mt-4 font-display text-lg font-semibold text-white">WhatsApp</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Contact the official YieGo support number for issues that need a person.</p><Button className="mt-5" asChild><a href={whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp</a></Button></CardContent></Card>}
      {contact?.support_email && <Card><CardContent><Mail className="text-primary-glow" /><h2 className="mt-4 font-display text-lg font-semibold text-white">Email</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Use email for detailed dispute information or documents.</p><Button className="mt-5" variant="ghost" asChild><a href={`mailto:${contact.support_email}`}>{contact.support_email}</a></Button></CardContent></Card>}
    </div>
    <p className="text-xs leading-5 text-faint-foreground">Never send your password, one-time code, card details or Mobile Money PIN to the AI assistant or a support agent.</p>
    {contact?.business_hours && <Card><CardContent><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-glow">Human support hours</p><p className="mt-2 text-sm text-foreground">{contact.business_hours}</p></CardContent></Card>}
  </div>;
}
