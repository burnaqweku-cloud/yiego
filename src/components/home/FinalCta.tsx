import { Link } from "react-router-dom";

/**
 * Closing panel — a dark jewel in both themes (tokens inside `.mk-cta` are
 * re-pinned to dark, so `text-foreground` reads near-white here).
 */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="mk-section">
      <div className="mk-wrap">
        <div className="mk-cta">
          <div className="mk-cta-glow" aria-hidden="true" />

          <div className="relative mx-auto max-w-[560px] text-center">
            <p className="mk-eyebrow">
              Ready when you are
            </p>

            <h2
              id="final-cta-title"
              className="mk-h2 mt-3"
            >
              Pick a bundle. The data goes to the number.
            </h2>

            <p
              className="mk-lead mt-5"
            >
              Pick a bundle, enter the number, pay the way you already pay.
            </p>

            <div
              className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
            >
              <Link to="/shop" className="mk-btn mk-btn-primary">
                Start shopping
              </Link>
              <Link to="/track-order" className="mk-btn mk-btn-ghost">
                Track an order
              </Link>
            </div>

            <p
              className="mt-7 text-[12.5px] leading-relaxed text-faint-foreground"
            >
              No account needed to buy. Pay with MoMo or card. Every order tracked.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
