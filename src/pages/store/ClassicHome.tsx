import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, MessageCircle, Search, ShieldCheck, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { useStore, waLink } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";
import { formatGHS } from "@/lib/format";
import { DEFAULT_FAQ } from "@/pages/store/StoreFaq";
import { NET_COLOURS, NET_SHORT, useHomeData } from "@/pages/store/homeData";
import type { Phase1Product } from "@/lib/phase1-api";
import type { Network } from "@/data/bundles";

/* Classic's front door: the dark green card language of its bundle grid, as a home page. */
export default function ClassicHome() {
  const store = useStore(); const navigate = useNavigate();
  const base = storeBase(store.slug); const { picks, perNetwork, loaded } = useHomeData(store);
  const [open, setOpen] = useState(false); const [addMoney, setAddMoney] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null); const [track, setTrack] = useState("");
  const agent: AgentStoreContext = { slug: store.slug, name: store.store_name, prices: store.prices };
  const buy = (p: Phase1Product, n: Network) => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); };
  const wa = store.support?.whatsapp_url ?? waLink(store); const first = store.store_name.split("'")[0];
  const faq = (store.faq?.length ? store.faq : DEFAULT_FAQ(store.store_name)).slice(0, 4);
  return (
    <div className="space-y-6">
      <Seo path={base} title={`${store.store_name} — MTN, Telecel & AirtelTigo data`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data from ${store.store_name}. Pay with MoMo or card, delivered in minutes.`} />
      <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/25 via-primary/8 to-transparent p-6">
        <h1 className="font-display text-[30px] font-semibold leading-[1.05] text-foreground sm:text-[38px]">Data for any number,<br />in minutes.</h1>
        <p className="mt-3 max-w-[34ch] text-[14.5px] text-muted-foreground">{store.tagline ?? "MTN, Telecel and AirtelTigo. Pay with MoMo or card, delivered straight to the number."}</p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row"><Link to={`${base}/bundles`} className="onyx-btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px]">Buy data<ArrowRight size={17} /></Link><Link to={`${base}/track`} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.14] px-5 py-3 text-[14px] font-semibold text-foreground"><Search size={15} />Track an order</Link></div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Zap size={13} className="text-primary-glow" />Automatic delivery, 24/7</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-primary-glow" />Secure payment</span><span>MTN · Telecel · AirtelTigo</span></div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pick a network</h2>
        <div className="grid gap-2 sm:grid-cols-3">{perNetwork.map(({ n, count, from }) => <button key={n.id} type="button" onClick={() => navigate(`${base}/bundles?network=${n.id}`)} className="onyx-panel flex items-center gap-3 rounded-2xl p-3.5 text-left transition hover:border-primary/40"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold" style={{ background: NET_COLOURS[n.id], color: n.id === "mtn" ? "#1f1600" : "#fff" }}>{NET_SHORT[n.id]}</span><span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">{n.name}</span><span className="block text-[12px] text-faint-foreground">{loaded ? (from != null ? `${count} bundles · from ${formatGHS(from)}` : "none right now") : "loading…"}</span></span><ArrowRight size={16} className="text-faint-foreground" /></button>)}</div>
      </section>

      {picks.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{store.featured_product_ids?.length ? "Popular picks" : "Popular today"}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{picks.map(({ p, n, price }) => <button key={p.id} type="button" onClick={() => buy(p, n)} className="onyx-panel group rounded-2xl p-3.5 text-left transition hover:border-primary/40"><p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint-foreground">{n.name}</p><p className="mt-1 text-[20px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</p><p className="mt-2 flex items-center justify-between text-[14px] font-semibold text-foreground"><span>{store.promos?.[p.id] && <s className="mr-1.5 text-[11.5px] font-medium text-faint-foreground">{formatGHS(store.promos[p.id].was)}</s>}{formatGHS(price)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-glow group-hover:bg-primary/25">Buy</span></p></button>)}</div>
          <Link to={`${base}/bundles`} className="mt-3 inline-flex items-center gap-1 px-1 text-[13.5px] font-semibold text-primary-glow">See every bundle<ArrowRight size={14} /></Link>
        </section>
      )}

      <section className="onyx-panel rounded-[22px] p-5">
        <h2 className="text-[15px] font-semibold text-foreground">How it works</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">{[["Pick a bundle", "Choose the network and size. The price you see is the price you pay."], ["Enter the number", "Check it twice; data sent to a wrong number can't be recalled."], ["Pay and relax", "Approve the MoMo prompt or pay by card. Receipt by email."]].map(([t, d], i) => <li key={t} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12.5px] font-bold text-primary-glow">{i + 1}</span><span><span className="block text-[14px] font-semibold text-foreground">{t}</span><span className="block text-[12.5px] text-muted-foreground">{d}</span></span></li>)}</ol>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (track.trim()) navigate(`${base}/track?reference=${encodeURIComponent(track.trim().toUpperCase())}`); }}><input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Order ID or phone number" className="onyx-field flex-1" aria-label="Track an order" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]"><Search size={14} /></button></form>
      </section>

      <section className="onyx-panel rounded-[22px] p-5">
        <h2 className="text-[15px] font-semibold text-foreground">About {store.store_name}</h2>
        <p className="mt-2 whitespace-pre-line text-[13.5px] leading-6 text-muted-foreground">{store.about_text?.trim() || `${store.store_name} is an independent data seller. Orders are delivered automatically, day and night, and ${first} is on WhatsApp if anything needs a human.`}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">{wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />WhatsApp {first}</a>}<Link to={`${base}/about`} className="text-[13.5px] font-semibold text-primary-glow">More about us</Link>{store.hours_text && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Clock size={13} />{store.hours_text}</span>}</div>
      </section>

      <section className="onyx-panel rounded-[22px] px-5 py-2">
        <h2 className="pt-3 text-[15px] font-semibold text-foreground">Common questions</h2>
        {faq.map((x) => <details key={x.q} className="group border-t border-white/[0.06] first:border-0"><summary className="cursor-pointer list-none py-3 text-[14px] font-semibold text-foreground">{x.q}</summary><p className="pb-3 text-[13.5px] leading-6 text-muted-foreground">{x.a}</p></details>)}
        <Link to={`${base}/faq`} className="inline-flex items-center gap-1 py-3 text-[13.5px] font-semibold text-primary-glow">All questions<ArrowRight size={14} /></Link>
      </section>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => { setOpen(false); setAddMoney(true); }} agent={agent} />
      <AddMoneyFlow open={addMoney} onClose={() => setAddMoney(false)} />
    </div>
  );
}
