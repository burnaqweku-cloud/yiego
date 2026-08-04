import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Bot, Clock, Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useContactSettings } from "@/hooks/useContactSettings";
import { useReveal } from "@/hooks/useReveal";

/** The questions the assistant is actually asked, in the order they arrive. */
const COMMON_ASKS = [
  "Why an order still says pending",
  "Sending a payment link to someone else",
  "Topping up the wallet with Mobile Money",
  "Finding an order from its YG- reference",
];

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** A section that reveals its own `[data-reveal]` children on entry.
 *  Scoped per section so blocks that mount after the fetch resolves
 *  still get observed — give those a `key` that changes on load. */
function RevealSection({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} {...props}>
      {children}
    </section>
  );
}

function ChannelSkeleton() {
  return (
    <div className="mk-card p-6 sm:p-7">
      <div className="mk-skeleton h-[46px] w-[46px] rounded-[14px]" />
      <div className="mk-skeleton mt-6 h-4 w-32" />
      <div className="mk-skeleton mt-5 h-3 w-full" />
      <div className="mk-skeleton mt-2.5 h-3 w-4/5" />
      <div className="mk-skeleton mt-7 h-3 w-36" />
    </div>
  );
}

export default function Support() {
  const { contact, whatsappUrl, loading } = useContactSettings();

  const showWhatsapp = Boolean(contact?.is_whatsapp_enabled) && Boolean(whatsappUrl);
  const showEmail = Boolean(contact?.support_email);
  const showChannels = loading || showWhatsapp || showEmail;
  const phase = loading ? "loading" : "ready";

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <RevealSection className="mk-section-tight pb-0" aria-labelledby="support-title">
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-reveal>
            Help
          </p>
          <h1
            id="support-title"
            className="mk-display mt-5 max-w-[15ch] !text-[clamp(32px,5.5vw,54px)]"
            data-reveal
            style={delay(70)}
          >
            Help, <span className="mk-accent">at any hour</span>.
          </h1>
          <p className="mk-lead mt-6 max-w-[60ch]" data-reveal style={delay(140)}>
            The assistant settles most things on the spot — a pending order, a wallet top-up that has
            not shown up, a shared payment link, a YG- reference you want traced. When it needs a
            human, WhatsApp and email reach the YieGo team directly.
          </p>
        </div>
      </RevealSection>

      {/* ── The assistant, first ────────────────────────────────── */}
      <RevealSection className="pt-12 sm:pt-16" aria-labelledby="assistant-title">
        <div className="mk-wrap">
          <div className="mk-card p-6 sm:p-9" data-reveal>
            <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-12">
              <div className="min-w-0">
                <span className="mk-chip">
                  <Bot size={21} aria-hidden="true" />
                </span>
                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 id="assistant-title" className="mk-h3">
                    YieGo AI
                  </h2>
                  <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/[0.09] px-3 py-1 text-[11.5px] font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                    Always available
                  </span>
                </div>
                <p className="mk-body mt-3 max-w-[54ch]">
                  It knows how buying, paying, tracking and refunds work on YieGo, and it can read
                  the status of an order from its reference. Ask in plain English — no ticket, no
                  queue, no waiting for morning.
                </p>
                <Link to="/support/ai" className="mk-btn mk-btn-primary group mt-8">
                  Chat with YieGo AI
                  <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
                </Link>
              </div>

              <div className="min-w-0 lg:border-l lg:border-white/[0.07] lg:pl-12">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                  What people ask it
                </p>
                <ul className="mt-4">
                  {COMMON_ASKS.map((ask) => (
                    <li
                      key={ask}
                      className="border-t border-white/[0.07] py-3 text-sm leading-6 text-muted-foreground first:border-t-0 first:pt-0"
                    >
                      {ask}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ── Human channels ──────────────────────────────────────── */}
      {showChannels && (
        <RevealSection key={`channels-${phase}`} className="pt-14 sm:pt-20" aria-labelledby="people-title">
          <div className="mk-wrap">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="people-title" className="mk-h3 max-w-[20ch]" data-reveal>
                When it needs a person
              </h2>
              <p className="mk-body max-w-[42ch] sm:text-right" data-reveal style={delay(70)}>
                Send the YG- reference and the recipient number in your first message — it saves a
                round trip.
              </p>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {loading && (
                <>
                  <ChannelSkeleton />
                  <ChannelSkeleton />
                </>
              )}

              {!loading && showWhatsapp && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mk-card mk-card-hover group flex flex-col p-6 sm:p-7"
                  data-reveal
                >
                  <span className="mk-chip text-success">
                    <MessageCircle size={20} aria-hidden="true" />
                  </span>
                  <h3 className="mk-h3 mt-6">WhatsApp</h3>
                  <p className="mk-body mt-2.5 flex-1">
                    The fastest way to reach a person. Best for an order that has stalled, or money
                    that left your wallet without a bundle arriving.
                  </p>
                  {contact?.whatsapp_number && (
                    <p className="mt-5 font-mono text-[13px] tracking-tight text-foreground">
                      {contact.whatsapp_number}
                    </p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">
                    Open WhatsApp
                    <ArrowUpRight size={16} className="mk-arrow" aria-hidden="true" />
                  </span>
                </a>
              )}

              {!loading && showEmail && (
                <a
                  href={`mailto:${contact?.support_email ?? ""}`}
                  className="mk-card mk-card-hover group flex flex-col p-6 sm:p-7"
                  data-reveal
                  style={delay(80)}
                >
                  <span className="mk-chip">
                    <Mail size={20} aria-hidden="true" />
                  </span>
                  <h3 className="mk-h3 mt-6">Email</h3>
                  <p className="mk-body mt-2.5 flex-1">
                    Better for a dispute with detail behind it — screenshots, transaction IDs, a
                    timeline. It stays on the record and you get a written reply.
                  </p>
                  <p className="mt-5 break-all font-mono text-[13px] tracking-tight text-foreground">
                    {contact?.support_email}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">
                    Write to us
                    <ArrowUpRight size={16} className="mk-arrow" aria-hidden="true" />
                  </span>
                </a>
              )}
            </div>
          </div>
        </RevealSection>
      )}

      {/* ── Hours + the one rule that matters ───────────────────── */}
      <RevealSection
        key={`safety-${phase}`}
        className={showChannels ? "pt-4" : "pt-14 sm:pt-20"}
        aria-label="Support hours and account safety"
      >
        <div className="mk-wrap">
          <div
            className={
              contact?.business_hours
                ? "grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
                : "grid gap-4"
            }
          >
            {contact?.business_hours && (
              <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-6" data-reveal>
                <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                  <Clock size={14} aria-hidden="true" />
                  Human support hours
                </p>
                <p className="mt-3 text-[15px] font-semibold leading-6 text-foreground">
                  {contact.business_hours}
                </p>
                <p className="mk-body mt-2">
                  Outside them the assistant still answers, and anything it cannot close is waiting
                  for the team in the morning.
                </p>
              </div>
            )}

            <div
              className="rounded-[22px] border border-amber/25 bg-amber/[0.08] p-6"
              data-reveal
              style={delay(80)}
            >
              <div className="flex gap-4">
                <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                    Nobody at YieGo will ask for your PIN
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ink-out">
                    Never send your password, one-time code, card details or Mobile Money PIN to the
                    AI assistant or a support agent. Your order reference and the recipient number
                    are all anyone here needs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ── Closing links ───────────────────────────────────────── */}
      <RevealSection className="mk-section-tight" aria-labelledby="more-help-title">
        <div className="mk-wrap">
          <hr className="mk-rule" />
          <div className="mt-9 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="more-help-title" className="mk-h3 max-w-[24ch]" data-reveal>
              Rather read it yourself?
            </h2>
            <div className="flex flex-wrap gap-3" data-reveal style={delay(70)}>
              <Link to="/faq" className="mk-btn mk-btn-ghost group">
                Read the FAQ
                <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
              </Link>
              <Link to="/contact" className="mk-btn mk-btn-ghost group">
                Contact the team
                <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </RevealSection>
    </>
  );
}
