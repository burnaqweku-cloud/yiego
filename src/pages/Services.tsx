import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, GraduationCap, Minus, PhoneCall, Plus, UserPlus, Wallet } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Card } from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import { FlowHeader, ProcessingView } from "@/components/flows/flow-parts";
import AfaSheet from "@/components/services/AfaSheet";
import OrderResult from "@/components/services/OrderResult";
import PayWith, { type Pay } from "@/components/services/PayWith";
import { useAuth } from "@/store/auth-context";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";
import { metaFor } from "@/lib/site";
import { buyServiceWithWallet, loadServices, myServiceOrders, serviceFee, servicesSendSms, startServiceCheckout, type ServiceOrder, type ServiceProduct } from "@/lib/services";
import { cn } from "@/lib/utils";

/* DY Services: things DataYego sells besides data. The first screen is one card per service; tapping a card
   opens that service on its own (/services/checkers, /services/afa). Result checkers are live; the PIN is shown the
   moment payment is confirmed, sent by SMS and email, and kept under "Your checkers". */

const MAX_QUANTITY = 1000;
const validPhone = (v: string) => /^0\d{9}$/.test(v.replace(/\D/g, ""));

function BuySheet({ product, sms, onClose, onBought }: { product: ServiceProduct | null; sms: boolean; onClose: () => void; onBought: () => void }) {
  const { isAuthenticated } = useAuth();
  const { balance, refresh } = useWallet();
  const { profile } = useProfile();
  const { openAddMoney } = useFlows();
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pay, setPay] = useState<Pay>("paystack");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<ServiceOrder | null>(null);

  useEffect(() => {
    if (!product) return;
    setQuantity(1); setOrder(null); setBusy(false); setEmail("");
    setPhone(isAuthenticated && validPhone(profile.phone ?? "") ? profile.phone.replace(/\D/g, "") : "");
    setPay(isAuthenticated && balance >= product.price ? "wallet" : "paystack");
    // Only when a different product is opened: typing must not be reset by a balance refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.code]);

  if (!product) return <Modal open={false} onClose={onClose} label="Buy">{null}</Modal>;
  const base = Math.round(product.price * quantity * 100) / 100;
  const fee = pay === "paystack" ? serviceFee(base) : 0;
  const short = pay === "wallet" && balance < base;

  const submit = async () => {
    if (!validPhone(phone)) { toast.error("Enter the 10-digit Ghana number that should get the SMS."); return; }
    // Without SMS, a guest's email is the only copy they keep once this page is closed.
    if (!isAuthenticated && !sms && !email) { toast.error("Enter your email so we can send you the serial number and PIN."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("That email doesn't look right. Please check it."); return; }
    setBusy(true);
    if (pay === "wallet") {
      const r = await buyServiceWithWallet(product.code, quantity, phone);
      setBusy(false);
      if (!r.order) { toast.error(r.error ?? "Something went wrong. Please try again."); return; }
      setOrder(r.order); void refresh(); onBought();
      return;
    }
    const r = await startServiceCheckout({ productCode: product.code, quantity, phone, email: email || undefined });
    if (!r.data) { setBusy(false); toast.error(r.error ?? "We couldn't open the payment page. Please try again."); return; }
    window.location.assign(r.data.authorizationUrl);
  };

  return (
    <Modal open onClose={onClose} label={product.name}>
      <FlowHeader title={order ? (order.status === "delivered" ? "Here you go" : "Order received") : product.name} subtitle={order ? undefined : `${formatGHS(product.price)} each`} onClose={onClose} />
      {busy ? <ProcessingView label={pay === "wallet" ? "Placing your order…" : "Opening the payment page…"} /> : order ? (
        <div className="space-y-4 px-5 pb-6 pt-5"><OrderResult order={order} sms={sms} /><button type="button" className="onyx-btn-primary w-full" onClick={onClose}>Done</button></div>
      ) : (
        <div className="space-y-4 px-5 pb-6 pt-5">
          <div>
            <p className="text-[13px] font-semibold text-foreground">How many?</p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" aria-label="One fewer" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="onyx-iconbtn h-12 w-12 shrink-0 rounded-xl disabled:opacity-40"><Minus size={18} /></button>
              <input className="onyx-field h-12 w-full text-center text-[17px] font-semibold" inputMode="numeric" aria-label="How many" value={String(quantity)}
                onChange={(e) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
              <button type="button" aria-label="One more" disabled={quantity >= MAX_QUANTITY} onClick={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))} className="onyx-iconbtn h-12 w-12 shrink-0 rounded-xl disabled:opacity-40"><Plus size={18} /></button>
            </div>
          </div>
          <label className="block"><span className="text-[13px] font-semibold text-foreground">{sms ? "Phone number for the SMS" : "Your phone number"}</span>
            <input className="onyx-field mt-2 w-full" inputMode="numeric" autoComplete="tel" placeholder="024 000 0000" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 13))} />
            <span className="mt-1 block text-[12px] text-muted-foreground">{sms ? "The serial number and PIN are shown here straight away and also sent to this number." : "So we can reach you about this order. The serial number and PIN are shown here straight away."}</span></label>
          {!isAuthenticated && <label className="block"><span className="text-[13px] font-semibold text-foreground">Email {sms && <span className="font-normal text-muted-foreground">(optional)</span>}</span>
            <input className="onyx-field mt-2 w-full" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
            {!sms && <span className="mt-1 block text-[12px] text-muted-foreground">We send the serial number and PIN here too, so you can find them again.</span>}</label>}
          <PayWith pay={pay} onChange={setPay} base={base} balance={balance} signedIn={isAuthenticated} />
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[14px]"><span className="text-muted-foreground">You pay</span><span className="font-display text-[20px] font-semibold text-foreground">{formatGHS(base + fee)}</span></div>
          {short
            ? <button type="button" className="onyx-btn-primary flex w-full items-center justify-center gap-2" onClick={() => { onClose(); openAddMoney(); }}><Plus size={16} />Top up {formatGHS(base - balance)} or more</button>
            : <button type="button" className="onyx-btn-primary w-full" onClick={() => void submit()}>{pay === "wallet" ? `Pay ${formatGHS(base)} from wallet` : `Pay ${formatGHS(base + fee)}`}</button>}
        </div>
      )}
    </Modal>
  );
}

function MyCheckers({ orders, sms }: { orders: ServiceOrder[]; sms: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (orders.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{orders.some((o) => o.kind === "afa") ? "Your orders" : "Your checkers"}</h2>
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

export default function Services() {
  const { isAuthenticated } = useAuth();
  const { balance } = useWallet();
  const { openAddMoney } = useFlows();
  const [products, setProducts] = useState<ServiceProduct[] | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [buying, setBuying] = useState<ServiceProduct | null>(null);
  const [sms, setSms] = useState(false);
  useEffect(() => { void servicesSendSms().then(setSms, () => undefined); }, []);

  const load = useCallback(() => {
    void loadServices().then(setProducts, () => setProducts([]));
    if (isAuthenticated) void myServiceOrders().then(setOrders, () => undefined); else setOrders([]);
  }, [isAuthenticated]);
  useEffect(() => { load(); }, [load]);

  const checkers = (products ?? []).filter((p) => p.kind === "checker");
  const afa = (products ?? []).find((p) => p.kind === "afa") ?? null;
  const [registering, setRegistering] = useState(false);
  const { section } = useParams();
  const view = section === "checkers" || (section === "afa" && afa) ? section : "home";
  const cards = [
    { key: "checkers", icon: GraduationCap, title: "Result checkers", text: "WASSCE and BECE checker PINs, shown the moment you pay.", to: "/services/checkers" },
    ...(afa ? [{ key: "afa", icon: UserPlus, title: afa.name, text: afa.blurb, to: "/services/afa" }] : [{ key: "afa", icon: UserPlus, title: "MTN AFA registration", text: "Put an MTN number on AFA for cheaper calls.", to: null }]),
    { key: "airtime", icon: PhoneCall, title: "Airtime", text: "Top up MTN, Telecel and AirtelTigo airtime.", to: null },
  ];
  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      <Seo {...metaFor("/services")} />
      <header className="px-1 pt-1">
        {view !== "home" && <Link to="/services" className="mb-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary-glow"><ArrowLeft size={15} aria-hidden="true" />All services</Link>}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground">{view === "checkers" ? "Result checkers" : view === "afa" && afa ? afa.name : "DY Services"}</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{view === "checkers" ? "Serial number and PIN, shown the moment you pay." : view === "afa" && afa ? afa.blurb : "More from DataYego, with the same account and wallet. Pick a service."}</p>
      </header>

      {isAuthenticated && <Card className="flex items-center justify-between gap-3 p-4">
        <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Wallet size={18} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-[12px] text-muted-foreground">Wallet balance</span><span className="block font-display text-[19px] font-semibold text-foreground">{formatGHS(balance)}</span></span></span>
        <button type="button" onClick={openAddMoney} className="onyx-btn-ghost flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[13.5px]"><Plus size={15} />Top up</button>
      </Card>}

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

      {view === "afa" && afa && <Card className="p-5 sm:p-6">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">You'll need the person's Ghana Card details. Fill in a short form, pay, and we register the number for you.</p>
        <div className="mt-3 flex items-center justify-between gap-3"><span className="font-display text-[20px] font-semibold text-foreground">{formatGHS(afa.price)}</span>
          <button type="button" onClick={() => setRegistering(true)} className="onyx-btn-primary px-6 py-2.5 text-[14px]">Register</button></div>
      </Card>}

      <MyCheckers orders={orders} sms={sms} />
      {!isAuthenticated && <p className="pb-2 text-center text-[13px] text-muted-foreground">Bought one before? <Link to="/auth" className="font-semibold text-primary-glow">Sign in</Link> to see your orders, or open the link in your email.</p>}

      <BuySheet product={buying} sms={sms} onClose={() => setBuying(null)} onBought={load} />
      <AfaSheet product={registering ? afa : null} sms={sms} onClose={() => setRegistering(false)} onBought={load} />
    </div>
  );
}
