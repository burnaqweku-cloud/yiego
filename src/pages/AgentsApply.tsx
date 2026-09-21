import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeCheck, CheckCircle2, ChevronRight, Link2, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { agentsStatus, applyAsAgent, myAgentStatus, planQuote, previewRequested, rememberPreview, type MyAgentStatus, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Become an agent: the pitch, the price, then a proper form. */
type Errors = Partial<Record<"fullName" | "phone" | "whatsapp" | "town" | "pitch", string>>;

export default function AgentsApply() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", whatsapp: "", town: "", pitch: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [me, setMe] = useState<MyAgentStatus | null>(null);
  useEffect(() => { rememberPreview(); void agentsStatus().then(({ launched }) => setVisible(launched || previewRequested())); void planQuote().then(setQuote); void myAgentStatus().then(setMe); }, [user]);
  if (visible === null) return null;
  if (!visible) return <div className="mk-wrap py-16 text-center text-muted-foreground">This page isn't available yet.</div>;

  const validate = (): Errors => {
    const e: Errors = {};
    if (form.fullName.trim().length < 3) e.fullName = "Your full name, please.";
    if (!/^0\d{9}$/.test(form.phone.replace(/\D/g, ""))) e.phone = "A 10-digit Ghana number starting with 0.";
    if (form.whatsapp && !/^0\d{9}$/.test(form.whatsapp.replace(/\D/g, ""))) e.whatsapp = "10 digits, or leave it blank.";
    if (form.town.trim().length < 2) e.town = "Which town are you in?";
    if (form.pitch.trim().length < 8) e.pitch = "One line on how you'll sell.";
    return e;
  };
  const submit = async () => {
    if (!user) { toast.message("Sign in first — we'll bring you back here."); navigate(`/auth?next=${encodeURIComponent("/agents")}`); return; }
    const e = validate(); setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await applyAsAgent({ ...form, phone: form.phone.replace(/\D/g, ""), whatsapp: form.whatsapp.replace(/\D/g, "") });
    setBusy(false);
    if (error) { const m = error.message; return toast.error(m.includes("already_an_agent") ? "You're already an agent." : m.includes("application_pending") ? "You already have an application waiting." : "Couldn't send your application. Try again."); }
    setDone(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium text-foreground">{label}{hint && <span className="text-[11px] font-normal text-faint-foreground">{hint}</span>}</span>
      <input value={form[key]} onChange={(ev) => { setForm({ ...form, [key]: ev.target.value }); if (errors[key]) setErrors({ ...errors, [key]: undefined }); }} className={`onyx-field w-full ${errors[key] ? "border-danger/60" : ""}`} {...props} />
      {errors[key] && <span className="mt-1 block text-[11.5px] text-danger">{errors[key]}</span>}
    </label>
  );

  return (
    <div className="mk-wrap py-8 sm:py-14">
      <Seo path="/agents" title="Become a DataYego agent" description="Buy data at agent prices, sell from your own store, keep the difference." />
      <div className="mx-auto max-w-2xl">
        {/* Pitch */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><Store size={12} />Agents</span>
          <h1 className="mt-4 font-display text-[30px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[40px]">Buy data cheaper.<br />Sell it your way.</h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-6 text-muted-foreground">Agents get every bundle below the public price, a store with their name on it, and earnings on each sale. We handle payments, delivery and support.</p>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: BadgeCheck, t: "Cheaper data", d: "MTN 1GB at 4.00, not 4.15. 10GB at 40.00, not 43.44. Every bundle, every network." },
            { icon: Store, t: "Your own store", d: "datayego.com/s/yourname. Set your prices, share the link anywhere." },
            { icon: Wallet, t: "Nothing to prepay", d: "No stock, no deposits. Your markup lands in earnings; withdraw to MoMo." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="onyx-panel rounded-2xl p-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><Icon size={17} /></span><p className="mt-3 text-[14.5px] font-semibold text-foreground">{t}</p><p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{d}</p></div>))}
        </div>

        {/* Price */}
        <div className="onyx-panel mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 sm:p-5">
          <div>
            <p className="text-[12px] text-muted-foreground">Monthly fee</p>
            {quote ? (quote.promo ? <p className="mt-0.5 text-[26px] font-semibold leading-none text-foreground">{formatGHS(quote.pay_now)}<span className="ml-2 text-[14px] font-normal text-faint-foreground line-through">{formatGHS(quote.monthly)}</span></p> : <p className="mt-0.5 text-[26px] font-semibold leading-none text-foreground">{formatGHS(quote.monthly)}</p>) : <p className="mt-0.5 text-[26px] font-semibold leading-none text-foreground">…</p>}
          </div>
          {quote?.promo && <span className="rounded-full bg-primary/12 px-3 py-1 text-[11.5px] font-semibold text-primary-glow">{quote.promo.percent_off}% off · {quote.promo.name}</span>}
          <p className="w-full text-[12px] text-faint-foreground">Paid after you're approved. Miss a month and your store pauses until you pay — nothing is lost.</p>
        </div>

        {/* How it works */}
        <ol className="mt-6 grid gap-2 sm:grid-cols-4">
          {["Apply below", "We review and email you", "Pay the monthly fee", "Set prices and share your link"].map((s, i) => <li key={s} className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-foreground">{i + 1}</span>{s}{i < 3 && <ChevronRight size={13} className="ml-auto hidden text-faint-foreground sm:block" />}</li>)}
        </ol>

        {/* Form, or where they already are */}
        {me?.is_agent ? (
          <div className="onyx-panel mt-8 rounded-2xl p-6 text-center">
            <CheckCircle2 size={32} className="mx-auto text-primary-glow" />
            <p className="mt-3 text-[18px] font-semibold text-foreground">You're already an agent</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">{me.agent_status === "active" ? "Your store is open. Manage prices, orders and earnings from your dashboard." : me.agent_status === "paused" ? "Your store is paused until this month's fee is paid." : "You're approved — pay the monthly fee to open your store."}</p>
            <Link to="/agent" className="onyx-btn-primary mt-5 inline-block px-5 py-2.5 text-[13.5px]">{me.agent_status === "active" ? "Open my dashboard" : "Pay and open my store"}</Link>
          </div>
        ) : me?.application?.status === "pending" ? (
          <div className="onyx-panel mt-8 rounded-2xl p-6 text-center">
            <CheckCircle2 size={32} className="mx-auto text-amber" />
            <p className="mt-3 text-[18px] font-semibold text-foreground">Your application is being reviewed</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">You sent it on {new Date(me.application.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. We'll email {user?.email} with the decision — usually within a day. One application at a time, so there's nothing more to do for now.</p>
            <Link to="/shop" className="mt-5 inline-block text-[13px] font-medium text-primary-glow">Back to the shop</Link>
          </div>
        ) : done ? (
          <div className="onyx-panel mt-8 rounded-2xl p-6 text-center">
            <CheckCircle2 size={32} className="mx-auto text-primary-glow" />
            <p className="mt-3 text-[18px] font-semibold text-foreground">Application sent</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">We read every one. You'll get an email as soon as it's reviewed — usually within a day. Nothing to pay until then.</p>
            <Link to="/shop" className="mt-5 inline-block text-[13px] font-medium text-primary-glow">Back to the shop</Link>
          </div>
        ) : (
          <div className="onyx-panel mt-8 rounded-2xl p-5 sm:p-6">
            <h2 className="text-[18px] font-semibold text-foreground">Apply to be an agent</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Takes a minute. {user ? `We'll email ${user.email} with the decision.` : "You'll sign in (or create a free account) to send it."}</p>
            {me?.application?.status === "declined" && <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-[12px] text-amber">Your earlier application wasn't approved{me.application.decline_reason ? `: ${me.application.decline_reason}` : ""}. You're welcome to apply again.</p>}
            <div className="mt-5 grid gap-4">
              {field("fullName", "Full name", { autoComplete: "name", placeholder: "Kofi Mensah" })}
              <div className="grid gap-4 sm:grid-cols-2">
                {field("phone", "Phone number", { inputMode: "tel", autoComplete: "tel", placeholder: "0241234567" })}
                {field("whatsapp", "WhatsApp number", { inputMode: "tel", placeholder: "Same as phone" }, "optional")}
              </div>
              {field("town", "Town / area", { placeholder: "Kumasi, Adum" })}
              {field("pitch", "How will you sell?", { placeholder: "WhatsApp groups at my school, my shop's customers…" }, "one line")}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
              <p className="flex items-center gap-1.5 text-[11.5px] text-faint-foreground"><Link2 size={12} />Your store link is created when you're approved.</p>
              <Button onClick={() => void submit()} disabled={busy}>{busy ? "Sending…" : user ? "Send application" : "Sign in & apply"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
