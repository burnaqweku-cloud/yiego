import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import MtnCheckField from "@/components/mtn/MtnCheckField";
import MtnCheckInfoSheet from "@/components/mtn/MtnCheckInfoSheet";
import { speedPill, useDeliverySpeed } from "@/hooks/useDeliverySpeed";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, ShieldCheck, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { useStore, waLink } from "@/components/store/StoreShell";
import { NETWORKS, type Network } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";

export default function StoreHome() {
  const speeds = useDeliverySpeed(); const [checkInfoOpen, setCheckInfoOpen] = useState(false);
  const store = useStore(); const navigate = useNavigate();
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [open, setOpen] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  const [network, setNetwork] = useState<"all" | "mtn" | "telecel" | "at">("all"); const [track, setTrack] = useState("");
  useEffect(() => { void loadPhase1Products().then((r) => setProducts(r.data ?? [])); }, []);
  const agent: AgentStoreContext = useMemo(() => ({ slug: store.slug, name: store.store_name, prices: store.prices }), [store]);
  const groups = useMemo(() => NETWORKS.map((n) => { const prefix = n.id === "mtn" ? "mtn" : n.id === "telecel" ? "tel" : "at"; return { n, items: products.filter((p) => p.app_product_code?.startsWith(prefix) && !p.is_paused).map((p) => ({ p, price: Number(store.prices?.[p.id] ?? p.customer_price) })) }; }).filter((g) => g.items.length && (network === "all" || g.n.id === network)), [products, store, network]);
  const featured = useMemo(() => (store.featured_product_ids ?? []).map((id) => { const p = products.find((x) => x.id === id && !x.is_paused); if (!p) return null; const n = NETWORKS.find((nn) => p.app_product_code?.startsWith(nn.id === "mtn" ? "mtn" : nn.id === "telecel" ? "tel" : "at")); if (!n) return null; return { p, n, price: Number(store.prices[p.id] ?? p.customer_price) }; }).filter((x): x is { p: Phase1Product; n: Network; price: number } => Boolean(x)), [store, products]);
  const wa = waLink(store);
  return (
    <>
      <Seo path={`/s/${store.slug}`} title={`${store.store_name} — MTN, Telecel & AirtelTigo data`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data bundles from ${store.store_name}. Fast delivery.`} />
      {store.banner_url && <img src={store.banner_url} alt="" className="mb-4 h-36 w-full rounded-3xl object-cover sm:h-48" />}
      <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5">
        <h1 className="font-display text-[24px] font-semibold leading-tight text-foreground sm:text-[28px]">Buy data in seconds.</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">MTN, Telecel and AirtelTigo. Pay with MoMo or card, delivered straight to the number.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Zap size={12} className="text-primary-glow" />Instant delivery</span><span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-primary-glow" />Secure payment</span></div>
      </section>
      {featured.length > 0 && network === "all" && (
        <section className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Popular picks</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{featured.map(({ p, price, n }) => <button key={p.id} type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="onyx-panel rounded-2xl p-3.5 text-left transition hover:border-primary-glow/30"><p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint-foreground">{n.name}</p><p className="mt-1 font-display text-[20px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p><p className="mt-1 text-[13px] font-semibold text-primary-glow">{formatGHS(price)}</p></button>)}</div>
        </section>
      )}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{([["all", "All"], ["mtn", "MTN"], ["telecel", "Telecel"], ["at", "AirtelTigo"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setNetwork(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ${network === id ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{label}</button>)}</div>
      <div className="mt-3 space-y-4">
        {groups.map(({ n, items }) => (
          <section key={n.id}>
            <div className="mb-1.5 flex items-center gap-2 px-1"><h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{n.name}</h2>{n.id === "mtn" && speedPill(speeds.MTN) && <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${speedPill(speeds.MTN)!.paused ? "border-white/[0.12] bg-white/[0.05] text-muted-foreground" : "border-primary-glow/20 bg-primary/[0.08] text-primary-glow"}`}><span className={`h-1.5 w-1.5 rounded-full ${speedPill(speeds.MTN)!.paused ? "bg-faint-foreground" : "bg-primary-glow"}`} />{speedPill(speeds.MTN)!.text}</span>}</div>
            {n.id === "mtn" && (
              <div className="onyx-panel mb-3 rounded-2xl p-3.5">
                <div className="mb-2 flex items-center gap-1.5"><p className="text-[12.5px] font-semibold text-foreground">Check if your MTN number is approved before you buy</p><button type="button" onClick={() => setCheckInfoOpen(true)} aria-label="About the MTN number check" className="text-faint-foreground hover:text-primary-glow"><Info size={14} /></button></div>
                <MtnCheckField source="shop" compact />
                <MtnCheckInfoSheet open={checkInfoOpen} onClose={() => setCheckInfoOpen(false)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map(({ p, price }) => (
                <button key={p.id} type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="onyx-panel group rounded-2xl p-3 text-left transition-colors hover:border-primary/40">
                  <p className="text-[18px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p>
                  <p className="text-[11px] text-faint-foreground">{p.validity ?? "Validity set by the network"}</p>
                  <p className="mt-2 flex items-center justify-between"><span className="text-[14px] font-semibold text-foreground">{formatGHS(price)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-glow group-hover:bg-primary/25">Buy</span></p>
                </button>))}
            </div>
          </section>))}
      </div>
      <section className="onyx-panel mt-6 rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Track an order</p>
        <p className="text-[12px] text-muted-foreground">Enter the order ID from your receipt (starts with AG-) or the phone number the data was sent to.</p>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (track.trim()) navigate(`/s/${store.slug}/track?reference=${encodeURIComponent(track.trim().toUpperCase())}`); }}>
          <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Order ID or phone number" className="onyx-field flex-1" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]"><Search size={14} /></button>
        </form>
      </section>
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-[14px] font-semibold text-[#062e1a]"><MessageCircle size={17} />Chat with {store.store_name.split("'")[0]} on WhatsApp</a>}
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => undefined} agent={agent} />
    </>
  );
}
