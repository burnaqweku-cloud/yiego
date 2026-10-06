import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, MessageCircle, Search, ShieldCheck } from "lucide-react";
import Seo from "@/components/seo/Seo";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { useStore, waLink } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";
import { NETWORKS, type Network } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { DEFAULT_FAQ } from "@/pages/store/StoreFaq";

/* The Studio template's home page. This is the store's front door: who they are,
   what it costs, how to buy, why to trust them. Buying itself happens on /bundles
   (StoreHome), so this page only ever points there or opens the buy sheet on a
   featured bundle. */

const NET_COLOURS: Record<string, string> = { mtn: "#ffcc00", telecel: "#e60000", at: "#1a5bd8" };
const NET_SHORT: Record<string, string> = { mtn: "MTN", telecel: "TEL", at: "AT" };
const prefixOf = (n: Network) => (n.id === "mtn" ? "mtn" : n.id === "telecel" ? "tel" : "at");

export default function StudioHome() {
  const store = useStore(); const navigate = useNavigate();
  const base = storeBase(store.slug);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [open, setOpen] = useState(false); const [addMoney, setAddMoney] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  const [track, setTrack] = useState("");
  useEffect(() => { void loadPhase1Products().then((r) => setProducts(r.data ?? [])); }, []);
  const agent: AgentStoreContext = useMemo(() => ({ slug: store.slug, name: store.store_name, prices: store.prices }), [store]);
  const live = useMemo(() => products.filter((p) => !p.is_paused), [products]);
  const priced = (p: Phase1Product) => Number(store.prices?.[p.id] ?? p.customer_price);
  // The price ticket: the agent's featured bundles, else the cheapest bundle of each network, else the first few.
  const ticket = useMemo(() => {
    const pick = (store.featured_product_ids ?? []).map((id) => live.find((p) => p.id === id)).filter((p): p is Phase1Product => Boolean(p));
    const fallback = NETWORKS.map((n) => live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))).sort((a, b) => priced(a) - priced(b))[0]).filter((p): p is Phase1Product => Boolean(p));
    return (pick.length ? pick : fallback).slice(0, 4).map((p) => ({ p, n: NETWORKS.find((n) => p.app_product_code?.startsWith(prefixOf(n)))!, price: priced(p) })).filter((x) => x.n);
  }, [live, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(NETWORKS.map((n) => [n.id, live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))).length])), [live]);
  const cheapest = useMemo(() => Object.fromEntries(NETWORKS.map((n) => { const ps = live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))).map(priced); return [n.id, ps.length ? Math.min(...ps) : null]; })), [live, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const buy = (p: Phase1Product, n: Network) => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); };
  const wa = store.support?.whatsapp_url ?? waLink(store);
  const faq = (store.faq?.length ? store.faq : DEFAULT_FAQ(store.store_name)).slice(0, 4);
  const first = store.store_name.split("'")[0];

  return (
    <div>
      <Seo path={base} title={`${store.store_name} — MTN, Telecel & AirtelTigo data bundles`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data from ${store.store_name}. Pay with MoMo or card, delivered to any number in minutes.`} />

      {/* Hero: the claim, the two things a visitor came to do, and real prices. */}
      <section className="px-5 pb-10 pt-8 sm:px-8 sm:pt-14">
        <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
          <div>
            {store.store_notice && <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary-soft))] px-3.5 py-1.5 text-[13px] font-medium text-[hsl(var(--primary-glow))]"><span className="h-1.5 w-1.5 rounded-full bg-current" />{store.store_notice}</p>}
            <h1 className="st-h1">Data for any number,<br />delivered in minutes.</h1>
            <p className="st-lead mt-5 max-w-[32ch]">{store.tagline ?? `${first} sells MTN, Telecel and AirtelTigo bundles at fair prices. Pay with MoMo or card and the data lands on the number straight away.`}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to={`${base}/bundles`} className="st-btn fill">Buy data<ArrowRight size={17} /></Link>
              <Link to={`${base}/track`} className="st-btn ghost"><Search size={16} />Track an order</Link>
            </div>
            <div className="mt-8 grid grid-cols-3 divide-x divide-[var(--st-line)] overflow-hidden rounded-2xl border border-[var(--st-line)] bg-white sm:max-w-md">
              {[["3", "Networks"], ["24/7", "Auto delivery"], ["MoMo", "or card"]].map(([v, l]) => <div key={l} className="px-2 py-4 text-center"><p className="text-[22px] font-extrabold leading-none tracking-tight text-[var(--st-ink)]">{v}</p><p className="mt-1.5 whitespace-nowrap text-[12px] text-[var(--st-slate)]">{l}</p></div>)}
            </div>
          </div>
          <div className="mt-10 lg:mt-0">
            <div className="st-ticket overflow-hidden">
              <div className="flex items-center justify-between px-[18px] py-3.5">
                <p className="text-[13px] font-semibold text-[var(--st-slate)]">{store.featured_product_ids?.length ? `${first}'s picks` : "Today's prices"}</p>
                <Link to={`${base}/bundles`} className="text-[13px] font-semibold text-[hsl(var(--primary-glow))]">All bundles</Link>
              </div>
              {ticket.length === 0 && [0, 1, 2].map((i) => <div key={i} className="row"><span className="h-5 w-24 animate-pulse rounded bg-[var(--st-mist)]" /><span className="h-5 w-16 animate-pulse rounded bg-[var(--st-mist)]" /></div>)}
              {ticket.map(({ p, n, price }) => (
                <button key={p.id} type="button" onClick={() => buy(p, n)} className="row">
                  <span className="flex items-center gap-3"><span className="dot flex h-9 w-9 items-center justify-center rounded-[10px] text-[11px] font-extrabold text-white" style={{ background: NET_COLOURS[n.id], color: n.id === "mtn" ? "#1f1600" : "#fff" }}>{NET_SHORT[n.id]}</span><span><span className="gb block">{p.name.replace(/^.*?—\s*/, "")}</span><span className="block text-[12.5px] text-[var(--st-slate)]">{p.validity ?? n.name}</span></span></span>
                  <span className="price">{store.promos?.[p.id] && <s className="mr-1.5 text-[13px] font-medium text-[var(--st-slate)] opacity-70">{formatGHS(store.promos[p.id].was)}</s>}{formatGHS(price)}</span>
                </button>
              ))}
              <div className="flex items-center gap-2 border-t border-[var(--st-line)] bg-[var(--st-mist)] px-[18px] py-3 text-[12.5px] text-[var(--st-slate)]"><ShieldCheck size={14} className="text-[hsl(var(--primary-glow))]" />Pay with MTN MoMo, Telecel Cash, AT Money or card. Receipt by email.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Networks: three doors into the shop, with the real starting price behind each. */}
      <section className="st-band px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="st-h2">Pick a network</h2>
          <p className="mt-2 max-w-[48ch] text-[15px] text-[var(--st-slate)]">Every bundle is non-expiry or long-validity as the network allows. Prices include everything; there's nothing added at payment.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {NETWORKS.map((n) => (
              <button key={n.id} type="button" onClick={() => navigate(`${base}/bundles?network=${n.id}`)} className="st-tile">
                <span className="dot" style={{ background: NET_COLOURS[n.id], color: n.id === "mtn" ? "#1f1600" : "#fff" }}>{NET_SHORT[n.id]}</span>
                <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold text-[var(--st-ink)]">{n.name}</span><span className="block text-[13px] text-[var(--st-slate)]">{counts[n.id] ? `${counts[n.id]} bundles${cheapest[n.id] != null ? ` from ${formatGHS(cheapest[n.id] as number)}` : ""}` : "Loading…"}</span></span>
                <ArrowRight size={18} className="shrink-0 text-[var(--st-slate)]" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: a real three-step sequence, so the numbers earn their place. */}
      <section className="px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="st-h2">Three steps, about a minute</h2>
          <div className="mt-7 grid gap-7 sm:grid-cols-3">
            {[["Choose a bundle", "Pick the network and the size. The price you see is the price you pay."], ["Enter the number", "Type the phone number the data should go to. Check it twice; data sent to a wrong number can't be recalled."], ["Pay and relax", "Approve the MoMo prompt or pay by card. The data is sent straight to the number and your receipt arrives by email."]].map(([t, d], i) => (
              <div key={t} className="st-step"><span className="n">{i + 1}</span><p className="text-[16px] font-bold text-[var(--st-ink)]">{t}</p><p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--st-slate)]">{d}</p></div>
            ))}
          </div>
          <form className="mt-9 flex max-w-xl flex-col gap-2 rounded-2xl border border-[var(--st-line)] p-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (track.trim()) navigate(`${base}/track?reference=${encodeURIComponent(track.trim().toUpperCase())}`); }}>
            <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Order ID (AG-…) or phone number" className="onyx-field flex-1 !border-0 !shadow-none" aria-label="Track an order" />
            <button type="submit" className="st-btn fill !py-3">Track order</button>
          </form>
        </div>
      </section>

      {/* About: the person behind the store, hours, and a way to reach them. */}
      <section className="st-band px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-5xl sm:grid sm:grid-cols-[auto_1fr] sm:gap-8">
          {store.logo_url ? <img src={store.logo_url} alt="" className="h-20 w-20 rounded-2xl object-contain bg-white p-0.5 shadow-sm" /> : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-[30px] font-extrabold text-white">{store.store_name.slice(0, 1).toUpperCase()}</span>}
          <div className="mt-5 sm:mt-0">
            <h2 className="st-h2">About {store.store_name}</h2>
            <p className="mt-3 max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed text-[var(--st-slate)]">{store.about_text?.trim() || `${store.store_name} is an independent data reseller. Orders are delivered automatically, day and night, and ${first} is on WhatsApp if anything needs a human.`}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="st-btn ghost !py-3"><MessageCircle size={16} />WhatsApp {first}</a>}
              <Link to={`${base}/about`} className="text-[14px] font-semibold text-[hsl(var(--primary-glow))]">More about us</Link>
              {store.hours_text && <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[var(--st-slate)]"><Clock size={14} />{store.hours_text}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ: the first four, the rest on their own page. */}
      <section className="px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="st-h2">Common questions</h2>
          <div className="mt-5 border-b border-[var(--st-line)]">
            {faq.map((x) => <details key={x.q} className="st-faq"><summary>{x.q}</summary><p>{x.a}</p></details>)}
          </div>
          <Link to={`${base}/faq`} className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[hsl(var(--primary-glow))]">All questions<ArrowRight size={15} /></Link>
        </div>
      </section>

      {/* Final call: the one thing to do. */}
      <section className="px-5 pb-14 pt-2 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-[hsl(var(--primary))] px-6 py-10 text-[#fff] sm:px-10 sm:py-12">
          <h2 className="font-display text-[26px] leading-tight sm:text-[34px]">Ready when you are.</h2>
          <p className="mt-2 max-w-[44ch] text-[15px] text-white/85">Bundles for MTN, Telecel and AirtelTigo, paid in seconds, delivered to any number in Ghana.</p>
          <Link to={`${base}/bundles`} className="st-btn mt-6 !bg-white !text-[hsl(var(--primary-strong))]">See all bundles<ArrowRight size={17} /></Link>
        </div>
      </section>

      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => { setOpen(false); setAddMoney(true); }} agent={agent} />
      <AddMoneyFlow open={addMoney} onClose={() => setAddMoney(false)} />
    </div>
  );
}
