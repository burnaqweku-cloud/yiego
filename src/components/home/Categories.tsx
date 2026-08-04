import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CATEGORIES } from "@/data/marketing";
import type { Category } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";

/**
 * Featured networks — the three carriers YieGo actually delivers to.
 * Each card is a doorway into /shop, tinted by the carrier's own brand
 * colour through `--brand` (the one place a raw hex is allowed).
 *
 * Note: `data-reveal` lives on a wrapper, never on `.mk-cat` itself.
 * `.mk-cat` is declared after `[data-reveal]` in the same cascade layer
 * at equal specificity, so its `transition` shorthand would win and
 * reset `transition-delay` — killing the stagger.
 */

const MONOGRAM: Record<Category["id"], string> = {
  mtn: "MTN",
  telecel: "TEL",
  at: "AT",
};

export default function Categories() {
  const ref = useReveal<HTMLElement>();

  return (
    <section id="categories" ref={ref} className="mk-section" aria-labelledby="categories-h">
      <div className="mk-wrap">
        {/* Header — headline left, quiet escape hatch right on desktop. */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div className="max-w-[34rem]" data-reveal>
            <span className="mk-eyebrow">Networks</span>
            <h2 id="categories-h" className="mk-h2 mt-4">
              All three networks, one checkout
            </h2>
            <p className="mk-lead mt-4">
              Pick the network, pick the size, type the number receiving it. The data lands in
              minutes and every order carries a YG- reference you can follow.
            </p>
          </div>

          <div data-reveal style={{ "--d": "60ms" } as CSSProperties}>
            <Link
              to="/shop"
              className="group inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary-glow sm:pb-1"
            >
              View all bundles
              <ArrowRight className="mk-arrow" size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* The three carriers. */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:mt-14 lg:gap-6">
          {CATEGORIES.map((c, i) => (
            <div key={c.id} data-reveal style={{ "--d": `${i * 80}ms` } as CSSProperties}>
              <Link
                to="/shop"
                className="mk-cat group h-full"
                aria-label={`Browse ${c.name} data bundles`}
                style={{ "--brand": c.color } as CSSProperties}
              >
                <span className="mk-cat-mark" aria-hidden="true">
                  {MONOGRAM[c.id]}
                </span>

                <h3 className="mk-h3 mt-5">{c.name}</h3>
                <p className="mt-1.5 text-[12.5px] font-semibold tracking-[0.01em] text-primary-glow">
                  {c.blurb}
                </p>
                <p className="mk-body mt-3">{c.detail}</p>

                <span className="mt-auto flex items-center gap-2 pt-6 text-[13.5px] font-semibold text-foreground">
                  Browse bundles
                  <ArrowRight className="mk-arrow" size={15} aria-hidden="true" />
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
