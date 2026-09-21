import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeCheck, Link2, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { agentsStatus, applyAsAgent, planQuote, previewRequested, rememberPreview, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Public: what being an agent gets you, and a short application. */
export default function AgentsApply() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", whatsapp: "", town: "", pitch: "" });
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { rememberPreview(); void agentsStatus().then(({ launched }) => setVisible(launched || previewRequested())); void planQuote().then(setQuote); }, []);
  if (visible === null) return null;
  if (!visible) return <div className="mk-wrap py-16 text-center text-muted-foreground">This page isn't available yet.</div>;

  const submit = async () => {
    if (!user) { toast.message("Sign in first — we'll bring you back here."); navigate(`/auth?next=${encodeURIComponent("/agents")}`); return; }
    if (form.fullName.trim().length < 3 || !/^0\d{9}$/.test(form.phone.replace(/\D/g, ""))) return toast.error("Your name and a valid 10-digit phone number, please.");
    setBusy(true);
    const { error } = await applyAsAgent({ ...form, phone: form.phone.replace(/\D/g, "") });
    setBusy(false);
    if (error) { const m = error.message; return toast.error(m.includes("already_an_agent") ? "You're already an agent." : m.includes("application_pending") ? "You already have an application waiting." : "Couldn't send your application. Try again."); }
    setDone(true);
  };

  return (
    <div className="mk-wrap py-8 sm:py-12">
      <Seo path="/agents" title="Become a DataYego agent" description="Sell data at agent prices from your own store and earn on every bundle." />
      <div className="mx-auto max-w-xl">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Agents</p>
        <h1 className="mt-1 font-display text-[28px] font-semibold tracking-tight text-foreground sm:text-[34px]">Sell data. Keep the difference.</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">Get your own DataYego store, buy every bundle at agent prices, set your selling prices, and earn on each sale. We handle payments, delivery and support.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[{ icon: BadgeCheck, t: "Agent prices", d: "Every bundle at prices below what customers pay." }, { icon: Store, t: "Your own store", d: "A link with your name on it. Share it anywhere." }, { icon: Wallet, t: "Earn per sale", d: "Your markup lands in your earnings. Withdraw to MoMo." }].map(({ icon: Icon, t, d }) => (
            <div key={t} className="onyx-panel rounded-2xl p-4"><Icon size={18} className="text-primary-glow" /><p className="mt-2 text-[14px] font-semibold text-foreground">{t}</p><p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{d}</p></div>))}
        </div>

        <div className="onyx-panel mt-4 rounded-2xl p-4">
          <p className="text-[13px] text-muted-foreground">Monthly fee</p>
          {quote ? (quote.promo ? <p className="mt-0.5 text-[22px] font-semibold text-foreground">{formatGHS(quote.pay_now)}<span className="ml-2 text-[14px] font-normal text-faint-foreground line-through">{formatGHS(quote.monthly)}</span><span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary-glow">{quote.promo.percent_off}% off · {quote.promo.name}</span></p> : <p className="mt-0.5 text-[22px] font-semibold text-foreground">{formatGHS(quote.monthly)}</p>) : <p className="mt-0.5 text-[22px] font-semibold text-foreground">…</p>}
          <p className="mt-1 text-[12px] text-faint-foreground">No deposit, no stock to buy. You pay the monthly fee after you're approved. Miss a month and your store pauses until you pay.</p>
        </div>

        {done ? (
          <div className="onyx-panel mt-6 rounded-2xl p-5 text-center">
            <BadgeCheck size={28} className="mx-auto text-primary-glow" />
            <p className="mt-2 text-[16px] font-semibold text-foreground">Application sent</p>
            <p className="mt-1 text-[13px] text-muted-foreground">We read every one. You'll get an email as soon as it's reviewed — usually within a day.</p>
            <Link to="/shop" className="mt-4 inline-block text-[13px] text-primary-glow">Back to the shop</Link>
          </div>
        ) : (
          <div className="onyx-panel mt-6 rounded-2xl p-5">
            <h2 className="text-[16px] font-semibold text-foreground">Apply</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Five quick fields. {user ? "" : "You'll sign in (or create an account) to send it."}</p>
            <div className="mt-3 grid gap-3">
              <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Full name</span><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="onyx-field w-full" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Phone</span><input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0241234567" className="onyx-field w-full" /></label>
                <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">WhatsApp (if different)</span><input inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="onyx-field w-full" /></label>
              </div>
              <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Town</span><input value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} className="onyx-field w-full" /></label>
              <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">How will you sell? <span className="text-faint-foreground">one line</span></span><input value={form.pitch} onChange={(e) => setForm({ ...form, pitch: e.target.value })} placeholder="e.g. WhatsApp groups at my school, my shop's customers…" className="onyx-field w-full" /></label>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <Link2 size={14} className="text-faint-foreground" />
              <Button onClick={() => void submit()} disabled={busy}>{busy ? "Sending…" : user ? "Send application" : "Sign in & apply"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
