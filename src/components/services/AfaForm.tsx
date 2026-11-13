import { useEffect, useState, type ReactNode } from "react";
import { Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ProcessingView } from "@/components/flows/flow-parts";
import OrderResult from "@/components/services/OrderResult";
import PayWith, { type Pay } from "@/components/services/PayWith";
import PriceBreakdown from "@/components/services/PriceBreakdown";
import { useAuth } from "@/store/auth-context";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";
import { AFA_OCCUPATIONS, afaProblem, formatGhanaCard, latestBirth, onlyDigits as digits, validGhanaPhone as validPhone, validMtnPhone } from "@/lib/afa";
import { GHANA_REGIONS, buyServiceWithWallet, serviceFee, startServiceCheckout, type AfaDetails, type ServiceContext, type ServiceOrder, type ServiceProduct } from "@/lib/services";
import { cn } from "@/lib/utils";

/* MTN AFA registration: the whole form in three short steps, then payment.
   On the Services page it is the page itself (`boxed`: each step in its own card), so opening the AFA card shows
   everything that will be asked before any money is. In the agent dashboard the same form sits in a pop-up.
   Nothing is sent anywhere until the payment is confirmed, and one number can only be registered once. */

const EMPTY: AfaDetails = { full_name: "", afa_phone: "", ghana_card: "", dob: "", occupation: "", region: "", address: "" };

function Section({ boxed, children }: { boxed: boolean; children: ReactNode }) {
  return boxed
    ? <Card className="space-y-4 p-5 sm:p-6">{children}</Card>
    : <section className="space-y-4 border-t border-white/[0.08] pt-5 first:border-0 first:pt-0">{children}</section>;
}
function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/[0.14] text-[13.5px] font-semibold tabular-nums text-primary-glow" aria-hidden="true">{n}</span>
      <div className="min-w-0"><h2 className="font-display text-[16.5px] font-semibold leading-tight tracking-tight text-foreground"><span className="sr-only">Step {n}: </span>{title}</h2>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{sub}</p></div>
    </div>
  );
}
const label = "text-[13px] font-semibold text-foreground";
const hint = "mt-1.5 block text-[12px] leading-snug text-muted-foreground";

export default function AfaForm({ product, sms, onBought, context = {}, walletName = "DataYego wallet", boxed = false, onDone }: {
  product: ServiceProduct; sms: boolean; onBought: () => void; context?: ServiceContext; walletName?: string;
  /** Each step in its own card (the page). Off inside a pop-up. */
  boxed?: boolean;
  /** Inside a pop-up: closes it. On the page there is nothing to close. */
  onDone?: () => void;
}) {
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
    setForm(EMPTY); setEmail(""); setOrder(null); setBusy(false);
    setPay(context.asAgent || (isAuthenticated && balance >= product.price) ? "wallet" : "paystack");
    // Only when the form is opened: typing must not be reset by a balance refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.code]);

  const set = (patch: Partial<AfaDetails>) => setForm((f) => ({ ...f, ...patch }));
  const base = product.price;
  const fee = pay === "paystack" ? serviceFee(base) : 0;
  const short = pay === "wallet" && balance < base;
  const typedNumber = digits(form.afa_phone);
  const notMtn = typedNumber.length === 10 && !validMtnPhone(form.afa_phone);

  const submit = async () => {
    const problem = afaProblem(form);
    if (problem) { toast.error(problem); return; }
    // Without SMS, a guest's email is how they hear that the registration is done.
    if (!isAuthenticated && !sms && !email) { toast.error("Enter your email so we can tell you when the registration is done."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("That email doesn't look right. Please check it."); return; }
    const details: AfaDetails = { ...form, full_name: form.full_name.trim().replace(/\s+/g, " "), afa_phone: typedNumber, occupation: form.occupation.trim(), address: form.address.trim() };
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

  if (busy) return <Section boxed={boxed}><ProcessingView label={pay === "wallet" ? "Placing your order…" : "Opening the payment page…"} /></Section>;
  if (order) return (
    <Section boxed={boxed}>
      <OrderResult order={order} sms={sms} />
      {onDone
        ? <button type="button" className="onyx-btn-primary w-full" onClick={onDone}>Done</button>
        : <button type="button" className="onyx-btn-ghost w-full" onClick={() => { setForm(EMPTY); setOrder(null); }}>Register another number</button>}
    </Section>
  );

  return (
    <div className="space-y-4">
      <p className="px-1 text-[13.5px] leading-relaxed text-muted-foreground">Fill this in for the person whose MTN number is being registered. Use the details exactly as they are on the Ghana Card. A detail that doesn't match the card can get the registration rejected.</p>

      <Section boxed={boxed}>
        <StepTitle n={1} title="The MTN number" sub="And the person it belongs to" />
        <label className="block"><span className={label}>MTN number to register</span>
          <input className="onyx-field mt-2 w-full" inputMode="numeric" autoComplete="tel" placeholder="024 000 0000" aria-invalid={notMtn} value={form.afa_phone} onChange={(e) => set({ afa_phone: e.target.value.replace(/[^\d ]/g, "").slice(0, 13) })} />
          {notMtn && <span role="alert" className="mt-1.5 block text-[12px] leading-snug text-danger">AFA is for MTN numbers only: 024, 025, 053, 054, 055 or 059.</span>}</label>
        <label className="block"><span className={label}>Full name</span>
          <input className="onyx-field mt-2 w-full" autoComplete="name" placeholder="Ama Mensah" value={form.full_name} onChange={(e) => set({ full_name: e.target.value.slice(0, 80) })} />
          <span className={hint}>Exactly as written on the Ghana Card.</span></label>
      </Section>

      <Section boxed={boxed}>
        <StepTitle n={2} title="Identity" sub="From the person's Ghana Card" />
        <label className="block"><span className={label}>Ghana Card number</span>
          <input className="onyx-field mt-2 w-full font-mono" autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="GHA-000000000-0" value={form.ghana_card} onChange={(e) => set({ ghana_card: formatGhanaCard(e.target.value) })} />
          <span className={hint}>Starts with GHA. We add the dashes for you.</span></label>
        <label className="block"><span className={label}>Date of birth</span>
          <input className="onyx-field mt-2 w-full" type="date" max={latestBirth()} min="1900-01-01" value={form.dob} onChange={(e) => set({ dob: e.target.value })} />
          <span className={hint}>The person must be 16 or older.</span></label>
      </Section>

      <Section boxed={boxed}>
        <StepTitle n={3} title="Location and work" sub="Where the person lives and what they do" />
        <label className="block"><span className={label}>Region</span>
          <select className="onyx-field mt-2 w-full" value={form.region} onChange={(e) => set({ region: e.target.value })}>
            <option value="">Choose a region</option>{GHANA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
        <label className="block"><span className={label}>Town or area</span>
          <input className="onyx-field mt-2 w-full" autoComplete="address-level2" placeholder="e.g. Madina" value={form.address} onChange={(e) => set({ address: e.target.value.slice(0, 200) })} /></label>
        <div>
          <label className="block"><span className={label}>Occupation</span>
            <input className="onyx-field mt-2 w-full" placeholder="e.g. Trader" value={form.occupation} onChange={(e) => set({ occupation: e.target.value.slice(0, 60) })} /></label>
          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Common occupations">
            {AFA_OCCUPATIONS.map((o) => { const on = form.occupation.trim().toLowerCase() === o.toLowerCase(); return (
              <button key={o} type="button" aria-pressed={on} onClick={() => set({ occupation: o })}
                className={cn("min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors", on ? "border-primary-glow bg-primary/[0.12] text-foreground" : "border-white/[0.12] text-muted-foreground hover:text-foreground")}>{o}</button>); })}
          </div>
        </div>
      </Section>

      <Section boxed={boxed}>
        {!isAuthenticated && <label className="block"><span className={label}>Your email {sms && <span className="font-normal text-muted-foreground">(optional)</span>}</span>
          <input className="onyx-field mt-2 w-full" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          <span className={hint}>We tell you here when the registration is done.</span></label>}
        <PayWith pay={pay} onChange={setPay} base={base} balance={balance} signedIn={isAuthenticated} walletOnly={context.asAgent} walletName={walletName} />
        <PriceBreakdown label="AFA registration" base={base} fee={fee} />
        {short
          ? <button type="button" className="onyx-btn-primary flex w-full items-center justify-center gap-2" onClick={() => { onDone?.(); openAddMoney(); }}><Plus size={16} />Top up {formatGHS(base - balance)} or more</button>
          : <button type="button" className="onyx-btn-primary w-full" onClick={() => void submit()}>{pay === "wallet" ? `Pay ${formatGHS(base)} from wallet` : `Pay ${formatGHS(base + fee)} with MoMo or card`}</button>}
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Registration can take up to 24 hours. If it can't be completed, your money is refunded.</span></p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">By paying you confirm these details are correct and the person agreed to be registered. We use them only for this registration.</p>
      </Section>
    </div>
  );
}
