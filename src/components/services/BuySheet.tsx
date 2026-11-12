import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader, ProcessingView } from "@/components/flows/flow-parts";
import OrderResult from "@/components/services/OrderResult";
import PayWith, { type Pay } from "@/components/services/PayWith";
import { useAuth } from "@/store/auth-context";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";
import { buyServiceWithWallet, serviceFee, startServiceCheckout, type ServiceContext, type ServiceOrder, type ServiceProduct } from "@/lib/services";

const MAX_QUANTITY = 1000;
const validPhone = (v: string) => /^0\d{9}$/.test(v.replace(/\D/g, ""));

/* Buying result checkers: how many, where to reach the buyer, how to pay. `context` says whether this is the main site,
   an agent's store (its prices, its name) or an agent buying for themselves (agent price, wallet only). */
export default function BuySheet({ product, sms, onClose, onBought, context = {}, walletName = "DataYego wallet" }: { product: ServiceProduct | null; sms: boolean; onClose: () => void; onBought: () => void; context?: ServiceContext; walletName?: string }) {
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
    setPay(context.asAgent || (isAuthenticated && balance >= product.price) ? "wallet" : "paystack");
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
      const r = await buyServiceWithWallet(product.code, quantity, phone, undefined, context);
      setBusy(false);
      if (!r.order) { toast.error(r.error ?? "Something went wrong. Please try again."); return; }
      setOrder(r.order); void refresh(); onBought();
      return;
    }
    const r = await startServiceCheckout({ productCode: product.code, quantity, phone, email: email || undefined, store: context.store });
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
          <PayWith pay={pay} onChange={setPay} base={base} balance={balance} signedIn={isAuthenticated} walletOnly={context.asAgent} walletName={walletName} />
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[14px]"><span className="text-muted-foreground">You pay</span><span className="font-display text-[20px] font-semibold text-foreground">{formatGHS(base + fee)}</span></div>
          {short
            ? <button type="button" className="onyx-btn-primary flex w-full items-center justify-center gap-2" onClick={() => { onClose(); openAddMoney(); }}><Plus size={16} />Top up {formatGHS(base - balance)} or more</button>
            : <button type="button" className="onyx-btn-primary w-full" onClick={() => void submit()}>{pay === "wallet" ? `Pay ${formatGHS(base)} from wallet` : `Pay ${formatGHS(base + fee)}`}</button>}
        </div>
      )}
    </Modal>
  );
}
