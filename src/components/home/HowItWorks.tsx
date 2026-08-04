import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { STEPS } from "@/data/marketing";

/**
 * How it works — one list, two shapes.
 * Mobile reads as a vertical rail (a continuous hairline threading the four
 * chips); at lg it opens into four connected columns.
 */

export default function HowItWorks() {
  const ref = useReveal<HTMLElement>();
  const last = STEPS.length - 1;

  return (
    <section ref={ref} className="mk-section" aria-labelledby="how-h">
      <div className="mk-wrap">
        <div className="max-w-[620px]" data-reveal>
          <span className="mk-eyebrow">How it works</span>
          <h2 id="how-h" className="mk-h2 mt-4">
            Four steps. About a minute.
          </h2>
          <p className="mk-lead mt-4 max-w-[48ch]">
            You do not need an account to buy — one is only worth it when you want a wallet and a record
            of every order you have ever placed.
          </p>
        </div>

        <ol className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-4 lg:gap-7">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.n}
                className="relative flex gap-5 lg:block lg:text-center"
                data-reveal
                style={{ "--d": `${i * 80}ms` } as CSSProperties}
              >
                {i < last && (
                  <>
                    {/* Mobile: hairline from under this chip down to the next one. */}
                    <span
                      className="absolute left-[23px] top-[56px] -bottom-10 w-px bg-white/[0.1] lg:hidden"
                      aria-hidden="true"
                    />
                    {/* Desktop: hairline across the gutter to the next column. */}
                    <span className="mk-step-line hidden lg:block" aria-hidden="true" />
                  </>
                )}

                <span className="mk-chip shrink-0 lg:mx-auto">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>

                <div className="min-w-0 lg:mt-6">
                  <span className="mk-step-n block">{step.n}</span>
                  <h3 className="mk-h3 mt-1.5">{step.title}</h3>
                  <p className="mk-body mt-2.5 max-w-[42ch] lg:mx-auto">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div
          className="mt-14 flex justify-center sm:mt-16"
          data-reveal
          style={{ "--d": `${(last + 1) * 80}ms` } as CSSProperties}
        >
          <Link to="/shop" className="mk-btn mk-btn-primary group w-full sm:w-auto">
            Start shopping
            <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
