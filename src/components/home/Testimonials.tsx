import { TESTIMONIALS, TESTIMONIALS_ARE_PLACEHOLDER } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";

/**
 * Customer quotes.
 *
 * The section is fully built, but it renders NOTHING while the quotes in
 * `@/data/marketing` are still placeholders — publishing invented reviews
 * (or visible "Placeholder name" rows) on a live storefront is worse than
 * having no testimonials at all.
 *
 * TO TURN IT ON: replace TESTIMONIALS with real, opted-in customer quotes
 * and set TESTIMONIALS_ARE_PLACEHOLDER to false in src/data/marketing.ts.
 *
 * Nothing else is claimed here on purpose — no ratings, no review counts,
 * no "verified" badges, no logos.
 */
export default function Testimonials() {
  const ref = useReveal<HTMLElement>();

  if (TESTIMONIALS_ARE_PLACEHOLDER || TESTIMONIALS.length === 0) return null;

  return (
    <section ref={ref} aria-labelledby="testimonials-title" className="mk-section">
      <div className="mk-wrap">
        {/* Header — headline left, framing line right on wide screens. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
          <div data-reveal className="max-w-xl">
            <p className="mk-eyebrow">Customers</p>
            <h2 id="testimonials-title" className="mk-h2 mt-5">
              Bought for a shop, a student, a mother.
            </h2>
          </div>
          <p
            data-reveal
            style={{ "--d": "70ms" } as React.CSSProperties}
            className="mk-lead max-w-sm lg:pb-1.5 lg:text-right"
          >
            Small orders, sent again next week, often to a number that isn&rsquo;t your own.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:gap-6 lg:mt-16 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure
              key={t.role}
              data-reveal
              style={{ "--d": `${140 + i * 80}ms` } as React.CSSProperties}
              className="mk-quote"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-1 select-none font-display text-[76px] leading-none text-white/[0.07]"
              >
                &ldquo;
              </span>

              <blockquote className="relative text-[15.5px] leading-[1.72] text-foreground">
                {t.quote}
              </blockquote>

              <figcaption className="mt-auto flex items-center gap-3 border-t border-white/[0.07] pt-6">
                <span aria-hidden="true" className="onyx-avatar shrink-0">
                  {t.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-foreground">
                    {t.name}
                  </span>
                  <span className="mk-body block truncate text-[13px]">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
