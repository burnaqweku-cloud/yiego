import { ArrowRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { sortedPosts } from "@/data/blog";
import { breadcrumbLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   /blog — the index. Its job for search is to give every post an
   internal link from a crawlable page; its job for a reader is to
   make the useful one obvious in a glance.
   ══════════════════════════════════════════════════════════════ */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function Blog() {
  const posts = sortedPosts();

  return (
    <section className="mk-section-tight" aria-labelledby="blog-title">
      <Seo {...metaFor("/blog")} jsonLd={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/blog" }])} />
      <div className="mk-wrap">
        <p className="mk-eyebrow">DataYego guides</p>
        <h1 id="blog-title" className="mk-display mt-5 max-w-[18ch] !text-[clamp(30px,5vw,50px)]">Data guides for Ghana</h1>
        <p className="mk-lead mt-6 max-w-[62ch]">
          Straight answers about buying and using data in Ghana — the short codes worth saving, how to pay with Mobile Money, and what actually happens to a bundle after you buy it. No fluff, and nothing we could not verify.
        </p>

        {posts.length === 0 ? (
          <p className="mt-12 text-sm text-muted-foreground">The first guides are being written. Meanwhile, the <Link className="font-semibold text-primary-glow underline" to="/faq">FAQ</Link> answers the common questions.</p>
        ) : (
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {posts.map((post) => (
              <article key={post.slug} className="mk-card mk-card-hover flex flex-col p-6 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{post.category}</p>
                <h2 className="mt-3 font-display text-[19px] font-semibold leading-snug tracking-tight text-foreground">
                  <Link to={`/blog/${post.slug}`} className="after:absolute after:inset-0">{post.heading}</Link>
                </h2>
                <p className="mt-2.5 flex-1 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>
                <p className="mt-5 flex items-center gap-3 text-xs text-faint-foreground">
                  <time dateTime={post.updated ?? post.published}>{formatDate(post.updated ?? post.published)}</time>
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" />{post.readMinutes} min read</span>
                </p>
              </article>
            ))}
          </div>
        )}

        <div className="mt-14 flex flex-col gap-5 border-t border-white/[0.07] pt-9 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="mk-h3 max-w-[26ch]">Ready to buy instead?</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/prices" className="mk-btn mk-btn-ghost group">See today's prices<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
            <Link to="/shop" className="mk-btn mk-btn-primary group">Buy data<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
