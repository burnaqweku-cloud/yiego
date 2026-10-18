import { useEffect, useState } from "react";
import BackLink from "@/components/layout/BackLink";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { agentsStatus, applyAsAgent, myAgentStatus, planQuote, previewRequested, rememberPreview, type MyAgentStatus } from "@/lib/agents";
import { metaFor } from "@/lib/site";
import { breadcrumbLd } from "@/lib/structuredData";
import { useContactSettings } from "@/hooks/useContactSettings";
import { useAuth } from "@/store/auth-context";

/* ══════════════════════════════════════════════════════════════════════════════
   datayego.com/agents — the application form, and only the application form.

   One job per page: someone who arrives here (usually from a WhatsApp status)
   fills in five fields and sends. Everything there is to read about the
   programme lives on /agents/store, one link away. What they type survives
   the sign-in round trip (sessionStorage), so nobody fills the form twice.
   ══════════════════════════════════════════════════════════════════════════════ */

/** Shown until the live quote arrives (and in the pre-rendered page); the quote replaces it. */
const LIST_FEE = 30;
const DRAFT_KEY = "yg-agent-application-draft";

type Form = { fullName: string; phone: string; whatsapp: string; town: string; pitch: string };
type Errors = Partial<Record<keyof Form, string>>;
const EMPTY: Form = { fullName: "", phone: "", whatsapp: "", town: "", pitch: "" };

function loadDraft(): Form | null {
  try { const raw = sessionStorage.getItem(DRAFT_KEY); return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Form>) } : null; } catch { return null; }
}

export default function AgentsApply() {
  const [monthly, setMonthly] = useState(LIST_FEE);
  const [launched, setLaunched] = useState(true);
  const { whatsappUrl } = useContactSettings();
  useEffect(() => {
    rememberPreview();
    // Closed only when the settings were actually read and say so; a failed read must not hide the form.
    void agentsStatus().then(({ launched: on, plan }) => setLaunched(on || previewRequested() || plan === null));
    void planQuote().then((q) => { if (q) setMonthly(Number(q.pay_now)); });
  }, []);

  return (
    <section className="mk-wrap" aria-labelledby="apply-h">
      <Seo {...metaFor("/agents")} jsonLd={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Become an agent", path: "/agents" }])} />
      <div className="mx-auto max-w-[520px] py-10 sm:py-14">
        <BackLink className="mb-5" />
        <span className="mk-eyebrow">Become an agent</span>
        <h1 id="apply-h" className="mk-h2 mt-3">Apply to be a DataYego agent</h1>
        <p className="mk-lead mt-4 !text-[16px]">
          Agent prices on every bundle, a store with your name, profit paid to MoMo. GH₵{monthly.toFixed(2)} a month
          after you are approved; nothing to pay now.
        </p>
        <p className="mt-3 text-[14px] text-muted-foreground">
          Want the details first?{" "}
          <Link to="/agents/store" className="font-semibold text-foreground underline underline-offset-4">Everything you get as an agent</Link>
          {whatsappUrl && (
            <>
              {" "}· <a href={whatsappUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-4"><MessageCircle size={14} aria-hidden="true" />Ask on WhatsApp</a>
            </>
          )}
        </p>

        <div className="mt-8 min-h-[460px]">
          {launched ? <ApplyForm /> : <p className="mk-card p-6 text-center text-muted-foreground">Applications are closed for now. Check back soon.</p>}
        </div>
      </div>
    </section>
  );
}

/** The form and the "where you already are" states. Client-only: it depends on who is signed in. */
function ApplyForm() {
  const { user, isAuthenticated } = useAuth(); const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [me, setMe] = useState<MyAgentStatus | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setMounted(true);
    const draft = loadDraft();
    if (draft) { setForm(draft); setRestored(true); }
  }, []);
  useEffect(() => { if (isAuthenticated) void myAgentStatus().then(setMe); }, [user, isAuthenticated]);
  if (!mounted) return null;

  const update = (key: keyof Form, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* fine */ }
  };

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
    const e = validate(); setErrors(e); if (Object.keys(e).length) return;
    if (!user) {
      // Keep what they typed; the sign-in page brings them straight back here.
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* fine */ }
      toast.message("One more step: sign in or create a free account, and your application sends from here.");
      navigate(`/auth?mode=signup&next=${encodeURIComponent("/agents")}`);
      return;
    }
    setBusy(true);
    const { error } = await applyAsAgent({ ...form, phone: form.phone.replace(/\D/g, ""), whatsapp: form.whatsapp.replace(/\D/g, "") });
    setBusy(false);
    if (error) {
      const m = error.message;
      toast.error(m.includes("already_an_agent") ? "You're already an agent." : m.includes("application_pending") ? "You already have an application waiting." : "Couldn't send your application. Try again.");
      return;
    }
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* fine */ }
    setDone(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const field = (key: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[14px] font-semibold text-foreground">{label}{hint && <span className="text-[12px] font-normal text-faint-foreground">{hint}</span>}</span>
      <input value={form[key]} onChange={(ev) => update(key, ev.target.value)} className={`onyx-field w-full !text-[16px] ${errors[key] ? "!border-danger/60" : ""}`} {...props} />
      {errors[key] && <span className="mt-1.5 block text-[12.5px] text-danger">{errors[key]}</span>}
    </label>
  );

  if (me?.is_agent) {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-primary-glow" aria-hidden="true" />
        <p className="mk-h3 mt-3">You're already an agent</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">{me.agent_status === "active" ? "Your store is open. Manage prices, orders and earnings from your dashboard." : me.agent_status === "paused" ? "Your store is paused until this month's plan is paid." : "You're approved. Pay the plan to open your store."}</p>
        <Link to="/agent" className="mk-btn mk-btn-primary mt-6 inline-flex">{me.agent_status === "active" ? "Open my dashboard" : "Pay and open my store"}</Link>
      </div>
    );
  }
  if (me?.application?.status === "pending") {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-amber" aria-hidden="true" />
        <p className="mk-h3 mt-3">Your application is being reviewed</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">You sent it on {new Date(me.application.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. We'll email {user?.email} with the decision. One application at a time, so there's nothing more to do for now.</p>
        <Link to="/shop" className="mt-5 inline-block text-[14px] font-semibold text-primary-glow">Back to the shop</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-primary-glow" aria-hidden="true" />
        <p className="mk-h3 mt-3">Application sent</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">We read every one. You'll get an email as soon as it's reviewed. Nothing to pay until then.</p>
        <Link to="/shop" className="mt-5 inline-block text-[14px] font-semibold text-primary-glow">Back to the shop</Link>
      </div>
    );
  }

  return (
    <form className="mk-card p-5 sm:p-7" onSubmit={(ev) => { ev.preventDefault(); void submit(); }} noValidate>
      {restored && !user && <p className="mb-4 rounded-xl bg-primary/[0.08] px-3.5 py-2.5 text-[13px] text-foreground">Welcome back. Your details are still here; tap Send to finish.</p>}
      {me?.application?.status === "declined" && <p className="mb-4 rounded-xl bg-amber/10 px-3.5 py-2.5 text-[13px] text-amber">Your earlier application wasn't approved{me.application.decline_reason ? `: ${me.application.decline_reason}` : ""}. You're welcome to apply again.</p>}
      <div className="grid gap-5">
        {field("fullName", "Full name", { autoComplete: "name", placeholder: "Kofi Mensah" })}
        {field("phone", "Phone number", { inputMode: "tel", autoComplete: "tel", placeholder: "024 000 0000" })}
        {field("whatsapp", "WhatsApp number", { inputMode: "tel", placeholder: "Same as phone" }, "optional")}
        {field("town", "Town or area", { placeholder: "Kumasi, Adum" })}
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-[14px] font-semibold text-foreground">How will you sell?<span className="text-[12px] font-normal text-faint-foreground">one line</span></span>
          <textarea value={form.pitch} onChange={(ev) => update("pitch", ev.target.value)} rows={2} placeholder="WhatsApp groups at my school, my shop's customers…" className={`onyx-field w-full resize-none !text-[16px] ${errors.pitch ? "!border-danger/60" : ""}`} />
          {errors.pitch && <span className="mt-1.5 block text-[12.5px] text-danger">{errors.pitch}</span>}
        </label>
      </div>
      <button type="submit" disabled={busy} className="mk-btn mk-btn-primary mt-7 w-full disabled:opacity-60">
        {busy ? "Sending…" : user ? "Send application" : "Send application"}
      </button>
      <p className="mt-4 text-center text-[12.5px] leading-5 text-faint-foreground">
        {user ? `We'll email ${user.email} with the decision.` : "You'll sign in or create a free account to send it; what you typed stays filled in."}
        {" "}Your store opens when you pay the plan after approval.
      </p>
    </form>
  );
}
