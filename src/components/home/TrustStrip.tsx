import type { CSSProperties } from "react";
import { TRUST_POINTS } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";

/**
 * The four facts a first-time visitor needs before they trust a payment page.
 * Deliberately quiet — hairline cells, muted icons, no colour. It reassures;
 * it does not sell.
 *
 * The reveal sits on the inner content, not the cell, so the strip's own
 * hairline grid is drawn immediately and only the contents fade in.
 */
export default function TrustStrip() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="pb-2 pt-1 sm:pb-6" aria-labelledby="trust-h">
      <div className="mk-wrap">
        <h2 id="trust-h" className="sr-only">
          What every DataYego order comes with
        </h2>

        <ul className="mk-trust" data-reveal>
          {TRUST_POINTS.map((point, i) => {
            const Icon = point.icon;
            return (
              <li key={point.label}>
                <div
                  className="flex items-start gap-3"
                  data-reveal
                  style={{ "--d": `${i * 70}ms` } as CSSProperties}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.8}
                    className="mt-[3px] shrink-0 text-faint-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold tracking-tight text-foreground">
                      {point.label}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-faint-foreground">
                      {point.detail}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
