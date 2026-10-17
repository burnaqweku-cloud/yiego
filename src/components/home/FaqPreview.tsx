import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { FAQ_PREVIEW } from "@/data/faq";
import { cn } from "@/lib/utils";

/**
 * Homepage FAQ — the handful of questions people check before a first order.
 * One panel open at a time; the full list lives at /faq.
 */

function AllQuestionsLink({ className }: { className?: string }) {
  return (
    <Link to="/faq" className={cn("mk-btn mk-btn-ghost", className)}>
      View all questions
    </Link>
  );
}

export default function FaqPreview() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section aria-labelledby="faq-preview-title" className="mk-section">
      <div className="mk-wrap">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          {/* Framing column — sticks while the answers scroll past it. */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <p className="mk-eyebrow">
                Questions
              </p>
              <h2
                id="faq-preview-title"
                className="mk-h2 mt-3"
              >
                Answered before you ask.
              </h2>
              <p
                className="mk-lead mt-5 max-w-md"
              >
                Networks, paying without an account, what happens if an order fails: the things people
                check first. Everything else is on the full page.
              </p>
              <AllQuestionsLink className="mt-8 hidden lg:inline-flex" />
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

            <AllQuestionsLink className="mt-8 flex w-full lg:hidden" />
          </div>
        </div>
      </div>
    </section>
  );
}
