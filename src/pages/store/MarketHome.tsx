import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, MessageCircle, Search } from "lucide-react";
import Seo from "@/components/seo/Seo";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { useStore, waLink } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";
import { formatGHS } from "@/lib/format";
import { DEFAULT_FAQ } from "@/pages/store/StoreFaq";
import { useHomeData } from "@/pages/store/homeData";
import type { Phase1Product } from "@/lib/phase1-api";
import type { Network } from "@/data/bundles";

/* Market's front door: the same painted signboard and sticker language as its bundle list,
   arranged as a home page. Buying happens on /bundles. */
export default function MarketHome() {
  const store = useStore(); const navigate = useNavigate();
  const base = storeBase(store.slug); const { picks, perNetwork, loaded } = useHomeData(store);
  const [open, setOpen] = useState(false); const [addMoney, setAddMoney] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null); const [track, setTrack] = useState("");
  const agent: AgentStoreContext = { slug: store.slug, name: store.store_name, prices: store.prices };
  const buy = (p: Phase1Product, n: Network) => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); };
  const wa = store.support?.whatsapp_url ?? waLink(store); const first = store.store_name.split("'")[0];
  const faq = (store.faq?.length ? store.faq : DEFAULT_FAQ(store.store_name)).slice(0, 4);
  return (
    <div className="space-y-7">
      <Seo path={base} title={`${store.store_name} — MTN, Telecel & AirtelTigo data`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data from ${store.store_name}. Pay with MoMo, delivered in minutes.`} />
      <section className="st-board">
        <span className="st-sticker text-[12px]">MTN · Telecel · AirtelTigo</span>
        <h1 className="mt-3">{store.store_name}</h1>
        <p className="mt-2 text-[15px]">{store.tagline ?? "Data for any number. Pay with MoMo, delivered in minutes."}</p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <Link to={`${base}/bundles`} className="onyx-btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px]">Buy data<ArrowRight size={17} /></Link>
          <Link to={`${base}/track`} className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#fff8ec]/60 px-5 py-3 text-[14px] font-bold text-[#fff8ec]"><Search size={15} />Track an order</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="st-sticker text-[12px]">Automatic delivery</span>
          <span className="st-sticker text-[12px]">Open 24/7</span>
          <span className="st-sticker text-[12px]">MoMo or card</span>
        </div>
      </section>

      <section>
        <h2 className="st-net">Pick your network</h2>
        <div className="mt-3 space-y-2.5">
          {perNetwork.map(({ n, count, from }) => (
            <button key={n.id} type="button" onClick={() => navigate(`${base}/bundles?network=${n.id}`)} className="st-row">
              <span className={`st-gb st-gb-${n.id}`}>{n.id === "mtn" ? "MTN" : n.id === "telecel" ? "TEL" : "AT"}<small>{count ? `${count} plans` : "…"}</small></span>
              <span className="min-w-0"><span className="block text-[15px] font-bold text-[#15131f]">{n.name} bundles</span><span className="block text-[12.5px] text-muted-foreground">{loaded ? (from != null ? `from ${formatGHS(from)}` : "none right now") : "loading…"}</span></span>
              <span className="st-price"><ArrowRight size={20} /></span>
            </button>
          ))}
        </div>
      </section>

      {picks.length > 0 && (
        <section>
          <h2 className="st-net">{store.featured_product_ids?.length ? `${first}'s picks` : "Popular today"}</h2>
          <div className="mt-3 space-y-2.5">{picks.slice(0, 4).map(({ p, n, price }) => <button key={p.id} type="button" onClick={() => buy(p, n)} className="st-row"><span className={`st-gb st-gb-${n.id}`}>{p.name.replace(/^.*?—\s*/, "")}<small>{n.name}</small></span><span className="min-w-0 text-[13px] text-muted-foreground">{p.validity ?? "Validity set by the network"}</span><span className="st-price">{store.promos?.[p.id] && <s className="mr-1 text-[13px] opacity-50">{formatGHS(store.promos[p.id].was)}</s>}{formatGHS(price)}</span></button>)}</div>
          <Link to={`${base}/bundles`} className="mt-3 inline-flex items-center gap-1 text-[14px] font-bold text-[#1d2460]">See every bundle<ArrowRight size={15} /></Link>
        </section>
      )}

      <section className="onyx-panel p-5">
        <h2 className="st-net">How it works</h2>
        <ol className="mt-3 space-y-3">{[["Pick a bundle", "Choose the network and size. The sticker price is the price."], ["Type the number", "Check it twice; data sent to a wrong number can't be recalled."], ["Pay with MoMo", "Approve the prompt and the data lands on the number. Receipt by email."]].map(([t, d], i) => <li key={t} className="flex gap-3"><span className="st-sticker shrink-0 text-[14px]">{i + 1}</span><span><span className="block text-[14.5px] font-bold text-[#15131f]">{t}</span><span className="block text-[13px] text-muted-foreground">{d}</span></span></li>)}</ol>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (track.trim()) navigate(`${base}/track?reference=${encodeURIComponent(track.trim().toUpperCase())}`); }}><input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Order ID or phone number" className="onyx-field flex-1" aria-label="Track an order" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]"><Search size={14} /></button></form>
      </section>

      <section className="st-board !py-6">
        <div className="flex items-start gap-4">
          {store.logo_url ? <img src={store.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border-2 border-[#fff8ec] object-contain bg-white p-0.5" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#ffd23f] text-[26px] font-black text-[#15131f]">{store.store_name.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0"><h2 className="!text-[22px]">About {store.store_name}</h2><p className="mt-1.5 whitespace-pre-line text-[13.5px]">{store.about_text?.trim() || `${store.store_name} is an independent data seller. Orders are delivered automatically, day and night, and ${first} is on WhatsApp if anything needs a human.`}</p>{store.hours_text && <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px]"><Clock size={13} />{store.hours_text}</p>}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[13.5px] font-bold text-[#062b16]"><MessageCircle size={16} />WhatsApp {first}</a>}<Link to={`${base}/about`} className="inline-flex items-center rounded-full border-2 border-[#fff8ec]/60 px-4 py-2.5 text-[13.5px] font-bold text-[#fff8ec]">More about us</Link></div>
      </section>

      <section className="onyx-panel px-5 py-2">
        <h2 className="st-net pt-3">Questions</h2>
        {faq.map((x) => <details key={x.q} className="group border-t-2 border-dashed border-[#1d2460]/20 first:border-0"><summary className="cursor-pointer list-none py-3 text-[14.5px] font-bold text-[#15131f]">{x.q}</summary><p className="pb-3 text-[13.5px] leading-6 text-muted-foreground">{x.a}</p></details>)}
        <Link to={`${base}/faq`} className="inline-flex items-center gap-1 py-3 text-[13.5px] font-bold text-[#1d2460]">All questions<ArrowRight size={14} /></Link>
      </section>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => { setOpen(false); setAddMoney(true); }} agent={agent} />
      <AddMoneyFlow open={addMoney} onClose={() => setAddMoney(false)} />
    </div>
  );
}
