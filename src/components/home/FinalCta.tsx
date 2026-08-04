import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

/**
 * Closing panel — a dark jewel in both themes (tokens inside `.mk-cta` are
 * re-pinned to dark, so `text-foreground` reads near-white here).
 */
export default function FinalCta() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="final-cta-title" className="mk-section">
      <div className="mk-wrap">
        <div className="mk-cta">
          <div className="mk-cta-glow" aria-hidden="true" />

          <div className="relative mx-auto max-w-[560px] text-center">
            <p data-reveal className="mk-eyebrow">
              Ready when you are
            </p>

            <h2
              id="final-cta-title"
              data-reveal
              style={{ "--d": "70ms" } as React.CSSProperties}
              className="mk-h2 mt-5"
            >
              Data on the number, in minutes.
            </h2>

            <p
              data-reveal
              style={{ "--d": "140ms" } as React.CSSProperties}
              className="mk-lead mt-5"
            >
              Pick a bundle, enter the number, pay the way you already pay.
            </p>

            <div
              data-reveal
              style={{ "--d": "210ms" } as React.CSSProperties}
              className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
            >
              <Link to="/shop" className="mk-btn mk-btn-primary group">
                Start shopping
                <ArrowRight className="mk-arrow h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/track-order" className="mk-btn mk-btn-ghost">
                Track an order
              </Link>
            </div>

            <p
              data-reveal
              style={{ "--d": "280ms" } as React.CSSProperties}
              className="mt-7 text-[12.5px] leading-relaxed text-faint-foreground"
            >
              No account needed to buy · Pay with MoMo or card · Every order tracked
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
