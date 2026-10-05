import { Clock, Facebook, Instagram, MessageCircle, Phone, Send } from "lucide-react";
import { useStore, waLink } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";

/* How to reach the agent. */
export default function StoreContact() {
  const store = useStore(); const wa = waLink(store);
  const rows: Array<{ icon: typeof Phone; label: string; value: string; href: string }> = [];
  if (wa) rows.push({ icon: MessageCircle, label: "WhatsApp", value: store.whatsapp ?? "", href: wa });
  if (store.contact_phone) rows.push({ icon: Phone, label: "Call", value: store.contact_phone, href: `tel:${store.contact_phone.replace(/\s/g, "")}` });
  if (store.socials?.facebook) rows.push({ icon: Facebook, label: "Facebook", value: store.socials.facebook.replace(/^https?:\/\/(www\.)?/, ""), href: store.socials.facebook });
  if (store.socials?.instagram) rows.push({ icon: Instagram, label: "Instagram", value: store.socials.instagram.replace(/^https?:\/\/(www\.)?/, ""), href: store.socials.instagram });
  if (store.socials?.tiktok) rows.push({ icon: Send, label: "TikTok", value: store.socials.tiktok.replace(/^https?:\/\/(www\.)?/, ""), href: store.socials.tiktok });
  if (store.socials?.telegram) rows.push({ icon: Send, label: "Telegram", value: store.socials.telegram.replace(/^https?:\/\/(www\.)?/, ""), href: store.socials.telegram });
  return (
    <StorePage title={`Reach ${store.store_name}`} lead={store.hours_text ? <span className="inline-flex items-center gap-1.5"><Clock size={14} />{store.hours_text}</span> : "Questions about an order or a bundle? Here's how to get hold of us."}>
    <section className="onyx-panel rounded-[22px] p-5">
      <ul className="divide-y divide-white/[0.06]">
        {rows.length === 0 && <li className="py-4 text-[13px] text-muted-foreground">No contact details added yet.</li>}
        {rows.map((r) => <li key={r.label}><a href={r.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-primary-glow"><r.icon size={16} /></span><span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.12em] text-faint-foreground">{r.label}</span><span className="block truncate text-[14px] text-foreground">{r.value}</span></span></a></li>)}
      </ul>
      <p className="mt-4 text-[12px] leading-5 text-faint-foreground">For an order problem, have your order ID ready (AG-…), it's in your receipt email.</p>
    </section>
    </StorePage>
  );
}
