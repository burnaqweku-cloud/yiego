import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { agentsStatus, applyAsAgent, myAgentStatus, planQuote, previewRequested, rememberPreview, type MyAgentStatus, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";
import { metaFor } from "@/lib/site";
import { breadcrumbLd, faqPageLd } from "@/lib/structuredData";
import { useLiveBundles } from "@/hooks/useLiveBundles";
import { useAuth } from "@/store/auth-context";

/* ══════════════════════════════════════════════════════════════════════════════
   datayego.com/agents — the agent programme landing page.

   The pitch, the margins, the plan, the steps and the questions are plain
   content (pre-rendered, crawlable). The application form at the bottom is
   the only part that depends on who is looking, so it mounts on the client.
   ══════════════════════════════════════════════════════════════════════════════ */

/** Shown until the live quote arrives (and in the pre-rendered page); the quote replaces it. */
const LIST_FEE = 30;
const LIST_PLANS = [
  { months: 3, pay_now: 81, per_month: 27, saving_pct: 10 },
  { months: 12, pay_now: 288, per_month: 24, saving_pct: 20 },
];

const MARGIN_ROWS_GB = [1, 2, 5, 10, 20];

const POINTS = [
  {
    t: "Agent prices on every bundle",
    b: "MTN, Telecel and AirtelTigo, every size, below the public price. Buy for yourself, for walk-in customers, or to sell online.",
  },
  {
    t: "A store with your name on it",
    b: "yourname.datayego.com, or your own domain. Three templates, your logo, your prices, customer accounts, chat and a WhatsApp status maker. DataYego is not mentioned inside it.",
    link: { to: "/agents/store", label: "See everything in the store" },
  },
  {
    t: "No deposit. Profit to MoMo.",
    b: "Your customers pay first. The difference between your price and the agent price is saved for you, and you withdraw it to Mobile Money from GH₵20.",
  },
];

const STEPS = [
  { t: "Apply", b: "One short form: your name, your number, your town and how you plan to sell." },
  { t: "We review it", b: "You get an email with the decision. Nothing to pay until you are approved." },
  { t: "Pay the plan", b: "Pay the monthly plan with Mobile Money or card and your store opens straight away." },
  { t: "Set prices, share your link", b: "Set your own prices, post your link on WhatsApp, and sell." },
];

const FAQ = [
  {
    q: "Do I need a deposit to become an agent?",
    a: "No. Your customers pay first, with Mobile Money or card on your store. Your profit on each sale is saved for you and you withdraw it to Mobile Money from GH₵20 (1% payout fee, minimum GH₵1). If a bundle fails, the customer is refunded and nothing comes out of your pocket.",
  },
  {
    q: "How much does an agent earn per bundle?",
    a: "You set your own prices, so you decide. The agent price for MTN 10GB is GH₵41.00 against a public price of GH₵43.00, so selling at the public price keeps GH₵2.00; sell higher and keep more. The live agent prices are on this page.",
  },
  {
    q: "What does the agent plan cost?",
    a: "GH₵30 a month, due only after you are approved. Longer plans cost less per month and can be paid from your dashboard. The usual 4% checkout fee applies to each sale and is paid by the customer at checkout.",
  },
  {
    q: "Will my customers know the store runs on DataYego?",
    a: "Your store carries your name, your logo, your prices and your link, and the WhatsApp preview shows your store, not ours. DataYego is not mentioned inside it.",
  },
  {
    q: "What happens if I miss a month?",
    a: "Your store pauses until the plan is paid. Your earnings, your customers and your settings stay exactly as they were.",
  },
  {
    q: "Can I use my own domain name?",
    a: "Yes. Connect a domain you already own, or buy a .com straight from your dashboard; we set it up for you.",
  },
];

type Errors = Partial<Record<"fullName" | "phone" | "whatsapp" | "town" | "pitch", string>>;

export default function AgentsApply() {
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [launched, setLaunched] = useState(true);
  useEffect(() => {
    rememberPreview();
    // Closed only when the settings were actually read and say so; a failed read must not hide the form.
    void agentsStatus().then(({ launched: on, plan }) => setLaunched(on || previewRequested() || plan === null));
    void planQuote().then(setQuote);
  }, []);
  const monthly = quote ? quote.monthly : LIST_FEE;
  const payNow = quote ? quote.pay_now : LIST_FEE;
  const longer = quote ? quote.plans.filter((p) => p.months > 1) : LIST_PLANS;

  const { byNetwork } = useLiveBundles();
  const margins = MARGIN_ROWS_GB.map((gb) => byNetwork.mtn.find((b) => b.capacityGb === gb && b.agentPrice != null)).filter((b): b is NonNullable<typeof b> => Boolean(b));

  return (
    <>
      <Seo {...metaFor("/agents")} jsonLd={[faqPageLd(FAQ), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Become an agent", path: "/agents" }])]} />

      {/* Hero */}
      <section className="mk-wrap" aria-labelledby="agents-h1">
        <div className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
          <div className="lg:col-span-6">
            <span className="mk-eyebrow">Become an agent</span>
            <h1 id="agents-h1" className="mk-hero-title mt-3 max-w-[12ch]">Sell data under your own name.</h1>
            <p className="mk-lead mt-7">
              Agent prices on every bundle, a free online store with your own link, your own prices, and your profit paid
              to Mobile Money. No deposit. GH₵{monthly.toFixed(2)} a month.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#apply" className="mk-btn mk-btn-primary w-full sm:w-auto">Apply now</a>
              <Link to="/agents/store" className="mk-btn mk-btn-ghost w-full sm:w-auto">See everything in the store</Link>
            </div>
          </div>

          {/* What an agent pays against what the public pays, live from the catalogue. */}
          <div className="lg:col-span-6">
            <div className="board net-mtn">
              <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                <p className="font-display text-[15px] font-bold text-foreground">Agent prices on MTN</p>
                <span className="text-[12.5px] text-muted-foreground">live from the catalogue</span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[12px] text-faint-foreground">
                    <th scope="col" className="px-5 pb-1 pt-3 font-medium">Bundle</th>
                    <th scope="col" className="px-2 pb-1 pt-3 text-right font-medium">Public</th>
                    <th scope="col" className="px-2 pb-1 pt-3 text-right font-medium">Agent</th>
                    <th scope="col" className="px-5 pb-1 pt-3 text-right font-medium">Cheaper by</th>
                  </tr>
                </thead>
                <tbody>
                  {margins.map((b) => (
                    <tr key={b.productCode} className="border-t border-[hsl(var(--border))]">
                      <td className="px-5 py-3 font-display text-[18px] font-bold text-foreground">{b.size}</td>
                      <td className="px-2 py-3 text-right text-[15px] tabular-nums text-muted-foreground">{b.price.toFixed(2)}</td>
                      <td className="px-2 py-3 text-right text-[15px] font-semibold tabular-nums text-foreground">{(b.agentPrice ?? 0).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-display text-[18px] font-bold tabular-nums text-[var(--gold)]">−{(b.price - (b.agentPrice ?? 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="board-foot">
                <span>You set your own selling price. What you keep is the difference.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mk-section-tight" aria-labelledby="agents-get">
        <div className="mk-wrap">
          <h2 id="agents-get" className="mk-h2 max-w-[18ch]">What you get</h2>
          <ul className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-10">
            {POINTS.map((p) => (
              <li key={p.t} className="fact">
                <h3 className="mk-h3">{p.t}</h3>
                <p className="mk-body mt-2">{p.b}</p>
                {p.link && <Link to={p.link.to} className="mt-3 inline-block text-[14px] font-semibold text-primary-glow underline-offset-4 hover:underline">{p.link.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The plan */}
      <section className="mk-section-tight" aria-labelledby="agents-plan">
        <div className="mk-wrap">
          <div className="agents-panel grid gap-10 p-7 sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="lg:col-span-6">
              <span className="mk-eyebrow">The plan</span>
              <h2 id="agents-plan" className="mk-h2 mt-3">One fee. Everything in the store.</h2>
              <p className="mk-lead mt-4">
                Due only after you are approved. The usual 4% checkout fee applies to each sale and is paid by the
                customer at checkout. Miss a month and the store pauses until you pay; your earnings stay yours.
              </p>
            </div>
            <div className="lg:col-span-6">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="font-display text-[56px] font-extrabold leading-none tracking-tight text-foreground sm:text-[72px]">
                  <span className="text-[22px] font-bold text-muted-foreground sm:text-[28px]">GH₵</span>{payNow.toFixed(2)}
                </p>
                <p className="pb-2 text-[15px] text-muted-foreground">a month</p>
              </div>
              {quote?.promo && (
                <p className="mt-2 text-[14px] text-primary-glow">
                  {quote.promo.percent_off}% off with {quote.promo.name}. Normal price GH₵{quote.monthly.toFixed(2)}.
                </p>
              )}
              {longer.length > 0 && (
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {longer.map((p) => (
                    <li key={p.months} className="rounded-2xl border border-[hsl(var(--border))] px-4 py-3">
                      <p className="font-display text-[17px] font-bold text-foreground">{p.months} months · {formatGHS(p.pay_now)}</p>
                      <p className="text-[13px] text-muted-foreground">GH₵{p.per_month.toFixed(2)} a month{p.saving_pct > 0 ? `, ${p.saving_pct}% less` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
              <a href="#apply" className="mk-btn mk-btn-primary mt-8 inline-flex">Apply now</a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mk-section-tight" aria-labelledby="agents-how">
        <div className="mk-wrap">
          <h2 id="agents-how" className="mk-h2 max-w-[18ch]">From application to first sale</h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.t} className="step">
                <span className="step-n">0{i + 1}</span>
                <h3 className="step-t">{s.t}</h3>
                <p className="step-b">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Questions */}
      <section className="mk-section-tight" aria-labelledby="agents-faq">
        <div className="mk-wrap">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <span className="mk-eyebrow">Questions</span>
              <h2 id="agents-faq" className="mk-h2 mt-3">Before you apply</h2>
              <p className="mk-lead mt-4">The full guide to earnings, payouts, orders and plans is in the <Link to="/help/agents" className="font-semibold text-foreground underline underline-offset-4">agent help centre</Link>.</p>
            </div>
            <div className="lg:col-span-7">
              <AgentFaq />
            </div>
          </div>
        </div>
      </section>

      {/* Apply */}
      <section id="apply" className="mk-section-tight scroll-mt-24" aria-labelledby="apply-h">
        <div className="mk-wrap">
          <div className="mx-auto max-w-2xl">
            <h2 id="apply-h" className="mk-h2 text-center">Apply to be an agent</h2>
            <p className="mk-lead mx-auto mt-4 text-center">Takes a minute. We read every application and email you the decision.</p>
            <div className="mt-8 min-h-[420px]">{launched ? <ApplyForm /> : <p className="text-center text-muted-foreground">Applications are closed for now.</p>}</div>
          </div>
        </div>
      </section>
    </>
  );
}

function AgentFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="mk-acc" data-open={isOpen}>
            <button type="button" id={`agents-faq-t-${i}`} className="mk-acc-trigger" aria-expanded={isOpen} aria-controls={`agents-faq-p-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
              {item.q}
              <span className="mk-acc-icon" aria-hidden="true"><Plus className="h-3.5 w-3.5" /></span>
            </button>
            <div className="mk-acc-panel" id={`agents-faq-p-${i}`} role="region" aria-labelledby={`agents-faq-t-${i}`}>
              <div><p className="mk-body pb-6 pr-10">{item.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The form and the "where you already are" states. Client-only: it depends on who is signed in. */
function ApplyForm() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", whatsapp: "", town: "", pitch: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [me, setMe] = useState<MyAgentStatus | null>(null);
  useEffect(() => { setMounted(true); void myAgentStatus().then(setMe); }, [user]);
  if (!mounted) return null;

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
    if (!user) { toast.message("Sign in first. We'll bring you back here."); navigate(`/auth?next=${encodeURIComponent("/agents#apply")}`); return; }
    const e = validate(); setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await applyAsAgent({ ...form, phone: form.phone.replace(/\D/g, ""), whatsapp: form.whatsapp.replace(/\D/g, "") });
    setBusy(false);
    if (error) { const m = error.message; return toast.error(m.includes("already_an_agent") ? "You're already an agent." : m.includes("application_pending") ? "You already have an application waiting." : "Couldn't send your application. Try again."); }
    setDone(true);
  };
  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-foreground">{label}{hint && <span className="text-[11.5px] font-normal text-faint-foreground">{hint}</span>}</span>
      <input value={form[key]} onChange={(ev) => { setForm({ ...form, [key]: ev.target.value }); if (errors[key]) setErrors({ ...errors, [key]: undefined }); }} className={`onyx-field w-full ${errors[key] ? "border-danger/60" : ""}`} {...props} />
      {errors[key] && <span className="mt-1 block text-[12px] text-danger">{errors[key]}</span>}
    </label>
  );

  if (me?.is_agent) {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-primary-glow" />
        <p className="mk-h3 mt-3">You're already an agent</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">{me.agent_status === "active" ? "Your store is open. Manage prices, orders and earnings from your dashboard." : me.agent_status === "paused" ? "Your store is paused until this month's plan is paid." : "You're approved. Pay the plan to open your store."}</p>
        <Link to="/agent" className="mk-btn mk-btn-primary mt-6 inline-flex">{me.agent_status === "active" ? "Open my dashboard" : "Pay and open my store"}</Link>
      </div>
    );
  }
  if (me?.application?.status === "pending") {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-amber" />
        <p className="mk-h3 mt-3">Your application is being reviewed</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">You sent it on {new Date(me.application.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. We'll email {user?.email} with the decision. One application at a time, so there's nothing more to do for now.</p>
        <Link to="/shop" className="mt-5 inline-block text-[14px] font-semibold text-primary-glow">Back to the shop</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mk-card p-7 text-center">
        <CheckCircle2 size={32} className="mx-auto text-primary-glow" />
        <p className="mk-h3 mt-3">Application sent</p>
        <p className="mk-body mx-auto mt-1 max-w-sm">We read every one. You'll get an email as soon as it's reviewed. Nothing to pay until then.</p>
        <Link to="/shop" className="mt-5 inline-block text-[14px] font-semibold text-primary-glow">Back to the shop</Link>
      </div>
    );
  }
  return (
    <div className="mk-card p-5 sm:p-7">
      <p className="text-[13.5px] text-muted-foreground">{user ? `We'll email ${user.email} with the decision.` : "You'll sign in (or create a free account) to send it."}</p>
      {me?.application?.status === "declined" && <p className="mt-3 rounded-xl bg-amber/10 px-3 py-2 text-[13px] text-amber">Your earlier application wasn't approved{me.application.decline_reason ? `: ${me.application.decline_reason}` : ""}. You're welcome to apply again.</p>}
      <div className="mt-5 grid gap-4">
        {field("fullName", "Full name", { autoComplete: "name", placeholder: "Kofi Mensah" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", "Phone number", { inputMode: "tel", autoComplete: "tel", placeholder: "0241234567" })}
          {field("whatsapp", "WhatsApp number", { inputMode: "tel", placeholder: "Same as phone" }, "optional")}
        </div>
        {field("town", "Town / area", { placeholder: "Kumasi, Adum" })}
        {field("pitch", "How will you sell?", { placeholder: "WhatsApp groups at my school, my shop's customers…" }, "one line")}
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-faint-foreground">Your store name is reserved when you're approved. Your store opens when you pay the plan.</p>
        <Button onClick={() => void submit()} disabled={busy} className="shrink-0">{busy ? "Sending…" : user ? "Send application" : "Sign in & apply"}</Button>
      </div>
    </div>
  );
}
