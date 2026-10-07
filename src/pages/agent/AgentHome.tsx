import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, Copy, HelpCircle, Info, LifeBuoy, Lock, Share2, ShoppingBag, Wallet } from "lucide-react";
import { useWallet } from "@/store/wallet";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { priceListImage } from "@/lib/priceListImage";
import { fmt, p1, useAgent } from "@/components/agent/AgentShell";
import { stageOf, toneClass } from "@/components/agent/orderStage";
import { longDate } from "@/components/agent/subscription";

export default function AgentHome() {
  const { agent, orders, products, prices, storeUrl, plan, reload, sub, openRenew, isSub } = useAgent();
  const { balance: walletBalance } = useWallet();
  // Latest orders: rows per page is remembered on this device; Prev/Next page through all loaded orders.
  const PAGE_KEY = "yg-agent-home-orders-per-page";
  const [perPage, setPerPageState] = useState<number>(() => { try { const v = Number(localStorage.getItem(PAGE_KEY)); return [5, 10, 20].includes(v) ? v : 5; } catch { return 5; } });
  const setPerPage = (n: number) => { setPerPageState(n); setPage(0); try { localStorage.setItem(PAGE_KEY, String(n)); } catch { /* ignore */ } };
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(orders.length / perPage));
  const pageRows = orders.slice(page * perPage, page * perPage + perPage);
  // Messages from the network this store belongs to (sub-agents only)
  const [netAnns, setNetAnns] = useState<Array<{ id: string; title: string; body: string; created_at: string }>>([]);
  useEffect(() => { if (!isSub) return; void p1().from("network_announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(5).then(({ data }) => setNetAnns(data ?? [])); }, [isSub]);
  const [params] = useSearchParams();
  useEffect(() => { if (params.get("paid") === "1") { toast.success("Payment received. You're all set!"); setTimeout(() => void reload(), 2500); } }, [params, reload]);
  const today = useMemo(() => orders.filter((o) => o.paid_at && new Date(o.paid_at).toDateString() === new Date().toDateString()), [orders]);
  const week = useMemo(() => orders.filter((o) => o.paid_at && Date.now() - +new Date(o.paid_at) < 7 * 86400000), [orders]);
  const earned = (list: typeof orders) => list.filter((o) => o.status === "delivered").reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
  const pendingOrders = useMemo(() => orders.filter((o) => !["delivered", "refunded", "cancelled"].includes(o.status)), [orders]);
  const pending = pendingOrders.reduce((a, o) => a + Number(o.agent_margin ?? 0), 0);
  const priceList = () => { const list = products.filter((p) => !p.is_paused).map((p) => `${p.name}: GH₵ ${Number(prices[p.id] ?? p.store_default_price ?? p.customer_price).toFixed(2)}`).join("\n"); return `${agent.store_name} — price list\n\n${list}\n\nOrder here: ${storeUrl}`; };
  const setupKey = `dy.agent.setup.hidden.${agent.id}`;
  const [setupHidden, setSetupHidden] = useState(() => { try { return localStorage.getItem(setupKey) === "1"; } catch { return false; } });
  const setup = [
    { label: "Pick a template and your colours", done: !!(agent.logo_url || agent.accent_color || (agent.template && agent.template !== "classic")), to: "/agent/store/look" },
    { label: "Add your logo", done: !!agent.logo_url, to: "/agent/store/look" },
    { label: "Set your prices", done: Object.keys(prices).length > 0, to: "/agent/prices" },
    { label: "Add your MoMo number for payouts", done: !!agent.momo_number, to: "/agent/store/details" },
    { label: "Share your store link", done: orders.length > 0, to: "/agent/domain/addresses" },
  ];
  const setupDone = setup.every((x) => x.done);
  const share = async () => { const text = `Buy MTN, Telecel and AirtelTigo data from my store: ${storeUrl}`; if (navigator.share) { try { await navigator.share({ title: agent.store_name, text, url: storeUrl }); return; } catch { /* cancelled */ } } await navigator.clipboard.writeText(text); toast.success("Link copied."); };

  return (
    <div className="space-y-4">
      {isSub && netAnns.length > 0 && (
        <section className="onyx-panel rounded-[22px] p-4">
          <p className="text-[15px] font-semibold text-foreground">From {agent.parent?.store_name ?? "your network"}</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">{netAnns.map((a) => <li key={a.id} className="py-2.5"><p className="text-[13.5px] font-semibold text-foreground">{a.title}</p><p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-muted-foreground">{a.body}</p><p className="mt-1 text-[11px] text-faint-foreground">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p></li>)}</ul>
        </section>
      )}
      {!setupDone && !setupHidden && (
        <section className="onyx-panel rounded-[22px] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-semibold text-foreground">Set up {agent.store_name}</p><p className="mt-0.5 text-[12.5px] text-muted-foreground">{setup.filter((x) => x.done).length} of {setup.length} done. Each step takes a minute.</p></div><button type="button" onClick={() => { localStorage.setItem(setupKey, "1"); setSetupHidden(true); }} className="text-[12px] text-faint-foreground">Hide</button></div>
          <ul className="mt-3 space-y-1.5">{setup.map((x) => <li key={x.label}><Link to={x.to} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${x.done ? "text-faint-foreground" : "bg-white/[0.03] text-foreground"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${x.done ? "border-primary-glow/40 bg-primary/15 text-primary-glow" : "border-white/[0.15]"}`}>{x.done ? "✓" : ""}</span><span className={`text-[13.5px] ${x.done ? "line-through" : "font-medium"}`}>{x.label}</span>{!x.done && <span className="ml-auto text-[12px] text-primary-glow">Do it</span>}</Link></li>)}</ul>
        </section>
      )}
      <div><p className="text-[12px] text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p><h1 className="font-display text-[24px] font-semibold text-foreground">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</h1></div>
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Earnings balance</p>
            <p className="mt-1 text-[34px] font-semibold leading-none text-foreground">{formatGHS(Number(agent.earnings_balance))}</p>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">Available now · withdraw from {formatGHS(plan?.payout_minimum ?? 20)} to MoMo</p>
          </div>
          <Link to="/agent/buy" className="shrink-0 rounded-2xl border border-white/[0.1] bg-background/50 px-3.5 py-2.5 text-right transition-colors hover:border-primary/40">
            <span className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Wallet<BalanceTip /></span>
            <span className="mt-1 block text-[20px] font-semibold leading-none text-foreground">{formatGHS(walletBalance)}</span>
            <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-primary-glow"><Wallet size={11} />Top up</span>
          </Link>
        </div>
        {pending > 0 && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber/12 px-2.5 py-1 text-[11.5px] text-amber"><span className="h-1.5 w-1.5 rounded-full bg-amber" />{formatGHS(pending)} pending on {pendingOrders.length} order{pendingOrders.length === 1 ? "" : "s"} · released when delivered<Link to="/agent/help?a=available-vs-pending" aria-label="What is pending?" className="ml-1 inline-flex"><HelpCircle size={13} /></Link></p>}
        <div className="mt-4 flex gap-2"><Link to="/agent/earnings" className="onyx-btn-primary px-5 py-2.5 text-center text-[13px]">Withdraw</Link><button type="button" onClick={() => void share()} className="flex items-center gap-1.5 rounded-full border border-white/[0.14] px-4 py-2.5 text-[13px] text-foreground"><Share2 size={14} />Share store</button></div>
      </div>
      {sub.state === "lapsed"
        ? <Link to="/agent/buy" className="onyx-panel flex items-center gap-3 rounded-2xl p-4 opacity-80"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"><Lock size={18} /></span><span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Agent prices locked</span><span className="block text-[12px] text-muted-foreground">Renew your plan to buy at agent price again.</span></span><ArrowRight size={16} className="text-muted-foreground" /></Link>
        : <Link to="/agent/buy" className="onyx-panel flex items-center gap-3 rounded-2xl p-4 hover:border-primary/40"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-glow"><ShoppingBag size={20} /></span><span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Buy data at your agent price</span><span className="block text-[12px] text-muted-foreground">For yourself or anyone. Pay from your wallet, MoMo or card.</span></span><ArrowRight size={16} className="text-primary-glow" /></Link>}
      <button type="button" onClick={openRenew} className="onyx-panel flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:border-primary/40">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${sub.state === "active" ? "bg-primary/15 text-primary-glow" : "bg-amber/15 text-amber"}`}><CalendarCheck size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-foreground">{sub.state === "active" ? `Plan active · ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left` : sub.state === "grace" ? "Plan ended · renew today" : "Plan ended"}</span>
          <span className="block text-[12px] text-muted-foreground">{sub.state === "active" ? `Paid until ${longDate(sub.paidUntil)}. Extend any time — 3 and 12-month plans cost less per month.` : "Tap to renew. Everything reopens the moment you pay."}</span>
        </span>
        <span className="text-[12.5px] font-semibold text-primary-glow">{sub.state === "active" ? "Extend" : "Renew"}</span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        {[["Today", today.length, earned(today)], ["7 days", week.length, earned(week)], ["All time", orders.length, earned(orders)]].map(([l, n, e]) => <div key={String(l)} className="onyx-panel rounded-2xl p-3"><p className="text-[11px] text-faint-foreground">{String(l)}</p><p className="text-[20px] font-semibold text-foreground">{String(n)}</p><p className="text-[11px] text-primary-glow">+{formatGHS(Number(e))}</p></div>)}
      </div>
      <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13px] font-semibold text-foreground">Your store link</p>
        <div className="mt-2 flex items-center gap-2"><a href={storeUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-xl bg-white/[0.03] px-3 py-2.5 text-[13px] text-foreground">{storeUrl.replace(/^https?:\/\//, "")}</a><button type="button" onClick={() => { void navigator.clipboard.writeText(storeUrl); toast.success("Link copied."); }} aria-label="Copy link" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] text-muted-foreground"><Copy size={15} /></button></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]"><Link to="/agent/domain/addresses" className="text-primary-glow">Change link</Link><Link to="/agent/status" className="text-primary-glow">Status maker</Link><a className="text-primary-glow" href={`https://wa.me/?text=${encodeURIComponent(`Buy MTN, Telecel and AirtelTigo data from my store: ${storeUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a><button type="button" className="text-primary-glow" onClick={() => void (async () => { try { const blob = await priceListImage({ storeName: agent.store_name, tagline: agent.tagline, link: storeUrl, accent: agent.accent_color ?? null, products, prices }); const file = new File([blob], `${agent.slug}-prices.png`, { type: "image/png" }); if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${agent.store_name} prices` }); } else { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); } } catch { toast.error("Couldn't make the image."); } })()}>Price list image</button><button type="button" className="text-primary-glow" onClick={() => { void navigator.clipboard.writeText(priceList()); toast.success("Price list copied. Paste it anywhere."); }}>Copy price list</button></div>
      </div>
      <Link to="/agent/help" className="onyx-panel flex items-center gap-3 rounded-2xl p-4 hover:border-primary/40">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-primary-glow"><LifeBuoy size={19} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Help Center</span><span className="block text-[12px] text-muted-foreground">Pending balance, MTN verification, withdrawals, plans — searchable.</span></span>
        <ArrowRight size={16} className="text-primary-glow" />
      </Link>
      <div className="onyx-panel rounded-2xl p-3">
        <div className="flex items-center justify-between px-1"><p className="text-[13px] font-semibold text-foreground">Latest orders</p><Link to="/agent/orders" className="text-[12px] text-primary-glow">All orders</Link></div>
        <ul className="mt-1 divide-y divide-white/[0.06]">{orders.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No orders yet. Share your link.</li>}{pageRows.map((o) => <li key={o.order_reference} className="flex items-center justify-between py-2"><div><p className="text-[13px] font-medium text-foreground">{o.networks?.name} {o.data_products?.name?.replace(/^.*?—\s*/, "")} → {o.recipient_phone}</p><p className="text-[11px] text-faint-foreground">{fmt(o.paid_at ?? o.created_at)} · <span className={toneClass(stageOf(o).tone)}>{stageOf(o).label}</span></p></div><p className="text-[12.5px] font-semibold text-primary-glow">+{formatGHS(Number(o.agent_margin ?? 0))}</p></li>)}</ul>
        {orders.length > 5 && (
          <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">Show{[5, 10, 20].map((n) => <button key={n} type="button" onClick={() => setPerPage(n)} className={`rounded-md px-1.5 py-0.5 ${perPage === n ? "bg-primary/15 font-semibold text-primary-glow" : "hover:text-foreground"}`}>{n}</button>)}</span>
            <span className="flex items-center gap-1">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous" className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.08] disabled:opacity-40"><ChevronLeft size={14} /></button>
              <span className="px-1 tabular-nums">{page + 1} / {pages}</span>
              <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} aria-label="Next" className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.08] disabled:opacity-40"><ChevronRight size={14} /></button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small "i" next to the wallet balance: tap for a one-line explanation of the two balances. */
function BalanceTip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("touchstart", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label="What is the wallet?" aria-expanded={open} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }} className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:text-foreground"><Info size={12} /></button>
      {open && (
        <span role="tooltip" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="absolute right-0 top-6 z-20 w-[230px] rounded-xl border border-white/[0.12] bg-card p-3 text-left text-[12px] font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-xl">
          <b>Wallet</b> is money you put in to buy data at agent price. It can't be withdrawn.<br /><b>Earnings</b> is profit from your sales. That one you withdraw to MoMo.
        </span>
      )}
    </span>
  );
}
