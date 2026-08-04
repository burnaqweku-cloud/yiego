import type { CSSProperties } from "react";
import { REASONS } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";

/**
 * Why choose YieGo — an asymmetric bento rather than a row of clones.
 * One reason carries the section (tall lead cell, emerald bloom behind
 * it); the rest sit around it in deliberately uneven spans and close on
 * a full-width band.
 *
 * Two structural rules worth keeping:
 *  1. Every span is written as a literal class string so Tailwind's
 *     scanner emits it.
 *  2. `data-reveal` sits on the <li>, never on `.mk-card`. `.mk-card` is
 *     declared after `[data-reveal]` in the same cascade layer at equal
 *     specificity, so its `transition` shorthand would win and reset
 *     `transition-delay` — silently killing the stagger.
 */

interface Cell {
  span: string;
  /** Lays out horizontally on large screens — the closing band. */
  wide?: boolean;
}

/** 12-col map: the lead cell holds cols 1–5 across rows 1–2, leaving 7. */
const CELLS: readonly Cell[] = [
  { span: "lg:col-span-4" },
  { span: "lg:col-span-3" },
  { span: "lg:col-span-3" },
  { span: "lg:col-span-4" },
  { span: "sm:col-span-2 lg:col-span-12", wide: true },
];

const FALLBACK: Cell = { span: "lg:col-span-4" };

export default function WhyYieGo() {
  const ref = useReveal<HTMLElement>();

  const featured = REASONS.find((r) => r.featured) ?? REASONS[0];
  const rest = REASONS.filter((r) => r !== featured);
  const FeaturedIcon = featured.icon;

  return (
    <section ref={ref} className="mk-section" aria-labelledby="why-h">
      <div className="mk-wrap">
        <div className="max-w-[38rem]" data-reveal>
          <span className="mk-eyebrow">Why YieGo</span>
          <h2 id="why-h" className="mk-h2 mt-4">
            The boring parts, <span className="mk-accent">done right</span>
          </h2>
          <p className="mk-lead mt-4">
            Nobody changes data vendor because of a nicer homepage. They change because an order
            vanished, or a payment did. These are the things we refuse to get wrong.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:mt-16 lg:grid-cols-12 lg:gap-6">
          {/* Lead cell — the anchor of the composition. */}
          <li className="sm:col-span-2 lg:col-span-5 lg:row-span-2" data-reveal>
            <div className="mk-card mk-card-hover relative h-full overflow-hidden p-6 sm:p-8 lg:p-9">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle, hsl(var(--primary) / 0.14), transparent 70%)",
                }}
              />
              <div className="relative flex h-full flex-col">
                <span className="mk-chip h-14 w-14 rounded-[16px]">
                  <FeaturedIcon size={25} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mk-h3 mt-6 text-[clamp(22px,2.7vw,29px)] leading-[1.14]">
                  {featured.title}
                </h3>
                <p className="mk-body mt-4 text-[15.5px]">{featured.body}</p>

                <div className="mt-auto flex flex-wrap gap-2 pt-8">
                  <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                    Paystack-verified payments
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                    Server-side wallet
                  </span>
                </div>
              </div>
            </div>
          </li>

          {rest.map((r, i) => {
            const cell = CELLS[i] ?? FALLBACK;
            const Icon = r.icon;
            const delay = { "--d": `${(i + 1) * 70}ms` } as CSSProperties;

            return (
              <li key={r.title} className={cell.span} data-reveal style={delay}>
                {cell.wide ? (
                  <div className="mk-card mk-card-hover h-full p-6 sm:p-7 lg:px-9 lg:py-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-9">
                      <span className="mk-chip shrink-0">
                        <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      <h3 className="mk-h3 lg:w-[16rem] lg:shrink-0">{r.title}</h3>
                      <p className="mk-body lg:max-w-[46ch]">{r.body}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mk-card mk-card-hover flex h-full flex-col p-6 sm:p-7">
                    <span className="mk-chip">
                      <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <h3 className="mk-h3 mt-5">{r.title}</h3>
                    <p className="mk-body mt-2.5">{r.body}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
