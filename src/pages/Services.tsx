import Band from "@/components/layout/Band";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, GraduationCap, PhoneCall, Plus, UserPlus, Wallet } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { Card } from "@/components/ui/card";
import AfaForm from "@/components/services/AfaForm";
import BuySheet from "@/components/services/BuySheet";
import OrderResult from "@/components/services/OrderResult";
import { useAuth } from "@/store/auth-context";
import { useWallet } from "@/store/wallet";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";
import { metaFor } from "@/lib/site";
import { loadServices, myServiceOrders, servicesSendSms, type ServiceOrder, type ServiceProduct } from "@/lib/services";
import { markServicesVisited, scopeOf } from "@/lib/servicesNews";
import { cn } from "@/lib/utils";

/* DY Services: things DataYego sells besides data. The first screen is one card per service; tapping a card
   opens that service on its own (/services/checkers, /services/afa). The AFA page is the registration form itself,
   so everything that will be asked is on screen before any money is. The same screens run inside an agent's store
   (`store` prop): there they show only what that store sells, at its prices, under its name. Result checkers are live; the PIN is shown the
   moment payment is confirmed, sent by SMS and email, and kept under "Your checkers". */

function MyCheckers({ orders, sms, title }: { orders: ServiceOrder[]; sms: boolean; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (orders.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{title ?? (orders.some((o) => o.kind === "afa") ? "Your orders" : "Your checkers")}</h2>
      <ul className="mt-3 divide-y divide-white/[0.08]">
        {orders.map((o) => (
          <li key={o.reference} className="py-3">
            <button type="button" onClick={() => setOpen(open === o.reference ? null : o.reference)} aria-expanded={open === o.reference} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="min-w-0"><span className="block truncate text-[14.5px] font-semibold text-foreground">{o.quantity > 1 ? `${o.quantity} × ` : ""}{o.name}</span>
                <span className="block text-[12px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {o.kind === "afa" ? (o.status === "delivered" ? "registered" : o.status === "processing" ? "being registered" : o.status) : o.status === "delivered" ? "tap to see the PIN" : o.status === "paid_waiting_stock" ? "on its way" : o.status}</span></span>
              <ChevronDown size={18} className={cn("shrink-0 text-muted-foreground transition-transform", open === o.reference && "rotate-180")} aria-hidden="true" />
            </button>
            {open === o.reference && <div className="mt-3"><OrderResult order={o} sms={sms} /></div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** An agent's store, when these screens run inside one. `base` is where its services live, e.g. "/s/kofi/services". */
export interface ServicesStore { slug: string; name: string; base: string }

export default function Services({ store }: { store?: ServicesStore } = {}) {
  // Once someone has opened Services here, the "New" tag on its button has done its job.
  useEffect(() => { markServicesVisited(scopeOf(store?.slug)); }, [store?.slug]);
  const { isAuthenticated } = useAuth();
  const { balance } = useWallet();
  const { openAddMoney } = useFlows();
  const [products, setProducts] = useState<ServiceProduct[] | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [buying, setBuying] = useState<ServiceProduct | null>(null);
  const [sms, setSms] = useState(false);
  useEffect(() => { void servicesSendSms().then(setSms, () => undefined); }, []);

  const load = useCallback(() => {
    void loadServices(store?.slug).then(setProducts, () => setProducts([]));
    if (isAuthenticated) void myServiceOrders().then(setOrders, () => undefined); else setOrders([]);
  }, [isAuthenticated, store?.slug]);
  useEffect(() => { load(); }, [load]);

  const checkers = (products ?? []).filter((p) => p.kind === "checker");
  const afa = (products ?? []).find((p) => p.kind === "afa") ?? null;
  const { section } = useParams();
  const view = section === "checkers" || (section === "afa" && afa) ? section : "home";
  const base = store?.base ?? "/services";
  const context = store ? { store: store.slug } : {};
  const walletName = store ? "Wallet" : "DataYego wallet";
  // A store shows only what it sells; the main site also shows what is coming.
  const cards = [
    ...(!store || checkers.length > 0 ? [{ key: "checkers", icon: GraduationCap, title: "Result checkers", text: "WASSCE and BECE checker PINs, shown the moment you pay.", to: `${base}/checkers` as string | null }] : []),
    ...(afa ? [{ key: "afa", icon: UserPlus, title: afa.name, text: afa.blurb, to: `${base}/afa` as string | null }] : store ? [] : [{ key: "afa", icon: UserPlus, title: "MTN AFA registration", text: "Put an MTN number on AFA for cheaper calls.", to: null }]),
    ...(store ? [] : [{ key: "airtime", icon: PhoneCall, title: "Airtime", text: "Top up MTN, Telecel and AirtelTigo airtime.", to: null }]),
  ];
  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {!store && <Seo {...metaFor("/services")} />}
      {store ? (
        <header className="px-1 pt-1">
          {view !== "home" && <Link to={base} className="mb-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary-glow"><ArrowLeft size={15} aria-hidden="true" />All services</Link>}
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground">{view === "checkers" ? "Result checkers" : view === "afa" && afa ? afa.name : store ? "Services" : "DY Services"}</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{view === "checkers" ? "Serial number and PIN, shown the moment you pay." : view === "afa" && afa ? afa.blurb : store ? `More from ${store.name}. Pick a service.` : "More from DataYego, with the same account and wallet. Pick a service."}</p>
          {view === "afa" && afa && <p className="mt-3 flex items-baseline gap-2"><span className="font-display text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{formatGHS(afa.price)}</span><span className="text-[13px] text-muted-foreground">to register one number</span></p>}
        </header>
      ) : (
        <Band
          kicker={view !== "home" ? <Link to={base} className="inline-flex items-center gap-1.5"><ArrowLeft size={15} aria-hidden="true" />All services</Link> : undefined}
          title={view === "checkers" ? "Result checkers" : view === "afa" && afa ? afa.name : "DY Services"}
          sub={view === "checkers" ? "Serial number and PIN, shown the moment you pay." : view === "afa" && afa ? afa.blurb : "More from DataYego, with the same account and wallet. Pick a service."}
        >
          {view === "afa" && afa && <p className="mt-3 flex items-baseline gap-2"><span className="font-display text-[28px] font-extrabold leading-none tracking-tight tabular-nums">{formatGHS(afa.price)}</span><span className="text-[13px] font-semibold text-white/80">to register one number</span></p>}
        </Band>
      )}

      {isAuthenticated && <Card className="flex items-center justify-between gap-3 p-4">
        <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Wallet size={18} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-[12px] text-muted-foreground">Wallet balance</span><span className="block font-display text-[19px] font-semibold text-foreground">{formatGHS(balance)}</span></span></span>
        <button type="button" onClick={openAddMoney} className="onyx-btn-ghost flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[13.5px]"><Plus size={15} />Top up</button>
      </Card>}

      {view === "home" && store && products !== null && cards.length === 0 && <Card className="p-5 text-[13.5px] text-muted-foreground">No services are on sale here right now.</Card>}
      {view === "home" && <ul className="grid grid-cols-2 gap-3">
        {cards.map(({ key, icon: Icon, title, text, to }) => {
          const inner = <>
            <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", to ? "bg-primary/[0.12] text-primary-glow" : "bg-white/[0.06] text-muted-foreground")}><Icon size={21} aria-hidden="true" /></span>
            <span className="mt-3 block font-display text-[16.5px] font-semibold leading-snug tracking-tight text-foreground">{title}</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">{text}</span>
            <span className={cn("mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold", to ? "text-primary-glow" : "text-muted-foreground")}>{to ? <>Open<ArrowRight size={15} aria-hidden="true" /></> : "Coming soon"}</span>
          </>;
          return <li key={key}>{to
            ? <Link to={to} className="block h-full"><Card className="h-full p-4 transition-colors hover:border-primary-glow/40">{inner}</Card></Link>
            : <Card className="h-full p-4 opacity-75">{inner}</Card>}</li>;
        })}
      </ul>}

      {view === "checkers" && <Card className="p-5 sm:p-6">
        {products === null ? <p className="text-[13.5px] text-muted-foreground">Loading…</p> : checkers.length === 0 ? <p className="text-[13.5px] text-muted-foreground">Result checkers aren't available right now. Please check back soon.</p> : (
          <ul className="space-y-2.5">
            {checkers.map((p) => (
              <li key={p.code} className="rounded-2xl border border-white/[0.09] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{p.name}</p><p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{p.blurb}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3"><span className="font-display text-[20px] font-semibold text-foreground">{formatGHS(p.price)}</span>
                  <button type="button" onClick={() => setBuying(p)} className="onyx-btn-primary px-6 py-2.5 text-[14px]">Buy</button></div>
              </li>
            ))}
          </ul>
        )}
      </Card>}

      {view === "afa" && afa && <AfaForm product={afa} sms={sms} onBought={load} context={context} walletName={walletName} boxed />}

      {view === "afa" ? <MyCheckers orders={orders.filter((o) => o.kind === "afa")} sms={sms} title="Your AFA registrations" />
        : view === "checkers" ? <MyCheckers orders={orders.filter((o) => o.kind !== "afa")} sms={sms} title="Your checkers" />
        : <MyCheckers orders={orders} sms={sms} />}
      {!isAuthenticated && <p className="pb-2 text-center text-[13px] text-muted-foreground">Bought one before? <Link to={store ? store.base.replace(/\/services$/, "/sign-in") : "/auth"} className="font-semibold text-primary-glow">Sign in</Link> to see your orders, or open the link in your email.</p>}

      <BuySheet product={buying} sms={sms} onClose={() => setBuying(null)} onBought={load} context={context} walletName={walletName} />
    </div>
  );
}
