import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { FAQ_PREVIEW } from "@/data/faq";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

/**
 * Homepage FAQ — the handful of questions people check before a first order.
 * One panel open at a time; the full list lives at /faq.
 */

function AllQuestionsLink({ className, delay }: { className?: string; delay: string }) {
  return (
    <Link
      to="/faq"
      data-reveal
      style={{ "--d": delay } as React.CSSProperties}
      className={cn("mk-btn mk-btn-ghost group", className)}
    >
      View all questions
      <ArrowRight className="mk-arrow h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export default function FaqPreview() {
  const ref = useReveal<HTMLElement>();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section ref={ref} aria-labelledby="faq-preview-title" className="mk-section">
      <div className="mk-wrap">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          {/* Framing column — sticks while the answers scroll past it. */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <p data-reveal className="mk-eyebrow">
                Questions
              </p>
              <h2
                id="faq-preview-title"
                data-reveal
                style={{ "--d": "60ms" } as React.CSSProperties}
                className="mk-h2 mt-5"
              >
                Answered before you ask.
              </h2>
              <p
                data-reveal
                style={{ "--d": "120ms" } as React.CSSProperties}
                className="mk-lead mt-5 max-w-md"
              >
                Networks, delivery time, paying without an account — the things people
                check first. Everything else is on the full page.
              </p>
              <AllQuestionsLink delay="180ms" className="mt-8 hidden lg:inline-flex" />
            </div>
          </div>

          {/* Accordion */}
          <div className="lg:col-span-7">
            {FAQ_PREVIEW.map((item, i) => {
              const isOpen = open === i;
              const panelId = `faq-preview-panel-${i}`;
              const triggerId = `faq-preview-trigger-${i}`;

              return (
                <div
                  key={item.q}
                  data-reveal
                  style={{ "--d": `${i * 60}ms` } as React.CSSProperties}
                  className="mk-acc"
                  data-open={isOpen}
                >
                  <button
                    type="button"
                    id={triggerId}
                    className="mk-acc-trigger"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {item.q}
                    <span className="mk-acc-icon" aria-hidden="true">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </button>

                  <div
                    className="mk-acc-panel"
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                  >
                    <div>
                      <p className="mk-body pb-6 pr-10">{item.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            <AllQuestionsLink delay="120ms" className="mt-8 flex w-full lg:hidden" />
          </div>
        </div>
      </div>
    </section>
  );
}
