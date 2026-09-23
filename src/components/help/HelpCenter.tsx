import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ChevronRight, MessageCircle, Search, ThumbsDown, ThumbsUp, Wallet, Package, Store, CalendarCheck, ShoppingBag, LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useContactSettings } from "@/hooks/useContactSettings";

/* The Help Center. Articles live in phase1.help_articles so wording can be
   fixed from the admin without a publish. Search matches title, summary,
   body and hidden keywords as you type. `?a=slug` opens one article. */
export interface HelpArticle { slug: string; category: string; title: string; summary: string | null; body: string; keywords: string[]; sort_order: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

const CATEGORY_ICON: Record<string, typeof Wallet> = { Money: Wallet, Orders: Package, "Your store": Store, "Your plan": CalendarCheck, "Buying for yourself": ShoppingBag };
const CATEGORY_ORDER = ["Money", "Orders", "Your store", "Your plan", "Buying for yourself"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
function score(a: HelpArticle, q: string) {
  const words = norm(q).split(/\s+/).filter(Boolean); if (!words.length) return 0;
  const title = norm(a.title), summary = norm(a.summary ?? ""), body = norm(a.body), keys = a.keywords.map(norm);
  let s = 0;
  for (const w of words) {
    if (title.includes(w)) s += 6;
    if (keys.some((k) => k.includes(w))) s += 5;
    if (summary.includes(w)) s += 3;
    if (body.includes(w)) s += 1;
  }
  const phrase = norm(q).trim();
  if (phrase && (title.includes(phrase) || keys.some((k) => k === phrase))) s += 8;
  return s;
}
const catRank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };

export default function HelpCenter({ audience = "agents", title = "Help Center", subtitle = "Short answers to the questions agents ask most." }: { audience?: "agents" | "customers"; title?: string; subtitle?: string }) {
  const [articles, setArticles] = useState<HelpArticle[] | null>(null);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const slug = params.get("a");
  const { whatsappUrl, contact } = useContactSettings();
  useEffect(() => { void p1().from("help_articles").select("slug, category, title, summary, body, keywords, sort_order").eq("audience", audience).eq("is_published", true).order("sort_order").then((r: { data: HelpArticle[] | null }) => setArticles(r.data ?? [])); }, [audience]);
  const open = (s: string | null) => { const next = new URLSearchParams(params); if (s) next.set("a", s); else next.delete("a"); setParams(next); window.scrollTo({ top: 0 }); };
  const results = useMemo(() => { if (!articles || !q.trim()) return []; return articles.map((a) => ({ a, s: score(a, q) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.a); }, [articles, q]);
  const grouped = useMemo(() => { const m = new Map<string, HelpArticle[]>(); for (const a of articles ?? []) m.set(a.category, [...(m.get(a.category) ?? []), a]); return [...m.entries()].sort((x, y) => catRank(x[0]) - catRank(y[0])); }, [articles]);
  const current = slug ? articles?.find((a) => a.slug === slug) ?? null : null;
  const contactEmail = contact?.support_email ?? null;

  const footer = (
    <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[13.5px] font-semibold text-foreground">Still stuck?</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Send us the Order ID if it's about an order. We reply fast.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-[12.5px] font-semibold text-[#062b16]"><MessageCircle size={14} />WhatsApp us</a>}
        {contactEmail && <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.14] px-4 py-2 text-[12.5px] text-foreground">Email {contactEmail}</a>}
      </div>
    </div>
  );

  if (articles === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>;
  if (current) return <Article a={current} onBack={() => open(null)} related={articles.filter((x) => x.category === current.category && x.slug !== current.slug).slice(0, 3)} onOpen={open} footer={footer} />;

  return (
    <div>
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary-glow"><LifeBuoy size={20} /></span><div><h1 className="font-display text-[22px] font-semibold text-foreground">{title}</h1><p className="text-[12.5px] text-muted-foreground">{subtitle}</p></div></div>
      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — pending, MTN verification, withdraw…" className="onyx-field w-full pl-10 text-[14px]" />
      </div>
      {q.trim() ? (
        <div className="mt-4">
          {results.length === 0
            ? <div className="rounded-2xl border border-white/[0.08] p-5 text-center"><p className="text-[13.5px] font-semibold text-foreground">Nothing matches "{q}"</p><p className="mt-1 text-[12.5px] text-muted-foreground">Try a different word, or ask us directly below.</p></div>
            : <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">{results.map((a) => <Row key={a.slug} a={a} onOpen={open} showCategory />)}</ul>}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map(([cat, list]) => { const Icon = CATEGORY_ICON[cat] ?? LifeBuoy; return (
            <section key={cat}>
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow"><Icon size={13} />{cat}</h2>
              <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">{list.map((a) => <Row key={a.slug} a={a} onOpen={open} />)}</ul>
            </section>
          ); })}
        </div>
      )}
      {footer}
    </div>
  );
}

function Row({ a, onOpen, showCategory }: { a: HelpArticle; onOpen: (s: string) => void; showCategory?: boolean }) {
  return (
    <li><button type="button" onClick={() => onOpen(a.slug)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
      <span className="min-w-0 flex-1">{showCategory && <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{a.category}</span>}<span className="block text-[14px] font-medium text-foreground">{a.title}</span>{a.summary && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted-foreground">{a.summary}</span>}</span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </button></li>
  );
}

function Article({ a, onBack, related, onOpen, footer }: { a: HelpArticle; onBack: () => void; related: HelpArticle[]; onOpen: (s: string) => void; footer: ReactNode }) {
  const [voted, setVoted] = useState<boolean | null>(null);
  const vote = (helpful: boolean) => { if (voted !== null) return; setVoted(helpful); void p1().rpc("help_article_feedback", { p_slug: a.slug, p_helpful: helpful }); };
  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><ArrowLeft size={14} />All articles</button>
      <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{a.category}</p>
      <h1 className="mt-1 font-display text-[22px] font-semibold leading-tight text-foreground">{a.title}</h1>
      <div className="help-prose mt-4 text-[14px] leading-[1.65] text-foreground/90"><ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body}</ReactMarkdown></div>
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3 text-[12.5px] text-muted-foreground">
        {voted === null ? <><span>Was this helpful?</span><button type="button" onClick={() => vote(true)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/[0.14] px-3 py-1.5 text-foreground"><ThumbsUp size={13} />Yes</button><button type="button" onClick={() => vote(false)} className="inline-flex items-center gap-1 rounded-full border border-white/[0.14] px-3 py-1.5 text-foreground"><ThumbsDown size={13} />No</button></> : <span>{voted ? "Thanks — glad it helped." : "Thanks. We'll improve this one."}</span>}
      </div>
      {related.length > 0 && <div className="mt-6"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">More in {a.category}</p><ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">{related.map((r) => <Row key={r.slug} a={r} onOpen={onOpen} />)}</ul></div>}
      {footer}
    </div>
  );
}
