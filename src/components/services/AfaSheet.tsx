import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { afaProblem, formatGhanaCard, latestBirth, onlyDigits as digits, validGhanaPhone as validPhone } from "@/lib/afa";
import { GHANA_REGIONS, buyServiceWithWallet, serviceFee, startServiceCheckout, type AfaDetails, type ServiceContext, type ServiceOrder, type ServiceProduct } from "@/lib/services";

/* MTN AFA registration: a short form, then payment. Nothing is sent anywhere until the payment is confirmed,
   and one number can only be registered once. */

const EMPTY: AfaDetails = { full_name: "", afa_phone: "", ghana_card: "", dob: "", occupation: "", region: "", address: "" };
export default function AfaSheet({ product, sms, onClose, onBought, context = {}, walletName = "DataYego wallet" }: { product: ServiceProduct | null; sms: boolean; onClose: () => void; onBought: () => void; context?: ServiceContext; walletName?: string }) {
  const { isAuthenticated } = useAuth();
  const { balance, refresh } = useWallet();
  const { profile } = useProfile();
  const { openAddMoney } = useFlows();
  const [form, setForm] = useState<AfaDetails>(EMPTY);
  const [email, setEmail] = useState("");
  const [pay, setPay] = useState<Pay>("paystack");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<ServiceOrder | null>(null);

  useEffect(() => {
    if (!product) return;
    setForm(EMPTY); setEmail(""); setOrder(null); setBusy(false);
    setPay(context.asAgent || (isAuthenticated && balance >= product.price) ? "wallet" : "paystack");
    // Only when the sheet is opened: typing must not be reset by a balance refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.code]);

  if (!product) return <Modal open={false} onClose={onClose} label="AFA registration">{null}</Modal>;
  const set = (patch: Partial<AfaDetails>) => setForm((f) => ({ ...f, ...patch }));
  const base = product.price;
  const fee = pay === "paystack" ? serviceFee(base) : 0;
  const short = pay === "wallet" && balance < base;

  const submit = async () => {
    const problem = afaProblem(form);
    if (problem) { toast.error(problem); return; }
    // Without SMS, a guest's email is how they hear that the registration is done.
    if (!isAuthenticated && !sms && !email) { toast.error("Enter your email so we can tell you when the registration is done."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("That email doesn't look right. Please check it."); return; }
    const details: AfaDetails = { ...form, full_name: form.full_name.trim().replace(/\s+/g, " "), afa_phone: digits(form.afa_phone), occupation: form.occupation.trim(), address: form.address.trim() };
    // We reach the buyer on their own number when we know it; otherwise on the number being registered.
    const contact = isAuthenticated && validPhone(profile.phone ?? "") ? digits(profile.phone) : details.afa_phone;
    setBusy(true);
    if (pay === "wallet") {
      const r = await buyServiceWithWallet(product.code, 1, contact, details, context);
      setBusy(false);
      if (!r.order) { toast.error(r.error ?? "Something went wrong. Please try again."); return; }
      setOrder(r.order); void refresh(); onBought();
      return;
    }
    const r = await startServiceCheckout({ productCode: product.code, quantity: 1, phone: contact, email: email || undefined, details, store: context.store });
    if (!r.data) { setBusy(false); toast.error(r.error ?? "We couldn't open the payment page. Please try again."); return; }
    window.location.assign(r.data.authorizationUrl);
  };

  const label = "text-[13px] font-semibold text-foreground";
  return (
    <Modal open onClose={onClose} label={product.name}>
      <FlowHeader title={order ? "Order received" : product.name} subtitle={order ? undefined : formatGHS(product.price)} onClose={onClose} />
      {busy ? <ProcessingView label={pay === "wallet" ? "Placing your order…" : "Opening the payment page…"} /> : order ? (
        <div className="space-y-4 px-5 pb-6 pt-5"><OrderResult order={order} sms={sms} /><button type="button" className="onyx-btn-primary w-full" onClick={onClose}>Done</button></div>
      ) : (
        <div className="space-y-4 px-5 pb-6 pt-5">
          <p className="text-[13px] leading-relaxed text-muted-foreground">Fill this in for the person whose MTN number is being registered. Use the details on their Ghana Card.</p>
          <label className="block"><span className={label}>Full name</span>
            <input className="onyx-field mt-2 w-full" autoComplete="name" placeholder="As on the Ghana Card" value={form.full_name} onChange={(e) => set({ full_name: e.target.value.slice(0, 80) })} /></label>
          <label className="block"><span className={label}>MTN number to register</span>
            <input className="onyx-field mt-2 w-full" inputMode="numeric" autoComplete="tel" placeholder="024 000 0000" value={form.afa_phone} onChange={(e) => set({ afa_phone: e.target.value.replace(/[^\d ]/g, "").slice(0, 13) })} /></label>
          <label className="block"><span className={label}>Ghana Card number</span>
            <input className="onyx-field mt-2 w-full font-mono" autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="GHA-123456789-0" value={form.ghana_card} onChange={(e) => set({ ghana_card: formatGhanaCard(e.target.value) })} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className={label}>Date of birth</span>
              <input className="onyx-field mt-2 w-full" type="date" max={latestBirth()} min="1900-01-01" value={form.dob} onChange={(e) => set({ dob: e.target.value })} /></label>
            <label className="block"><span className={label}>Occupation</span>
              <input className="onyx-field mt-2 w-full" placeholder="e.g. Trader" value={form.occupation} onChange={(e) => set({ occupation: e.target.value.slice(0, 60) })} /></label>
          </div>
          <label className="block"><span className={label}>Region</span>
            <select className="onyx-field mt-2 w-full" value={form.region} onChange={(e) => set({ region: e.target.value })}>
              <option value="">Choose a region</option>{GHANA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="block"><span className={label}>Address</span>
            <input className="onyx-field mt-2 w-full" autoComplete="street-address" placeholder="Town, area, house number or landmark" value={form.address} onChange={(e) => set({ address: e.target.value.slice(0, 200) })} /></label>
          {!isAuthenticated && <label className="block"><span className={label}>Your email {sms && <span className="font-normal text-muted-foreground">(optional)</span>}</span>
            <input className="onyx-field mt-2 w-full" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
            <span className="mt-1 block text-[12px] text-muted-foreground">We tell you here when the registration is done.</span></label>}
          <PayWith pay={pay} onChange={setPay} base={base} balance={balance} signedIn={isAuthenticated} walletOnly={context.asAgent} walletName={walletName} />
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[14px]"><span className="text-muted-foreground">You pay</span><span className="font-display text-[20px] font-semibold text-foreground">{formatGHS(base + fee)}</span></div>
          {short
            ? <button type="button" className="onyx-btn-primary flex w-full items-center justify-center gap-2" onClick={() => { onClose(); openAddMoney(); }}><Plus size={16} />Top up {formatGHS(base - balance)} or more</button>
            : <button type="button" className="onyx-btn-primary w-full" onClick={() => void submit()}>{pay === "wallet" ? `Pay ${formatGHS(base)} from wallet` : `Pay ${formatGHS(base + fee)}`}</button>}
          <p className="text-[12px] leading-relaxed text-muted-foreground">By paying you confirm these details are correct and the person agreed to be registered. We use them only for this registration.</p>
        </div>
      )}
    </Modal>
  );
}
