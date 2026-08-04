import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ReceiptText } from "lucide-react";
import GuillocheMesh from "@/components/fx/GuillocheMesh";
import { useReveal } from "@/hooks/useReveal";

/**
 * The first screen. Copy on the left, a working mock of a real YieGo order
 * on the right — built entirely from tokens and CSS, no images.
 *
 * Conventions worth keeping:
 *  · `data-reveal` never sits on a class that declares a `transition`
 *    shorthand (`.mk-btn`, `.mk-card`) — that shorthand is declared later in
 *    the same cascade layer and would reset the stagger's transition-delay.
 *    Wrap those instead.
 *  · The order card is decorative illustration, so the whole visual column is
 *    `aria-hidden` — a screen reader should never hear a fictional order.
 */

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Stage = "idle" | "sending" | "done";

/**
 * Mock order card. On load it plays one calm beat — the delivery bar fills,
 * then the status flips to Delivered — and then stays put. No looping.
 */
function OrderPreview() {
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    if (prefersReducedMotion()) {
      setStage("done");
      return;
    }
    const start = window.setTimeout(() => setStage("sending"), 600);
    const finish = window.setTimeout(() => setStage("done"), 2900);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(finish);
    };
  }, []);

  const done = stage === "done";

  return (
    <div className="onyx-wallet relative overflow-hidden rounded-[26px] p-5 pb-7 sm:p-6 sm:pb-7">
      <GuillocheMesh />
      <span className="onyx-wallet-sheen" aria-hidden="true" />
      <span className="onyx-wallet-edge" aria-hidden="true" />

      <div className="relative">
        {/* Network + payment state */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border font-display text-[12px] font-bold tracking-tight"
              style={
                {
                  "--brand": "#FFCB05",
                  color: "var(--brand)",
                  borderColor: "color-mix(in srgb, var(--brand) 38%, transparent)",
                  background: "color-mix(in srgb, var(--brand) 14%, transparent)",
                } as CSSProperties
              }
            >
              MTN
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                MTN Ghana
              </p>
              <p className="text-[12px] text-faint-foreground">Data bundle</p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11.5px] font-semibold text-success">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
            Paid
          </span>
        </div>

        {/* The bundle and what it costs */}
        <div className="mt-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-faint-foreground">
              Bundle
            </p>
            <p className="onyx-balance mt-2.5">5GB</p>
            <p className="mt-2 text-[12px] text-faint-foreground">Valid for 30 days</p>
          </div>

          <div className="text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-faint-foreground">
              Total
            </p>
            <p className="mt-2.5 flex items-baseline justify-end gap-1.5">
              <span className="onyx-cur">GH₵</span>
              <span className="font-display text-[26px] font-semibold tracking-tight text-foreground">
                24.00
              </span>
            </p>
          </div>
        </div>

        {/* Where it is going, and how it was paid for */}
        <dl className="mt-7 grid gap-3 border-t border-white/[0.07] pt-5 text-[13px]">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-faint-foreground">Recipient</dt>
            <dd className="font-mono tabular-nums tracking-[0.04em] text-foreground">024 ••• 221</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-faint-foreground">Paid with</dt>
            <dd className="font-medium text-foreground">YieGo wallet</dd>
          </div>
        </dl>

        {/* Delivery */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            {done ? (
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-success">
                <Check size={14} strokeWidth={3} aria-hidden="true" />
                Delivered
              </span>
            ) : (
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
                <span className="onyx-live-dot" aria-hidden="true" />
                Sending to MTN
              </span>
            )}
            <span className="text-[11.5px] text-faint-foreground">
              {done ? "1 min 12 sec" : "Usually under 2 min"}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-[width] duration-[2200ms] ease-out motion-reduce:transition-none"
              style={{
                width: stage === "idle" ? "8%" : "100%",
                background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary-glow)))",
                boxShadow: "0 0 16px hsl(var(--primary) / 0.5)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const ref = useReveal<HTMLElement>();

  const goToCategories = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById("categories");
    if (!target) return; // No section on this page — let the anchor do its job.
    event.preventDefault();
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <section ref={ref} className="mk-hero" aria-labelledby="hero-h">
      <div className="mk-hero-grid" aria-hidden="true" />

      <div className="relative z-10 mk-wrap">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* ── Copy ─────────────────────────────────────────── */}
          <div className="max-w-[36rem]">
            <div data-reveal style={delay(0)}>
              <span className="mk-pill">
                <span className="onyx-live-dot" aria-hidden="true" />
                Live bundles · MTN, Telecel &amp; AirtelTigo
              </span>
            </div>

            <h1 id="hero-h" className="mk-display mt-7" data-reveal style={delay(70)}>
              Data for any line,{" "}
              <span className="mk-accent">delivered in minutes.</span>
            </h1>

            <p className="mk-lead mt-6 max-w-[33rem]" data-reveal style={delay(140)}>
              Choose a bundle for MTN, Telecel or AirtelTigo, enter the number, and pay how you
              like. Every order carries a reference you can track.
            </p>

            <div
              className="mt-9 flex flex-wrap items-center gap-3"
              data-reveal
              style={delay(210)}
            >
              <Link to="/shop" className="mk-btn mk-btn-primary group w-full sm:w-auto">
                Start shopping
                <ArrowRight className="mk-arrow" size={17} aria-hidden="true" />
              </Link>
              <a
                href="#categories"
                onClick={goToCategories}
                className="mk-btn mk-btn-ghost w-full sm:w-auto"
              >
                Explore categories
              </a>
            </div>

            <p className="mt-5 text-[13px] text-faint-foreground" data-reveal style={delay(280)}>
              No account needed — buy as a guest and still track the order.
            </p>
          </div>

          {/* ── The order, mid-flight ────────────────────────── */}
          <div className="relative" data-reveal style={delay(120)} aria-hidden="true">
            <div
              className="pointer-events-none absolute -inset-8 blur-3xl"
              style={{
                background:
                  "radial-gradient(58% 54% at 62% 34%, hsl(var(--primary) / 0.18), transparent 70%)",
              }}
            />

            <OrderPreview />

            {/* The reference that follows the order — hidden on small screens. */}
            <div className="mk-card absolute -bottom-12 -left-6 z-20 hidden items-center gap-3 rounded-2xl px-4 py-3.5 shadow-2xl backdrop-blur-xl sm:flex">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/10 text-primary-glow">
                <ReceiptText size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                  Order reference
                </p>
                <p className="mt-1 font-mono text-[13.5px] font-semibold tracking-[0.06em] text-foreground">
                  YG-8F2K41
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
