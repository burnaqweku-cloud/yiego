import { Clock, MessageCircle } from "lucide-react";
import { useStore, waLink } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";

/* The agent's About page: their words, their banner, their hours. */
export default function StoreAbout() {
  const store = useStore(); const wa = waLink(store);
  return (
    <StorePage title={`About ${store.store_name}`} lead={store.tagline ?? undefined}>
      {store.banner_url && <img src={store.banner_url} alt="" className="mb-5 h-40 w-full rounded-[22px] object-cover sm:h-52" />}
      <section className="onyx-panel rounded-[22px] p-5">
        <p className="whitespace-pre-line text-[14px] leading-7 text-foreground">{store.about_text?.trim() || `${store.store_name} sells MTN, Telecel and AirtelTigo data bundles, delivered straight to any number in minutes. Pick a bundle, enter the number, pay with MoMo or card, and track your order any time.`}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold text-foreground">24/7</p><p className="text-[11px] text-faint-foreground">Automatic delivery</p></div>
          <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold text-foreground">3</p><p className="text-[11px] text-faint-foreground">Networks</p></div>
        </div>
        {store.hours_text && <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Clock size={13} />{store.hours_text}</p>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />Message on WhatsApp</a>}
      </section>
    </StorePage>
  );
}
