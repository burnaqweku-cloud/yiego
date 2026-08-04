import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Clock3,
  Mail,
  MessageCircle,
  ReceiptText,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useContactSettings } from "@/hooks/useContactSettings";
import { useReveal } from "@/hooks/useReveal";

/* ══════════════════════════════════════════════════════════════
   Contact — channels only, no form: there is no endpoint behind
   one. WhatsApp, email and business hours are admin-managed, so
   each is rendered only when it is actually configured.
   ══════════════════════════════════════════════════════════════ */

const d = (ms: number) => ({ "--d": `${ms}ms` } as CSSProperties);

interface Channel {
  key: string;
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
  href: string;
}

/** Placeholder for a channel card while the contact block loads. */
function ChannelSkeleton() {
  return (
    <div className="mk-card p-7 sm:p-8">
      <div className="mk-skeleton h-[46px] w-[46px] rounded-[14px]" />
      <div className="mk-skeleton mt-6 h-4 w-2/5" />
      <div className="mk-skeleton mt-4 h-3 w-full" />
      <div className="mk-skeleton mt-2.5 h-3 w-4/5" />
      <div className="mk-skeleton mt-6 h-3 w-1/3" />
    </div>
  );
}

export default function Contact() {
  const { contact, whatsappUrl, loading } = useContactSettings();

  const headRef = useReveal<HTMLElement>();
  const bodyRef = useReveal<HTMLDivElement>();

  const channels: Channel[] = [];
  if (whatsappUrl) {
    channels.push({
      key: "whatsapp",
      icon: MessageCircle,
      title: "WhatsApp",
      body: "The fastest route to a person. Best for a stuck order, a payment that needs checking, or anything you would rather explain in your own words.",
      action: "Open WhatsApp",
      href: whatsappUrl,
    });
  }
  if (contact?.support_email) {
    channels.push({
      key: "email",
      icon: Mail,
      title: "Email",
      body: "Use email when there is detail to send — a dispute, a screenshot, a list of references. You get a written trail on both sides.",
      action: contact.support_email,
      href: `mailto:${contact.support_email}`,
    });
  }

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <section className="mk-section-tight" aria-labelledby="contact-title" ref={headRef}>
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-reveal>
            Contact
          </p>
          <h1
            id="contact-title"
            className="mk-display mt-6 max-w-[17ch] !text-[clamp(32px,5.5vw,54px)]"
            data-reveal
            style={d(70)}
          >
            Talk to someone who can <span className="mk-accent">open the order</span>.
          </h1>
          <p className="mk-lead mt-7 max-w-[62ch]" data-reveal style={d(140)}>
            Start with the assistant for anything quick — it is awake at any hour. For a stuck
            order, a payment question or a dispute, message the team directly and bring your YieGo
            reference so we are both looking at the same thing.
          </p>
        </div>
      </section>

      <div className="mk-wrap">
        <hr className="mk-rule" />
      </div>

      {/* ── Channels + context ──────────────────────────────────── */}
      <div className="mk-section-tight pb-24" ref={bodyRef}>
        <div className="mk-wrap">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
            {/* Channels */}
            <section className="lg:col-span-7" aria-labelledby="contact-channels">
              <h2
                id="contact-channels"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground"
                data-reveal
              >
                Ways to reach us
              </h2>

              <div className="mt-5 space-y-4">
                {/* Always available — needs no configuration */}
                <Link
                  to="/support/ai"
                  className="mk-card mk-card-hover group block p-7 sm:p-8"
                  data-reveal
                  style={d(60)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="mk-chip">
                      <Bot size={21} aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-success/[0.12] px-2.5 py-1 text-[11px] font-semibold text-success">
                      Always on
                    </span>
                  </div>
                  <h3 className="mk-h3 mt-6">YieGo AI assistant</h3>
                  <p className="mk-body mt-3 max-w-[52ch]">
                    Answers on buying data, payments, the wallet, shared payments, tracking and what
                    to do when an order stalls. No queue, no waiting for office hours.
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-[13.5px] font-semibold text-primary-glow">
                    Start a chat
                    <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
                  </span>
                </Link>

                {loading ? (
                  <div role="status" aria-live="polite" className="space-y-4">
                    <span className="sr-only">Loading contact options</span>
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                  </div>
                ) : (
                  channels.map((c, i) => (
                    <a
                      key={c.key}
                      href={c.href}
                      {...(c.key === "whatsapp"
                        ? { target: "_blank", rel: "noreferrer noopener" }
                        : {})}
                      className="mk-card mk-card-hover group block p-7 sm:p-8"
                      data-reveal
                      style={d(130 + i * 70)}
                    >
                      <span className="mk-chip">
                        <c.icon size={21} aria-hidden="true" />
                      </span>
                      <h3 className="mk-h3 mt-6">{c.title}</h3>
                      <p className="mk-body mt-3 max-w-[52ch]">{c.body}</p>
                      <span className="mt-6 flex items-center gap-2 text-[13.5px] font-semibold text-primary-glow">
                        <span className="min-w-0 break-words">{c.action}</span>
                        <ArrowUpRight size={15} className="mk-arrow shrink-0" aria-hidden="true" />
                      </span>
                    </a>
                  ))
                )}
              </div>
            </section>

            {/* Context */}
            <aside className="lg:col-span-5" aria-labelledby="contact-aside">
              <h2
                id="contact-aside"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground"
                data-reveal
              >
                Good to know
              </h2>

              <div className="mt-5 space-y-4">
                {/* Business hours — only if the team has published them */}
                {loading ? (
                  <div className="mk-card p-6 sm:p-7">
                    <div className="mk-skeleton h-3 w-1/3" />
                    <div className="mk-skeleton mt-4 h-4 w-3/5" />
                  </div>
                ) : (
                  contact?.business_hours && (
                    <div className="mk-card p-6 sm:p-7" data-reveal style={d(60)}>
                      <div className="flex items-start gap-4">
                        <span className="mk-chip shrink-0">
                          <Clock3 size={20} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-foreground">
                            When people are online
                          </h3>
                          <p className="mt-1.5 text-[14.5px] leading-[1.6] text-foreground">
                            {contact.business_hours}
                          </p>
                          <p className="mk-body mt-2 text-[13.5px]">
                            Outside those hours the assistant still answers, and messages are picked
                            up when the team is back.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Security — deliberately loud */}
                <div
                  className="mk-card border-amber/25 bg-amber/[0.07] p-6 sm:p-7"
                  data-reveal
                  style={d(130)}
                >
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-amber/25 bg-amber/[0.1] text-amber">
                      <ShieldAlert size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-foreground">
                        We will never ask for these
                      </h3>
                      <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground">
                        Never share your password, a one-time code, your card details or your Mobile
                        Money PIN. YieGo staff and the AI assistant will never ask you for any of
                        them — not on WhatsApp, not by email, not on a call. If a message asks, stop
                        and report it.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Prep */}
                <div className="mk-card p-6 sm:p-7" data-reveal style={d(200)}>
                  <div className="flex items-start gap-4">
                    <span className="mk-chip shrink-0">
                      <ReceiptText size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-foreground">
                        Before you contact us
                      </h3>
                      <ul className="mt-3 space-y-3">
                        <li className="flex gap-3 text-[14px] leading-[1.6] text-muted-foreground">
                          <span
                            className="mt-[9px] h-px w-3 shrink-0 bg-white/25"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            Have your <strong className="font-semibold text-foreground">YG-</strong>{" "}
                            reference ready. Every order has one, and it is the fastest way to find
                            yours.
                          </span>
                        </li>
                        <li className="flex gap-3 text-[14px] leading-[1.6] text-muted-foreground">
                          <span
                            className="mt-[9px] h-px w-3 shrink-0 bg-white/25"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            Check the order status first — some networks confirm a little later than
                            others.
                          </span>
                        </li>
                        <li className="flex gap-3 text-[14px] leading-[1.6] text-muted-foreground">
                          <span
                            className="mt-[9px] h-px w-3 shrink-0 bg-white/25"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            Quick questions on delivery, payments and refunds are usually already
                            answered.
                          </span>
                        </li>
                      </ul>
                      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                        <Link
                          to="/track-order"
                          className="group inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-semibold text-primary-glow"
                        >
                          Track an order
                          <ArrowRight size={14} className="mk-arrow" aria-hidden="true" />
                        </Link>
                        <Link
                          to="/faq"
                          className="group inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Read the FAQ
                          <ArrowRight size={14} className="mk-arrow" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
