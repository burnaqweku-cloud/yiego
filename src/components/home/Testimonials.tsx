import { TESTIMONIALS } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";

/**
 * Customer quotes.
 *
 * ⚠️  The quotes in `@/data/marketing` are PLACEHOLDER copy — they are rendered
 * exactly as written and nothing else is claimed here. No ratings, no review
 * counts, no "verified" badges, no logos: none of that is real yet, so none of
 * it is on the page. Swap the data for real, opted-in quotes before launch.
 */
export default function Testimonials() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="testimonials-title" className="mk-section">
      <div className="mk-wrap">
        {/* Header — headline left, framing line right on wide screens. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
          <div data-reveal className="max-w-xl">
            <p className="mk-eyebrow">Customers</p>
            <h2 id="testimonials-title" className="mk-h2 mt-5">
              Bought for a shop, a student, <span className="mk-accent">a mother</span>.
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
