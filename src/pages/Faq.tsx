import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { FAQ_GROUPS } from "@/data/faq";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { faqPageLd } from "@/lib/structuredData";
import { useReveal } from "@/hooks/useReveal";

/* ══════════════════════════════════════════════════════════════
   FAQ — every question we have, grouped, with a sticky index on
   desktop. Answers come from src/data/faq.ts so the homepage
   preview and this page can never drift apart.
   ══════════════════════════════════════════════════════════════ */

const d = (ms: number) => ({ "--d": `${ms}ms` } as CSSProperties);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Groups with a stable in-page anchor id attached once, at module scope. */
const GROUPS = FAQ_GROUPS.map((group) => ({ ...group, id: `faq-${slugify(group.title)}` }));

export default function Faq() {
  const headRef = useReveal<HTMLElement>();
  const bodyRef = useReveal<HTMLDivElement>();
  const helpRef = useReveal<HTMLElement>();

  /** One open row across the whole page, keyed `${groupIndex}-${itemIndex}`. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>(GROUPS[0]?.id ?? "");

  /* Highlight the section the reader is currently inside. */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = GROUPS.map((g) => document.getElementById(g.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Seo {...metaFor("/faq")} jsonLd={faqPageLd(FAQ_GROUPS.flatMap((g) => g.items.map((i) => ({ q: i.q, a: i.a }))))} />
      {/* ── Page header ─────────────────────────────────────────── */}
      <section className="mk-section-tight" aria-labelledby="faq-title" ref={headRef}>
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-reveal>
            Questions
          </p>
          <h1
            id="faq-title"
            className="mk-display mt-6 max-w-[16ch] !text-[clamp(32px,5.5vw,54px)]"
            data-reveal
            style={d(70)}
          >
            Everything people actually ask us.
          </h1>
          <p className="mk-lead mt-7 max-w-[62ch]" data-reveal style={d(140)}>
            Delivery times, payments, wallets, references, what to do when an order stalls. If your
            question isn’t here, the 24/7 assistant or the support team will take it from you.
          </p>

          {/* Mobile section jump — the sticky index is desktop-only */}
          <nav aria-label="FAQ sections" className="mt-9 flex flex-wrap gap-2 lg:hidden" data-reveal style={d(200)}>
            {GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="mk-pill min-h-[44px] px-4">
                {g.title}
                <span className="font-mono text-[11px] text-faint-foreground">{g.items.length}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="mk-wrap">
        <hr className="mk-rule" />
      </div>

      {/* ── Index + answers ─────────────────────────────────────── */}
      <div className="mk-section-tight" ref={bodyRef}>
        <div className="mk-wrap">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-16">
            {/* Sticky index */}
            <aside className="hidden lg:block" data-reveal>
              <nav aria-label="Jump to a section" className="lg:sticky lg:top-28">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                  On this page
                </p>
                <ul className="mt-4 space-y-1">
                  {GROUPS.map((g) => {
                    const on = activeId === g.id;
                    return (
                      <li key={g.id}>
                        <a
                          href={`#${g.id}`}
                          aria-current={on ? "true" : undefined}
                          className={`flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 text-[14px] transition-colors ${
                            on
                              ? "bg-white/[0.05] font-semibold text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className="min-w-0">{g.title}</span>
                          <span className="font-mono text-[11px] text-faint-foreground">
                            {String(g.items.length).padStart(2, "0")}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-7 border-t border-white/[0.07] pt-6">
                  <p className="mk-body text-[13.5px]">Can’t find it here?</p>
                  <Link
                    to="/contact"
                    className="group mt-2 inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-semibold text-primary-glow"
                  >
                    Contact support
                    <ArrowRight size={14} className="mk-arrow" aria-hidden="true" />
                  </Link>
                </div>
              </nav>
            </aside>

            {/* Answers */}
            <div className="space-y-16 lg:space-y-20">
              {GROUPS.map((group, gi) => (
                <section
                  key={group.id}
                  id={group.id}
                  aria-labelledby={`${group.id}-title`}
                  className="scroll-mt-28"
                >
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-reveal>
                    <h2 id={`${group.id}-title`} className="mk-h3">
                      {group.title}
                    </h2>
                    <span className="font-mono text-[11px] tracking-[0.14em] text-faint-foreground">
                      {String(group.items.length).padStart(2, "0")}{" "}
                      {group.items.length === 1 ? "question" : "questions"}
                    </span>
                  </div>

                  <div className="mt-5 border-t border-white/[0.07]" data-reveal style={d(70)}>
                    {group.items.map((item, ii) => {
                      const key = `${gi}-${ii}`;
                      const open = openKey === key;
                      return (
                        <div key={key} className="mk-acc" data-open={open ? "true" : "false"}>
                          <h3>
                            <button
                              type="button"
                              id={`faq-trigger-${key}`}
                              className="mk-acc-trigger"
                              aria-expanded={open}
                              aria-controls={`faq-panel-${key}`}
                              onClick={() => setOpenKey(open ? null : key)}
                            >
                              <span className="min-w-0">{item.q}</span>
                              <span className="mk-acc-icon" aria-hidden="true">
                                <Plus size={15} />
                              </span>
                            </button>
                          </h3>
                          <div
                            id={`faq-panel-${key}`}
                            role="region"
                            aria-labelledby={`faq-trigger-${key}`}
                            className="mk-acc-panel"
                          >
                            <div>
                              <p className="mk-body max-w-[68ch] pb-7 pr-2 sm:pr-12">{item.a}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Still need help ─────────────────────────────────────── */}
      <section className="mk-section-tight pb-24" aria-labelledby="faq-help" ref={helpRef}>
        <div className="mk-wrap">
          <div className="mk-card p-7 sm:p-10" data-reveal>
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <div className="max-w-[46ch]">
                <h2 id="faq-help" className="mk-h3">
                  Still need help?
                </h2>
                <p className="mk-body mt-3">
                  The 24/7 assistant handles most questions on the spot. For anything tied to a
                  specific order, bring your YG- reference and the team will trace it with you.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/support" className="group mk-btn mk-btn-primary">
                  Get support
                  <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
                </Link>
                <Link to="/contact" className="mk-btn mk-btn-ghost">
                  Contact us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
