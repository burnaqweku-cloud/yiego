import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

/**
 * The first screen. No product shot and no mock-up — one confident line of
 * type, held in the middle of its own screen, over nothing but light.
 * Everything here is drawn from tokens, so it costs no images and changes
 * with the theme.
 *
 * `data-reveal` never sits on a class that declares a `transition` shorthand
 * (`.mk-btn`, `.mk-card`) — that shorthand is declared later in the same
 * cascade layer and would reset the stagger's transition-delay. Wrap those.
 */

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export default function Hero() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="mk-hero !pt-0" aria-labelledby="hero-h">
      {/* Background, back to front — see .mk-hero-bg in index.css. */}
      <div className="mk-hero-bg" aria-hidden="true">
        <span className="beam" />
        <span className="glow-a" />
        <span className="glow-b" />
        <span className="horizon" />
      </div>
      <div className="mk-hero-fade" aria-hidden="true" />

      <div className="relative z-10 mk-wrap">
        {/* Held in the middle of the first screen, but never taller than it. */}
        <div className="mx-auto flex min-h-[min(78svh,720px)] max-w-[60rem] flex-col items-center justify-center py-16 text-center sm:py-20">
          <div data-reveal style={delay(0)}>
            <span className="mk-pill">
              <span className="onyx-live-dot" aria-hidden="true" />
              Live bundles · MTN, Telecel &amp; AirtelTigo
            </span>
          </div>

          <h1
            id="hero-h"
            className="mk-hero-title mt-9 max-w-[15ch] text-balance"
            data-reveal
            style={delay(80)}
          >
            Data for any line, <span className="mk-accent">delivered in minutes.</span>
          </h1>

          <p className="mk-lead mt-8 max-w-[40rem] text-balance" data-reveal style={delay(150)}>
            Choose a bundle for MTN, Telecel or AirtelTigo, enter the number, and pay how you like.
            Every order carries a reference you can track.
          </p>

          <div
            className="mt-11 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
            data-reveal
            style={delay(220)}
          >
            <Link
              to="/shop"
              className="mk-btn mk-btn-primary group w-full !min-h-[54px] !px-8 !text-[15.5px] sm:w-auto"
            >
              Buy data
              <ArrowRight className="mk-arrow" size={18} aria-hidden="true" />
            </Link>
            <Link
              to="/track-order"
              className="mk-btn mk-btn-ghost w-full !min-h-[54px] !px-7 !text-[15.5px] sm:w-auto"
            >
              Track an order
            </Link>
          </div>

          <p
            className="mt-8 inline-flex items-center gap-2 text-[13px] text-faint-foreground"
            data-reveal
            style={delay(290)}
          >
            <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
            No account needed — buy as a guest and still track the order.
          </p>
        </div>
      </div>
    </section>
  );
}
