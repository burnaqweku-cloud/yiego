import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle, Search, ShieldCheck, Store, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { NETWORKS } from "@/data/bundles";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";

/* An agent's storefront. Stands on its own: the agent's name, their prices,
   their contact, their footer. DataYego appears only as the secure checkout. */
interface StoreData { id: string; slug: string; store_name: string; tagline: string | null; logo_url: string | null; whatsapp: string | null; prices: Record<string, number> }

export default function AgentStore() {
  const { slug = "" } = useParams();
  const [store, setStore] = useState<StoreData | null | undefined>(undefined);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [open, setOpen] = useState(false);
  const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  const [network, setNetwork] = useState<"all" | "mtn" | "telecel" | "at">("all");
  const [track, setTrack] = useState("");

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("agent_store", { p_slug: slug, p_preview: true }).then((r: { data: StoreData | null }) => setStore(r.data ?? null));
    void loadPhase1Products().then((r) => setProducts(r.data ?? []));
  }, [slug]);

  const agent: AgentStoreContext | null = useMemo(() => store ? { slug: store.slug, name: store.store_name, prices: store.prices } : null, [store]);
  const groups = useMemo(() => NETWORKS.map((n) => { const prefix = n.id === "mtn" ? "mtn" : n.id === "telecel" ? "tel" : "at"; return { n, items: products.filter((p) => p.app_product_code?.startsWith(prefix) && !p.is_paused).map((p) => ({ p, price: Number(store?.prices?.[p.id] ?? p.customer_price) })) }; }).filter((g) => g.items.length && (network === "all" || g.n.id === network)), [products, store, network]);
  const initial = store?.store_name?.trim().slice(0, 1).toUpperCase() ?? "S";
  const wa = store?.whatsapp ? `https://wa.me/233${store.whatsapp.replace(/\D/g, "").replace(/^0/, "")}` : null;

  if (store === undefined) return <div className="min-h-dvh bg-[#0b1512]" />;
  if (store === null) return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1512] px-6 text-center text-white/80">
      <div><Store size={30} className="mx-auto text-white/40" /><p className="mt-3 text-[17px] font-semibold text-white">This store isn't open</p><p className="mt-1 text-[13px] text-white/60">It may be paused, or the link may be wrong.</p></div>
    </div>
  );

  return (
    <div className="onyx-canvas min-h-dvh">
      <Seo path={`/s/${store.slug}`} title={`${store.store_name} — MTN, Telecel & AirtelTigo data`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data bundles from ${store.store_name}. Fast delivery.`} />
      {/* Store header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {store.logo_url ? <img src={store.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-[16px] font-bold text-primary-glow">{initial}</span>}
          <div className="min-w-0 flex-1"><p className="truncate text-[16px] font-semibold text-foreground">{store.store_name}</p><p className="truncate text-[11.5px] text-muted-foreground">{store.tagline ?? "Data bundles, delivered fast"}</p></div>
          {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]"><MessageCircle size={18} /></a>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-5">
        {/* Hero */}
        <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5">
          <h1 className="font-display text-[24px] font-semibold leading-tight text-foreground sm:text-[28px]">Buy data in seconds.</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">MTN, Telecel and AirtelTigo. Pay with MoMo or card, delivered straight to the number.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Zap size={12} className="text-primary-glow" />Instant delivery</span><span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-primary-glow" />Secure payment</span></div>
        </section>

        {/* Network filter */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {([["all", "All"], ["mtn", "MTN"], ["telecel", "Telecel"], ["at", "AirtelTigo"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setNetwork(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ${network === id ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{label}</button>)}
        </div>

        {/* Bundles */}
        <div className="mt-3 space-y-4">
          {groups.map(({ n, items }) => (
            <section key={n.id}>
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{n.name}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map(({ p, price }) => (
                  <button key={p.id} type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="onyx-panel group rounded-2xl p-3 text-left transition-colors hover:border-primary/40">
                    <p className="text-[18px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p>
                    <p className="text-[11px] text-faint-foreground">{p.validity ?? "No expiry"}</p>
                    <p className="mt-2 flex items-center justify-between"><span className="text-[14px] font-semibold text-foreground">{formatGHS(price)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-glow group-hover:bg-primary/25">Buy</span></p>
                  </button>))}
              </div>
            </section>))}
        </div>

        {/* Track */}
        <section className="onyx-panel mt-6 rounded-2xl p-4">
          <p className="text-[13.5px] font-semibold text-foreground">Track an order</p>
          <p className="text-[12px] text-muted-foreground">Enter the order ID from your receipt (starts with AG-).</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (track.trim()) window.location.href = `/track-order?reference=${encodeURIComponent(track.trim().toUpperCase())}`; }}>
            <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="AG-XXXXXXXXXX" className="onyx-field flex-1" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]"><Search size={14} /></button>
          </form>
        </section>

        {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-[14px] font-semibold text-[#062e1a]"><MessageCircle size={17} />Chat with {store.store_name.split("'")[0]} on WhatsApp</a>}
      </main>

      <footer className="border-t border-white/[0.06] px-4 py-6 text-center text-[11.5px] text-faint-foreground">
        <p>© {new Date().getFullYear()} {store.store_name}</p>
        <p className="mt-1 flex items-center justify-center gap-1"><ShieldCheck size={11} />Payments secured by DataYego</p>
      </footer>

      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => undefined} agent={agent} />
    </div>
  );
}
