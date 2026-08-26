import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock3, Copy, CreditCard, ListChecks, Share2, WalletCards, Wifi, Zap } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import { NETWORKS, type Bundle, type Network, type NetworkId } from "@/data/bundles";
import { useSupplierChoices, type SupplierChoice } from "@/hooks/useSupplierChoices";
import ImportantNotice from "@/components/shop/ImportantNotice";
import DeliveryProgress from "@/components/shop/DeliveryProgress";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { useAuth } from "@/store/auth-context";
import { formatGHS } from "@/lib/format";
import { paystackFee } from "@/lib/fees";
import {
  createGuestDataPayment,
  listPendingOrders,
  loadPhase1Products,
  orderPaymentAction,
  prepareDataOrder,
  type Phase1Product,
  type PreparedOrderSummary,
} from "@/lib/phase1-api";

type Step = "supplier" | "network" | "bundle" | "phone" | "review" | "pending" | "payOrder" | "shared" | "processing" | "success";
type PaymentMethod = "wallet" | "paystack" | "shared";

/** Where the flow should open when the shop already knows what the shopper
 *  wants. `bundle` identifies a row only — price, validity and product id are
 *  still resolved from the flow's own catalogue load, so there is one source
 *  of truth for what actually gets ordered. Omit it and the flow opens exactly
 *  where it always has. */
export type BuyPreselect =
  | { kind: "bundle"; networkId: NetworkId; productCode: string; supplierId?: string }
  | { kind: "payOrder" };

interface ActiveOrder {
  id?: string;
  orderReference: string;
  recipientPhone: string;
  amount: number;
  networkName: string;
  bundleName: string;
  expiresAt: string | null;
  paymentArrangement?: string;
  paymentStatus?: string;
  status?: string;
}

function netShort(n: Network): string {
  if (n.id === "at") return "AT";
  return n.name.slice(0, 3).toUpperCase();
}

function NetLogo({ network }: { network: Network }) {
  return <span className="onyx-netlogo grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white/[0.03] text-[12px] font-bold" style={{ color: network.color, borderColor: `${network.color}55` }}>{netShort(network)}</span>;
}

function BundleTag({ tag }: { tag: NonNullable<Bundle["tag"]> }) {
  return <span className="rounded-full border border-primary-glow/20 bg-primary/[0.12] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-primary-glow">{tag}</span>;
}

/** The catalogue stores "Supplier terms" when the network sets the window
 *  itself — say that in words a customer understands. Display only. */
function validityLabel(validity: string): string {
  return /supplier terms/i.test(validity) ? "Validity set by the network" : `Valid ${validity}`;
}

function expiryLabel(value: string | null) {
  if (!value) return "No expiry recorded";
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.max(1, Math.floor((ms % 3_600_000) / 60_000));
  return hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
}

function pendingToActive(order: PreparedOrderSummary): ActiveOrder {
  return {
    id: order.id,
    orderReference: order.order_reference,
    recipientPhone: order.recipient_phone,
    amount: Number(order.amount),
    networkName: order.networks?.name ?? "Network",
    bundleName: order.data_products?.name ?? "Data bundle",
    expiresAt: order.payment_expires_at,
    paymentArrangement: order.payment_arrangement,
    paymentStatus: order.payment_status,
    status: order.status,
  };
}


/** The chosen plan's delivery status, in the customer's words. Empty when the
 *  team has written nothing and nothing has been measured, so a plan never
 *  shows a hollow promise. */
function DeliveryStatusPanel({ supplier }: { supplier: SupplierChoice }) {
  if (!supplier.banner && supplier.rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Delivery status</p>
      {supplier.banner && (
        <p className={`mt-2 text-sm leading-6 ${supplier.banner.tone === "slow" ? "text-amber" : "text-foreground"}`}>
          {supplier.banner.text}
        </p>
      )}
      {supplier.rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="mt-2.5 flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <span className="font-mono text-[13px] text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function BuyDataFlow({ open, preselect, onClose, onAddMoney }: { open: boolean; preselect?: BuyPreselect | null; onClose: () => void; onAddMoney: () => void }) {
  const { balance } = useWallet();
  const { profile } = useProfile();
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState<Step>("supplier");
  const { suppliers, loading: suppliersLoading } = useSupplierChoices();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  // The default is the first supplier the backend ranks; the customer can
  // switch, and switching is what re-prices the bundle list.
  const chosenSupplier: SupplierChoice | null =
    suppliers.find((s) => s.id === supplierId) ?? suppliers[0] ?? null;
  const [network, setNetwork] = useState<Network | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [phone, setPhone] = useState(profile.phone);
  const [guestEmail, setGuestEmail] = useState(profile.email);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wallet");
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PreparedOrderSummary[]>([]);
  const [highlightOrder, setHighlightOrder] = useState<string | null>(null);
  const [lookupReference, setLookupReference] = useState("");
  const [receiptRef, setReceiptRef] = useState<string | null>(null);

  useEffect(() => {
    setStep("supplier"); setNetwork(null); setBundle(null); setPhone(profile.phone);
    setGuestEmail(user?.email ?? profile.email); setPaymentMethod("wallet");
    setActiveOrder(null); setHighlightOrder(null); setLookupReference(""); setReceiptRef(null);
  }, [open, profile.email, profile.phone, user?.email]);

  useEffect(() => {
    let mounted = true;
    if (!open) return;
    setProductsLoading(true);
    void loadPhase1Products().then((result) => {
      if (!mounted) return;
      setProducts(result.data);
      setProductsError(result.error ? "Bundles are temporarily unavailable. Please try again." : result.data.length ? null : "No data bundles are available right now.");
      setProductsLoading(false);
    });
    if (isAuthenticated) void refreshPending();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthenticated]);

  // Opened straight on the Order ID lookup from the shop.
  useEffect(() => {
    if (open && preselect?.kind === "payOrder") setStep("payOrder");
  }, [open, preselect]);

  // Opened on a specific bundle from the shop grid: adopt the supplier tab the
  // shopper was on, then skip the network and bundle steps. If the row has
  // since left the catalogue we simply stay on step one rather than ordering
  // something the shopper did not pick.
  useEffect(() => {
    if (!open || preselect?.kind !== "bundle") return;
    // The grid names a supplier; wait until that list has arrived so the
    // bundle is looked up at that supplier's own prices.
    if (preselect.supplierId) {
      if (suppliersLoading) return;
      const preferred = suppliers.find((s) => s.id === preselect.supplierId);
      if (preferred && supplierId !== preferred.id) {
        setSupplierId(preferred.id);
        return; // effect re-runs with the right supplier selected
      }
    } else if (products.length === 0) return;
    const chosenNetwork = NETWORKS.find((n) => n.id === preselect.networkId);
    const chosenBundle = bundlesFor(preselect.networkId).find((b) => b.id === preselect.productCode);
    if (!chosenNetwork || !chosenBundle) return;
    setNetwork(chosenNetwork);
    setBundle(chosenBundle);
    setStep("phone");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselect, products, suppliers, suppliersLoading, supplierId]);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length === 10 && digits.startsWith("0");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const price = activeOrder?.amount ?? bundle?.price ?? 0;
  const canPay = balance >= price;
  // A Paystack payment (guest, or a signed-in user choosing Paystack) carries a
  // 4% fee on top of the bundle price. Paying from the wallet has no fee.
  const feeApplies = !isAuthenticated || paymentMethod === "paystack";
  const fee = feeApplies ? paystackFee(price) : 0;
  const payTotal = Math.round((price + fee) * 100) / 100;

  /* Each supplier sells its own list at its own prices, so the bundles shown
     depend on which one is selected. */
  function bundlesFor(networkId: Network["id"]): Bundle[] {
    if (chosenSupplier) {
      return chosenSupplier.bundles
        .filter((offer) => offer.networkId === networkId)
        .map((offer) => ({
          id: offer.productCode,
          size: offer.size,
          validity: offer.validity ?? "Supplier terms",
          price: offer.price,
          tag: offer.price <= 10 ? "Popular" : offer.price >= 40 ? "Best value" : undefined,
        }));
    }
    const prefix = networkId === "mtn" ? "mtn" : networkId === "telecel" ? "tel" : "at";
    return products.filter((product) => product.app_product_code?.startsWith(prefix)).map((product) => ({
      id: product.app_product_code ?? product.id,
      size: product.name.replace(/^.*?—\s*/, ""),
      validity: product.validity ?? "Supplier terms",
      price: Number(product.customer_price),
      tag: Number(product.customer_price) <= 10 ? "Popular" : Number(product.customer_price) >= 40 ? "Best value" : undefined,
    }));
  }

  async function refreshPending() {
    if (!isAuthenticated) return;
    const result = await listPendingOrders();
    if (!result.error && result.data?.data) setPendingOrders(result.data.data);
  }

  async function continueFromPhone() {
    if (!network || !bundle || !phoneValid) return;
    if (!isAuthenticated) { setStep("review"); return; }
    setStep("processing");
    const result = await prepareDataOrder({ productId: bundle.id, recipientPhone: digits, supplierId: chosenSupplier?.id });
    if (result.error || !result.data?.data) {
      toast.error(result.error ?? result.data?.error ?? "Could not create the order"); setStep("phone"); return;
    }
    const prepared = result.data.data;
    if (prepared.existing) {
      await refreshPending(); setHighlightOrder(prepared.orderReference); setStep("pending");
      toast.info("An active order already exists for this recipient."); return;
    }
    setActiveOrder({ orderReference: prepared.orderReference, recipientPhone: digits, amount: Number(prepared.amount ?? bundle.price), networkName: network.name, bundleName: bundle.size, expiresAt: prepared.expiresAt ?? null, paymentArrangement: "unselected", paymentStatus: "pending", status: "awaiting_payment" });
    setStep("review");
  }

  async function runOrderAction(action: string, order = activeOrder) {
    if (!order) return;
    setStep("processing");
    const result = await orderPaymentAction<{ authorizationUrl?: string; orderReference?: string }>(action, order.orderReference);
    if (result.error || result.data?.error) {
      toast.error(result.data?.error ?? result.error ?? "The order action failed");
      setStep(action === "cancel" ? "pending" : "review"); return;
    }
    if (action === "pay_paystack" && result.data?.data?.authorizationUrl) {
      window.location.assign(result.data.data.authorizationUrl); return;
    }
    if (action === "share") { setStep("shared"); await refreshPending(); return; }
    if (action === "cancel") { await refreshPending(); setStep("pending"); toast.success("Order cancelled."); return; }
    setReceiptRef(order.orderReference); setStep("success");
  }

  async function lookupOrder() {
    const reference = lookupReference.trim().toUpperCase();
    if (!reference) { toast.error("Enter an Order ID"); return; }
    setStep("processing");
    const result = await orderPaymentAction<PreparedOrderSummary>("lookup", reference);
    if (result.error || result.data?.error || !result.data?.data) {
      toast.error(result.data?.error ?? result.error ?? "Could not find this order"); setStep("payOrder"); return;
    }
    setActiveOrder(pendingToActive(result.data.data)); setPaymentMethod("wallet"); setStep("review");
  }

  async function startGuestPaystack() {
    if (!bundle || !emailValid) { toast.error("Enter a valid email for your receipt"); return; }
    setStep("processing");
    const result = await createGuestDataPayment({ productId: bundle.id, recipientPhone: digits, supplierId: chosenSupplier?.id, guestEmail: guestEmail.trim(), guestPhone: digits });
    if (result.error || !result.data?.data?.authorizationUrl) { toast.error(result.error ?? "Could not start Paystack payment"); setStep("review"); return; }
    window.location.assign(result.data.data.authorizationUrl);
  }

  const reviewRows = useMemo(() => {
    if (activeOrder) return [
      { label: "Network", value: activeOrder.networkName },
      { label: "Bundle", value: activeOrder.bundleName },
      { label: "Recipient", value: activeOrder.recipientPhone },
    ];
    return [
      { label: "Network", value: network?.name ?? "" },
      { label: "Bundle", value: bundle ? `${bundle.size} · ${validityLabel(bundle.validity).toLowerCase()}` : "" },
      { label: "Recipient", value: digits },
      ...(!isAuthenticated ? [{ label: "Receipt email", value: guestEmail.trim() }] : []),
    ];
  }, [activeOrder, bundle, digits, guestEmail, isAuthenticated, network]);

  return <Modal open={open} onClose={onClose} label="Buy data">
    {step === "supplier" && <><FlowHeader title="Buy data" subtitle="Choose your plan" onClose={onClose} /><div className="space-y-2.5 px-5 pb-6 pt-4">
      {suppliersLoading && <p className="px-1 pb-2 text-[12px] text-faint-foreground">Loading plans...</p>}
      {!suppliersLoading && suppliers.length === 0 && <p className="rounded-xl border border-danger/20 bg-danger/[0.08] p-3 text-xs text-ink-rose">No plans are available right now. Please try again shortly.</p>}
      {suppliers.map((option) => <SelectRow
        key={option.id}
        selected={chosenSupplier?.id === option.id}
        onClick={() => { setSupplierId(option.id); setNetwork(null); setBundle(null); setStep("network"); }}
        leading={<span className="onyx-tile-icon"><Zap size={18} /></span>}
        title={option.name}
        subtitle={option.blurb ?? `${option.bundles.length} bundle${option.bundles.length === 1 ? "" : "s"} available`}
        trailing={<ChevronRight size={18} className="text-faint-foreground" />}
      />)}
      {chosenSupplier && <DeliveryStatusPanel supplier={chosenSupplier} />}
    </div></>}
    {step === "network" && <><FlowHeader title={chosenSupplier ? chosenSupplier.name : "Buy data"} subtitle="Choose what you want to do" onBack={() => setStep("supplier")} onClose={onClose} /><div className="space-y-2.5 px-5 pb-6 pt-4">
      {productsLoading && <p className="px-1 pb-2 text-[12px] text-faint-foreground">Loading available bundles...</p>}
      {productsError && <p className="rounded-xl border border-danger/20 bg-danger/[0.08] p-3 text-xs text-ink-rose">{productsError}</p>}
      {!productsError && NETWORKS.map((n) => <SelectRow key={n.id} onClick={() => { setNetwork(n); setBundle(null); setStep("bundle"); }} leading={<NetLogo network={n} />} title={n.name} subtitle="Data bundles" trailing={<ChevronRight size={18} className="text-faint-foreground" />} />)}
      {isAuthenticated && <><div className="my-3 border-t border-white/[0.06]" /><SelectRow onClick={() => setStep("payOrder")} leading={<span className="onyx-tile-icon"><CreditCard size={18} /></span>} title="Pay for an order" subtitle="Enter an Order ID and complete its payment" trailing={<ChevronRight size={18} className="text-faint-foreground" />} />
      {pendingOrders.length > 0 && <SelectRow onClick={() => setStep("pending")} leading={<span className="onyx-tile-icon"><ListChecks size={18} /></span>} title="Pending orders" subtitle={`${pendingOrders.length} active order${pendingOrders.length === 1 ? "" : "s"} to continue or track`} trailing={<ChevronRight size={18} className="text-faint-foreground" />} />}</>}
    </div></>}

    {step === "bundle" && network && <><FlowHeader title={`${network.name} bundles`} subtitle="Choose a data bundle" onBack={() => setStep("network")} onClose={onClose} /><div className="space-y-2.5 px-5 pb-6 pt-4">{bundlesFor(network.id).map((b) => <SelectRow key={b.id} onClick={() => { setBundle(b); setStep("phone"); }} leading={<span className="onyx-tile-icon"><Wifi size={18} /></span>} title={<span className="flex items-center gap-2">{b.size}{b.tag && <BundleTag tag={b.tag} />}</span>} subtitle={validityLabel(b.validity)} trailing={<span className="font-display text-[15px] font-semibold text-white">{formatGHS(b.price)}</span>} />)}</div></>}

    {step === "phone" && network && bundle && <><FlowHeader title="Recipient" subtitle={`${network.name} · ${bundle.size}`} onBack={() => setStep("bundle")} onClose={onClose} /><div className="space-y-4 px-5 pb-2 pt-5"><div><label htmlFor="buydata-phone" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Phone number</label><input id="buydata-phone" className="onyx-field mt-2 text-[16px] tracking-wide" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="024 000 0000" />{phone.length > 0 && !phoneValid && <p className="mt-1.5 text-[12px] text-danger">Enter a valid 10-digit Ghana number.</p>}</div>{!isAuthenticated && <div><label htmlFor="buydata-email" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Email for receipt</label><input id="buydata-email" className="onyx-field mt-2" inputMode="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} /></div>}<div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"><div><p className="text-[13.5px] font-semibold">{network.name} · {bundle.size}</p><p className="text-[12px] text-faint-foreground">{validityLabel(bundle.validity)}</p></div><span className="font-display text-[16px] font-semibold">{formatGHS(bundle.price)}</span></div><ImportantNotice compact network={network.id} /></div><FlowFooter><button type="button" className="onyx-btn-primary w-full disabled:opacity-40" disabled={!phoneValid || (!isAuthenticated && !emailValid)} onClick={() => void continueFromPhone()}>Continue</button></FlowFooter></>}

    {step === "review" && (activeOrder || (network && bundle)) && <><FlowHeader title="Review & pay" onBack={() => setStep(activeOrder ? "pending" : "phone")} onClose={onClose} /><div className="space-y-4 px-5 pb-2 pt-5"><div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">{reviewRows.map((r, i) => <div key={r.label} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? "border-t border-white/[0.05]" : ""}`}><span className="text-[12.5px] text-faint-foreground">{r.label}</span><span className="text-right text-[13.5px] font-semibold">{r.value}</span></div>)}{activeOrder && <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-3.5 py-3"><span className="text-[12.5px] text-faint-foreground">Order ID</span><button type="button" onClick={() => { void navigator.clipboard.writeText(activeOrder.orderReference); toast.success("Order ID copied"); }} className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-primary-glow">{activeOrder.orderReference}<Copy size={14} /></button></div>}{fee > 0 && <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-3.5 py-2.5"><span className="text-[12.5px] text-faint-foreground">Data</span><span className="text-[13.5px] font-semibold">{formatGHS(price)}</span></div>}{fee > 0 && <div className="flex items-center justify-between gap-4 px-3.5 py-2.5"><span className="text-[12.5px] text-faint-foreground">Fee</span><span className="text-[13.5px] font-semibold">{formatGHS(fee)}</span></div>}<div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-3.5"><span className="text-[13px] font-semibold">{fee > 0 ? "Total" : "Amount"}</span><span className="font-display text-[18px] font-semibold">{formatGHS(payTotal)}</span></div></div>
      <DeliveryProgress compact />
      {activeOrder && <div className="flex items-center gap-2 rounded-xl border border-primary-glow/15 bg-primary/[0.06] px-3 py-2.5 text-xs text-muted-foreground"><Clock3 size={15} className="text-primary-glow" />{expiryLabel(activeOrder.expiresAt)}</div>}
      {isAuthenticated ? <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5"><button type="button" onClick={() => setPaymentMethod("wallet")} className={`rounded-xl p-3 text-left ${paymentMethod === "wallet" ? "border border-primary-glow/25 bg-primary/[0.12]" : ""}`}><span className="flex items-center gap-2 font-semibold"><WalletCards size={17} />DataYego Wallet</span><span className="mt-1 block text-xs text-faint-foreground">{formatGHS(balance)} available</span></button><button type="button" onClick={() => setPaymentMethod("paystack")} className={`rounded-xl p-3 text-left ${paymentMethod === "paystack" ? "border border-primary-glow/25 bg-primary/[0.12]" : ""}`}><span className="flex items-center gap-2 font-semibold"><CreditCard size={17} />Paystack</span><span className="mt-1 block text-xs text-faint-foreground">Mobile Money or card</span></button>{activeOrder && activeOrder.paymentArrangement !== "shared" && <button type="button" onClick={() => setPaymentMethod("shared")} className={`rounded-xl p-3 text-left ${paymentMethod === "shared" ? "border border-primary-glow/25 bg-primary/[0.12]" : ""}`}><span className="flex items-center gap-2 font-semibold"><Share2 size={17} />Ask another DataYego user to pay</span><span className="mt-1 block text-xs text-faint-foreground">Share this Order ID. The recipient and bundle cannot be changed.</span></button>}</div> : null}
    </div><FlowFooter>{!isAuthenticated ? <button type="button" className="onyx-btn-primary w-full" onClick={() => void startGuestPaystack()}>Pay {formatGHS(payTotal)} with Paystack</button> : paymentMethod === "shared" ? <button type="button" className="onyx-btn-primary w-full" onClick={() => void runOrderAction("share")}>Create payment request</button> : paymentMethod === "wallet" && !canPay ? <button type="button" className="onyx-btn-primary w-full" onClick={onAddMoney}>Add money</button> : <button type="button" className="onyx-btn-primary w-full" onClick={() => void runOrderAction(paymentMethod === "wallet" ? "pay_wallet" : "pay_paystack")}>Pay {formatGHS(payTotal)} with {paymentMethod === "wallet" ? "wallet" : "Paystack"}</button>}</FlowFooter></>}

    {step === "pending" && <><FlowHeader title="Pending orders" subtitle="Continue, share, track or cancel" onBack={() => setStep("network")} onClose={onClose} /><div className="space-y-3 px-5 pb-6 pt-4">{pendingOrders.length === 0 ? <div className="py-12 text-center"><ListChecks className="mx-auto text-faint-foreground" /><p className="mt-3 font-semibold">No pending orders</p></div> : pendingOrders.map((order) => <article key={order.id} className={`rounded-2xl border p-4 transition ${highlightOrder === order.order_reference ? "border-primary-glow/50 bg-primary/[0.1] shadow-[0_0_0_3px_rgba(60,240,170,0.08)]" : "border-white/[0.08] bg-white/[0.025]"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.networks?.name ?? "Network"} · {order.data_products?.name ?? "Data bundle"}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone} · {formatGHS(Number(order.amount))}</p></div><button type="button" onClick={() => { void navigator.clipboard.writeText(order.order_reference); toast.success("Order ID copied"); }} className="onyx-iconbtn h-9 w-9"><Copy size={15} /></button></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-primary-glow">{order.payment_arrangement === "shared" ? "Waiting for another user" : order.payment_status === "succeeded" ? "Payment received" : "Waiting for payment"}</span><span className="text-faint-foreground">{expiryLabel(order.payment_expires_at)}</span></div><p className="mt-2 font-mono text-xs text-muted-foreground">{order.order_reference}</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" className="onyx-btn-primary px-3 py-2 text-xs" onClick={() => { setActiveOrder(pendingToActive(order)); setPaymentMethod("wallet"); setStep("review"); }}>{order.payment_status === "succeeded" ? "View progress" : "Continue"}</button>{order.payment_status !== "succeeded" && <button type="button" className="onyx-btn-ghost px-3 py-2 text-xs" onClick={() => { setActiveOrder(pendingToActive(order)); void runOrderAction("cancel", pendingToActive(order)); }}>Cancel order</button>}</div></article>)}</div></>}

    {step === "payOrder" && <><FlowHeader title="Pay for an order" subtitle="Enter the Order ID you received" onBack={() => setStep("network")} onClose={onClose} /><div className="space-y-4 px-5 pb-6 pt-5"><label><span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Order ID</span><input className="onyx-field mt-2 font-mono uppercase" value={lookupReference} onChange={(e) => setLookupReference(e.target.value.toUpperCase())} placeholder="YG-XXXXXXXXXX" /></label><p className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-muted-foreground">You will review the network, bundle, full recipient number, amount and expiry before paying. Payment cannot change the order details.</p><button type="button" className="onyx-btn-primary w-full" onClick={() => void lookupOrder()}>Continue</button></div></>}

    {step === "shared" && activeOrder && <><FlowHeader title="Payment request ready" onClose={onClose} /><div className="px-5 pb-6 pt-7 text-center"><Share2 className="mx-auto text-primary-glow" size={34} /><h3 className="mt-4 font-display text-xl font-semibold">Another DataYego user can pay</h3><p className="mx-auto mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground">Send them this Order ID. After payment, the data will be delivered automatically to {activeOrder.recipientPhone}. This request expires after 24 hours.</p><button type="button" onClick={() => { void navigator.clipboard.writeText(activeOrder.orderReference); toast.success("Order ID copied"); }} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-primary-glow/20 bg-primary/[0.08] px-4 py-4"><span className="font-mono font-semibold">{activeOrder.orderReference}</span><Copy size={18} className="text-primary-glow" /></button><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" className="onyx-btn-primary" onClick={() => { if (navigator.share) void navigator.share({ title: "DataYego payment request", text: `Please pay for my DataYego order ${activeOrder.orderReference}. Recipient: ${activeOrder.recipientPhone}. Amount: ${formatGHS(activeOrder.amount)}.` }); else void navigator.clipboard.writeText(activeOrder.orderReference); }}>Share</button><button type="button" className="onyx-btn-ghost" onClick={() => { setPaymentMethod("wallet"); setStep("review"); }}>Pay myself</button></div></div></>}

    {step === "processing" && <ProcessingView label="Please wait" />}
    {step === "success" && <SuccessView title="Payment received" message="The order is now moving through delivery. You can track it with the Order ID." rows={[{ label: "Order ID", value: receiptRef ?? activeOrder?.orderReference ?? "—" }, { label: "Recipient", value: activeOrder?.recipientPhone ?? digits }, { label: "Amount", value: formatGHS(price) }]} primaryLabel="Done" onPrimary={onClose} secondaryLabel="Copy Order ID" onSecondary={() => { const ref = receiptRef ?? activeOrder?.orderReference; if (ref) void navigator.clipboard.writeText(ref); }} />}
  </Modal>;
}
