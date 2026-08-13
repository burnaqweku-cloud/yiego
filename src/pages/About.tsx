import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Headphones, Radar, ShieldCheck, Tag, type LucideIcon } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

/* ══════════════════════════════════════════════════════════════
   About — why YieGo exists, in plain language.
   Everything here is verifiable from how the product behaves.
   No invented numbers, dates, team size or awards.
   ══════════════════════════════════════════════════════════════ */

/** Reveal delay helper — keeps the stagger readable at the call site. */
const d = (ms: number) => ({ "--d": `${ms}ms` } as CSSProperties);

interface Contrast {
  was: string;
  now: string;
}

const CONTRASTS: Contrast[] = [
  {
    was: "A short code you have to remember correctly, usually at the exact moment your data has run out.",
    now: "A price list you can read on any browser, with the amount fixed before a pesewa moves.",
  },
  {
    was: "A vendor who is offline, on a break, or simply asleep when you need a bundle at 5am.",
    now: "Orders go to the network automatically the moment payment clears — nobody has to be awake.",
  },
  {
    was: "A payment you cannot prove afterwards. No receipt, nothing to quote to anybody.",
    now: "A YieGo reference beginning with YG- on every single order, checkable without logging in.",
  },
  {
    was: "Money scattered across one-off top-ups you never see again.",
    now: "A wallet you top up once, with every credit and debit written into your statement.",
  },
];

interface Value {
  icon: LucideIcon;
  title: string;
  body: string;
}

const VALUES: Value[] = [
  {
    icon: Tag,
    title: "The same price for everyone",
    body: "The same bundle costs the same whether it is your first order or your fiftieth — no special rates and no moving targets.",
  },
  {
    icon: Radar,
    title: "Delivery you can verify",
    body: "Every order carries a YG- reference from the second it is created. Put it into Track Order and you see where the order genuinely stands — including the days a network is being slow.",
  },
  {
    icon: Headphones,
    title: "Support that actually answers",
    body: "An AI assistant that is awake at 3am for the ordinary questions, and real people on WhatsApp and email for the ones that need judgement.",
  },
  {
    icon: ShieldCheck,
    title: "Your money, handled properly",
    body: "Payments are confirmed with Paystack on our servers before an order moves, and a wallet balance can only be changed server-side — never from a phone or a browser. YieGo never sees your card details or your Mobile Money PIN.",
  },
];

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Choose the network",
    body: "MTN, Telecel or AirtelTigo — then the bundle you want, at the price on screen.",
  },
  {
    n: "02",
    title: "Enter the number",
    body: "The line that should receive the data: yours, a family member’s, or a customer’s.",
  },
  {
    n: "03",
    title: "Pay how it suits you",
    body: "From your YieGo wallet, by Mobile Money or card, as a guest — or share the order for someone else to pay.",
  },
  {
    n: "04",
    title: "Watch it land",
    body: "Delivery is automatic and usually takes minutes. The reference stays with the order for good.",
  },
];

export default function About() {
  const headRef = useReveal<HTMLElement>();
  const whyRef = useReveal<HTMLElement>();
  const valuesRef = useReveal<HTMLElement>();
  const howRef = useReveal<HTMLElement>();
  const ctaRef = useReveal<HTMLElement>();

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <section className="mk-section-tight" aria-labelledby="about-title" ref={headRef}>
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-reveal>
            About YieGo
          </p>
          <h1
            id="about-title"
            className="mk-display mt-6 max-w-[17ch] !text-[clamp(32px,5.5vw,54px)]"
            data-reveal
            style={d(70)}
          >
            Data should arrive <span className="mk-accent">without a story</span> attached.
          </h1>
          <p className="mk-lead mt-7 max-w-[62ch]" data-reveal style={d(140)}>
            YieGo sells prepaid data bundles for MTN, Telecel and AirtelTigo. You pick a network,
            pick a bundle, type the number that should receive it, and pay — from your wallet, by
            Mobile Money or card, or by handing the order to someone else to settle. The data lands
            in minutes, and the order keeps a reference you can come back to.
          </p>
        </div>
      </section>

      <div className="mk-wrap">
        <hr className="mk-rule" />
      </div>

      {/* ── Why we built it ─────────────────────────────────────── */}
      <section className="mk-section" aria-labelledby="about-why" ref={whyRef}>
        <div className="mk-wrap">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <div data-reveal>
              <p className="mk-eyebrow">Why we built it</p>
              <h2 id="about-why" className="mk-h2 mt-6 max-w-[15ch]">
                Buying data was never the hard part.
              </h2>
            </div>

            <div className="max-w-[64ch] space-y-5">
              <p className="mk-lead" data-reveal style={d(80)}>
                Most data in Ghana is bought one of two ways: a USSD string you half-remember, or a
                vendor somewhere in a WhatsApp thread. Both work fine — right up until the moment
                they don’t.
              </p>
              <p className="mk-body" data-reveal style={d(150)}>
                What stings is not the failed purchase. It is what comes after. There is nothing to
                point at: no receipt, no reference, no status you can check at eleven at night. You
                end up describing a transaction from memory and hoping the person on the other end
                takes your word for it.
              </p>
              <p className="mk-body" data-reveal style={d(220)}>
                So YieGo was built around the unglamorous parts. Show the price before the money
                moves. Send the order to the network automatically instead of waiting for a person.
                And give every purchase a reference that outlives the conversation.
              </p>
            </div>
          </div>

          {/* Contrast rows — the old way against how it works here */}
          <div className="mt-16 lg:mt-20" data-reveal style={d(80)}>
            <div className="hidden pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-10">
              <span>What used to happen</span>
              <span>How YieGo handles it</span>
            </div>
            <dl className="border-t border-white/[0.07]">
              {CONTRASTS.map((row) => (
                <div
                  key={row.now}
                  className="grid gap-3 border-b border-white/[0.07] py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-10"
                >
                  <dt className="text-[14.5px] leading-[1.66] text-faint-foreground">{row.was}</dt>
                  <dd className="flex items-start gap-3 text-[14.5px] leading-[1.66] text-foreground">
                    <ArrowRight
                      size={15}
                      className="mt-[5px] shrink-0 text-primary-glow"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">{row.now}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="mk-wrap">
        <hr className="mk-rule" />
      </div>

      {/* ── What we believe ─────────────────────────────────────── */}
      <section className="mk-section" aria-labelledby="about-values" ref={valuesRef}>
        <div className="mk-wrap">
          <div className="max-w-[52ch]" data-reveal>
            <p className="mk-eyebrow">What we believe</p>
            <h2 id="about-values" className="mk-h2 mt-6">
              Four things we would rather be judged on than a slogan.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:gap-5 lg:mt-16 lg:grid-cols-12">
            {VALUES.map((v, i) => (
              <article
                key={v.title}
                className={`mk-card p-7 sm:p-8 ${
                  i % 4 === 0 || i % 4 === 3 ? "lg:col-span-7" : "lg:col-span-5"
                }`}
                data-reveal
                style={d(60 + i * 70)}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="mk-chip">
                    <v.icon size={20} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-faint-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mk-h3 mt-6">{v.title}</h3>
                <p className="mk-body mt-3 max-w-[52ch]">{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="mk-wrap">
        <hr className="mk-rule" />
      </div>

      {/* ── How YieGo works ─────────────────────────────────────── */}
      <section className="mk-section" aria-labelledby="about-how" ref={howRef}>
        <div className="mk-wrap">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <div data-reveal>
              <p className="mk-eyebrow">How it works</p>
              <h2 id="about-how" className="mk-h2 mt-6 max-w-[14ch]">
                Four steps, no phone calls.
              </h2>
              <p className="mk-body mt-5 max-w-[38ch]">
                The whole product is one job done properly: getting a bundle onto a number and
                keeping a record of it.
              </p>
              <Link to="/faq" className="group mk-btn mk-btn-ghost mt-8">
                Read the full FAQ
                <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
              </Link>
            </div>

            <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li
                  key={s.n}
                  className="border-t border-white/[0.07] pt-5"
                  data-reveal
                  style={d(60 + i * 70)}
                >
                  <span className="mk-step-n">{s.n}</span>
                  <h3 className="mk-h3 mt-3 !text-[17px]">{s.title}</h3>
                  <p className="mk-body mt-2.5">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────── */}
      <section className="mk-section-tight pb-24" aria-labelledby="about-cta" ref={ctaRef}>
        <div className="mk-wrap">
          <div className="mk-cta" data-reveal>
            <span className="mk-cta-glow" aria-hidden="true" />
            <div className="relative">
              <p className="mk-eyebrow">Get started</p>
              <h2 id="about-cta" className="mk-h2 mt-6 max-w-[16ch]">
                Buy a bundle and see for yourself.
              </h2>
              <p className="mk-lead mt-6 max-w-[52ch]">
                You don’t need an account to try it — check out as a guest and keep the reference.
                If you would rather ask something first, the team is one message away.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link to="/shop" className="group mk-btn mk-btn-primary">
                  Browse bundles
                  <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
                </Link>
                <Link to="/contact" className="mk-btn mk-btn-ghost">
                  Talk to us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
