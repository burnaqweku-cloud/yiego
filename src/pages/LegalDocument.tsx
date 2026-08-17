import { useEffect, useMemo, useState } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { isPublicRoute, metaFor } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_FALLBACKS } from "@/data/legal";
import { useReveal } from "@/hooks/useReveal";

interface LegalRow { title: string; summary: string; content: string; version: number; published_at: string | null; }

const DOCUMENTS = [
  { slug: "terms", label: "Terms of service" },
  { slug: "privacy", label: "Privacy policy" },
  { slug: "refunds", label: "Refund policy" },
];

/* ── Plain-text policy → readable prose ──────────────────────────
   Admins type these documents into a plain textarea, so the body
   arrives as text. These two helpers give it structure (headings,
   bullets, bold, links) without ever injecting HTML. */

type Block =
  | { kind: "h2" | "h3" | "p"; text: string }
  | { kind: "ul"; items: string[] };

/** A section that reveals its own `[data-reveal]` children on entry — the
 *  observer is wired when this section mounts, so content that arrives with
 *  the fetch is still picked up. */
function RevealSection({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} {...props}>
      {children}
    </section>
  );
}

const INLINE = /(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>()]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = new RegExp(INLINE.source, "g");
  let cursor = 0;
  let match = regex.exec(text);
  while (match) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyBase}-${match.index}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      nodes.push(
        <a key={key} href={match[3]} target="_blank" rel="noreferrer">
          {token.slice(1, token.indexOf("]"))}
        </a>,
      );
    } else if (/^https?:/i.test(token)) {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    } else {
      nodes.push(
        <a key={key} href={`mailto:${token}`}>
          {token}
        </a>,
      );
    }
    cursor = match.index + token.length;
    match = regex.exec(text);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function toBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push({ kind: "ul", items: bullets });
      bullets = [];
    }
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-*•·]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();

    const hashed = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hashed) {
      blocks.push({ kind: hashed[1].length <= 2 ? "h2" : "h3", text: hashed[2] });
      continue;
    }
    // A short, shouty or numbered standalone line is a section heading.
    const letters = line.replace(/[^A-Za-z]/g, "");
    const shouty = letters.length >= 3 && letters === letters.toUpperCase();
    if (line.length <= 80 && shouty) {
      blocks.push({ kind: "h2", text: line });
      continue;
    }
    if (line.length <= 80 && /^\d+(\.\d+)*[.)]?\s+\S/.test(line) && !/[.,;]$/.test(line)) {
      blocks.push({ kind: "h2", text: line });
      continue;
    }
    if (line.length <= 70 && line.endsWith(":")) {
      blocks.push({ kind: "h3", text: line.slice(0, -1) });
      continue;
    }
    blocks.push({ kind: "p", text: line });
  }
  flush();
  return blocks;
}

export default function LegalDocument() {
  const { slug = "privacy" } = useParams();
  const [document, setDocument] = useState<LegalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const seo = isPublicRoute(`/legal/${slug}`)
    ? <Seo {...metaFor(`/legal/${slug}`)} />
    : <Seo title="Document not found — DataYego" description="This legal document does not exist." path={`/legal/${slug}`} noindex />;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void (async () => {
      const { data } = await (supabase as unknown as { schema: (name: string) => any }).schema("phase1").from("legal_documents").select("title, summary, content, version, published_at").eq("slug", slug).eq("is_published", true).maybeSingle();
      if (!mounted) return;
      // A published document always wins. The bundled baseline only stands in
      // when nothing has been published, so these pages are never blank.
      setDocument((data as LegalRow | null) ?? LEGAL_FALLBACKS[slug] ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [slug]);

  const blocks = useMemo(() => toBlocks(document?.content ?? ""), [document?.content]);
  const others = DOCUMENTS.filter((item) => item.slug !== slug);

  // `.mk-eyebrow` is inline-flex, so the back link needs its own block row.
  const backLink = (
    <div>
      <Link
        to="/"
        className="group inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
        Back to DataYego
      </Link>
    </div>
  );

  if (loading) {
    return (
      <section className="mk-section-tight" aria-label="Loading document">
        {seo}
        <div className="mk-wrap">
          <div className="mk-skeleton h-3 w-28" />
          <div className="mk-skeleton mt-8 h-10 w-3/4 max-w-md rounded-xl" />
          <div className="mk-skeleton mt-6 h-3 w-full max-w-lg" />
          <div className="mt-16 max-w-[74ch] space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <div key={row} className={row % 4 === 3 ? "mk-skeleton h-3 w-2/3" : "mk-skeleton h-3 w-full"} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!document) {
    return (
      <section className="mk-section-tight" aria-labelledby="unavailable-title">
        {seo}
        <div className="mk-wrap">
          <div className="mk-card mx-auto max-w-xl p-8 text-center sm:p-10">
            <span className="mk-chip mx-auto">
              <FileText size={20} aria-hidden="true" />
            </span>
            <h1 id="unavailable-title" className="mk-h3 mt-6">
              This document is not published yet
            </h1>
            <p className="mk-body mt-3">
              It has either been taken down for an update or was never published. Nothing about your
              orders or wallet changes while it is away — ask support if you need the current terms.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/support" className="mk-btn mk-btn-primary group">
                Ask support
                <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
              </Link>
              <Link to="/" className="mk-btn mk-btn-ghost">
                Back to DataYego
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {seo}
      {/* ── Header ──────────────────────────────────────────────── */}
      <RevealSection className="mk-section-tight pb-0" aria-labelledby="legal-title">
        <div className="mk-wrap">
          {backLink}
          <p className="mk-eyebrow mt-6" data-reveal>
            Legal
          </p>
          <h1
            id="legal-title"
            className="mk-display mt-5 max-w-[18ch] !text-[clamp(32px,5.5vw,54px)]"
            data-reveal
            style={{ "--d": "70ms" } as CSSProperties}
          >
            {document.title}
          </h1>
          {document.summary && (
            <p className="mk-lead mt-6 max-w-[62ch]" data-reveal style={{ "--d": "140ms" } as CSSProperties}>
              {document.summary}
            </p>
          )}
          <p
            className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-faint-foreground"
            data-reveal
            style={{ "--d": "200ms" } as CSSProperties}
          >
            <span>Version {document.version}</span>
            {document.published_at && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Last updated{" "}
                  {new Date(document.published_at).toLocaleDateString("en-GH", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
          </p>
        </div>
      </RevealSection>

      {/* ── Document body ───────────────────────────────────────── */}
      <RevealSection className="mk-section-tight" aria-label={document.title}>
        <div className="mk-wrap">
          <hr className="mk-rule mb-12" />
          <article className="mk-prose max-w-[74ch]" data-reveal>
            {blocks.map((block, index) => {
              const key = `${block.kind}-${index}`;
              if (block.kind === "ul") {
                return (
                  <ul key={key}>
                    {block.items.map((item, itemIndex) => (
                      <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
                    ))}
                  </ul>
                );
              }
              if (block.kind === "h2") return <h2 key={key}>{block.text}</h2>;
              if (block.kind === "h3") return <h3 key={key}>{block.text}</h3>;
              return <p key={key}>{inline(block.text, key)}</p>;
            })}
          </article>
        </div>
      </RevealSection>

      {/* ── The other policies ──────────────────────────────────── */}
      <section className="mk-section-tight pt-0" aria-labelledby="other-legal-title">
        <div className="mk-wrap">
          <hr className="mk-rule" />
          <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="other-legal-title" className="text-[13px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
              Other policies
            </h2>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {others.map((item) => (
                <Link
                  key={item.slug}
                  to={`/legal/${item.slug}`}
                  className="group inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary-glow"
                >
                  {item.label}
                  <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
