import { ArrowLeft, ArrowRight, Clock3, Info } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import InlineText from "@/components/blog/InlineText";
import { metaFor } from "@/lib/site";
import { postBySlug, sortedPosts, type BlogBlock } from "@/data/blog";
import { articleLd, breadcrumbLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   /blog/:slug — one guide. The body is rendered from the typed
   blocks in src/data/blog.ts, so the markup is fixed here and a
   post can only supply text.
   ══════════════════════════════════════════════════════════════ */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "h2":
      return <h2>{block.text}</h2>;
    case "h3":
      return <h3>{block.text}</h3>;
    case "ul":
      return <ul>{block.items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ul>;
    case "ol":
      return <ol>{block.items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ol>;
    case "table":
      return (
        <div className="overflow-x-auto rounded-[18px] border border-white/[0.07]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] uppercase tracking-[0.14em] text-faint-foreground">
                {block.head.map((cell, i) => <th key={i} className="px-5 py-3.5 font-semibold">{cell}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.05] last:border-b-0">
                  {row.map((cell, j) => (
                    <td key={j} className={j === 0 ? "px-5 py-3.5 text-muted-foreground" : "px-5 py-3.5 font-mono text-[13.5px] text-foreground"}>
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout":
      return (
        <div className="flex gap-3 rounded-[18px] border border-primary-glow/20 bg-primary/[0.06] p-5">
          <Info size={17} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />
          <p className="text-sm leading-6 text-foreground"><InlineText text={block.text} /></p>
        </div>
      );
    case "cta":
      return (
        <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-6">
          <p className="text-sm leading-6 text-muted-foreground"><InlineText text={block.text} /></p>
          <Link to={block.to} className="mk-btn mk-btn-primary group mt-4">{block.label}<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
        </div>
      );
    default:
      return <p><InlineText text={block.text} /></p>;
  }
}

export default function BlogPost() {
  const { slug = "" } = useParams();
  const post = postBySlug(slug);

  if (!post) {
    return (
      <section className="mk-section-tight">
        <Seo title="Guide not found — DataYego" description="This guide does not exist." path={`/blog/${slug}`} noindex />
        <div className="mk-wrap py-16 text-center">
          <h1 className="mk-display !text-[clamp(26px,4vw,38px)]">This guide doesn't exist</h1>
          <p className="mk-lead mx-auto mt-4 max-w-[44ch]">The link may be old or mistyped.</p>
          <Link to="/blog" className="mk-btn mk-btn-primary group mt-7">All guides<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  const others = sortedPosts().filter((entry) => entry.slug !== post.slug).slice(0, 3);

  return (
    <section className="mk-section-tight" aria-labelledby="post-title">
      <Seo
        {...metaFor(`/blog/${post.slug}`)}
        jsonLd={[
          articleLd(post),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/blog" }, { name: post.heading, path: `/blog/${post.slug}` }]),
        ]}
      />
      <div className="mk-wrap">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft size={15} aria-hidden="true" />All guides
        </Link>

        <article className="mt-7 max-w-[68ch]">
          <p className="mk-eyebrow">{post.category}</p>
          <h1 id="post-title" className="mk-display mt-4 !text-[clamp(28px,4.4vw,42px)]">{post.heading}</h1>
          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint-foreground">
            <time dateTime={post.published}>Published {formatDate(post.published)}</time>
            {post.updated && <span>· Updated {formatDate(post.updated)}</span>}
            <span className="inline-flex items-center gap-1.5">· <Clock3 size={13} aria-hidden="true" />{post.readMinutes} min read</span>
          </p>

          <div className="mk-prose mt-9">
            {post.body.map((block, index) => <Block key={index} block={block} />)}
          </div>
        </article>

        {others.length > 0 && (
          <div className="mt-16 border-t border-white/[0.07] pt-9">
            <h2 className="mk-h3">More guides</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {others.map((entry) => (
                <article key={entry.slug} className="mk-card mk-card-hover p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{entry.category}</p>
                  <h3 className="mt-2.5 font-display text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                    <Link to={`/blog/${entry.slug}`} className="after:absolute after:inset-0">{entry.heading}</Link>
                  </h3>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
