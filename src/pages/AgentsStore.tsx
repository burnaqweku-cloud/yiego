import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Globe, Megaphone, ShoppingBag, Users, UsersRound } from "lucide-react";
import { metaFor } from "@/lib/site";
import { faqPageLd } from "@/lib/structuredData";
import Seo from "@/components/seo/Seo";
import { headlineSavings, useAgentSavings } from "@/hooks/useAgentSavings";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";

/* Everything in a DataYego store, laid out like a spec sheet: numbered
   sections, each feature a collapsible row (title + one-line summary always
   visible, full detail on tap). Linked from the agents page and the pay screen. */

interface Item { t: string; s: string; d: string }
interface Section { id: string; icon: typeof Globe; title: string; pitch: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    id: "store", icon: Globe, title: "Your store", pitch: "A real website with your name on it. DataYego is not mentioned anywhere inside it.",
    items: [
      { t: "Your own address", s: "yourname.datayego.com, live the moment you pay", d: "Pick the name when you apply and change it any time from your dashboard. When you change it, the old link keeps working for 90 days, so nobody you already sent it to is lost." },
      { t: "Your own domain", s: "Connect one you own, or buy a .com from your dashboard", d: "Connect a domain you already have, or search and buy a .com straight from your dashboard and we set it up for you. Your store, your emails and your WhatsApp previews all carry it." },
      { t: "Three complete templates", s: "Classic, Market and Studio. Three designs, not three colours", d: "Each template is a different design with its own home page, bundle pages, menu, footer and checkout. Switch in one tap, switch back in one tap, nothing is lost." },
      { t: "Your logo, your colour, your words", s: "Logo, accent colour, about, hours, notice bar, socials, FAQ", d: "Upload a logo, pick an accent colour, write your about text, set opening hours, add a notice bar to the top of every page, link your socials and write your own FAQ. Even the payment screen takes your look." },
      { t: "A proper home page", s: "Headline, Buy data button, networks, your picks, how it works, FAQ", d: "Choose which bundles sit at the top as your featured picks. Everything else on the home page is built for you from your settings and your prices." },
      { t: "Previews that look like you", s: "WhatsApp and Facebook previews show your name and logo", d: "Share your link anywhere and the preview card carries your store name and your logo. Not ours." },
    ],
  },
  {
    id: "sell", icon: ShoppingBag, title: "Selling", pitch: "Agent prices on every bundle. You set your price, the customer pays, you keep the difference.",
    items: [
      { t: "Agent prices on everything", s: "Every bundle, every network, below the public price", d: "MTN, Telecel and AirtelTigo, every size, priced below the public price for you. The live figures are at the top of this page and they follow the catalogue, so what you see is what you get." },
      { t: "One price list, yours", s: "Set every price yourself from the Prices page", d: "Round it, push it, undercut the shop next door. Customers only ever see your number. Change a price and your store, your checkout and your status images follow instantly." },
      { t: "No deposit, ever", s: "Customers pay first. Your profit is saved and paid to MoMo from GH₵20", d: "Your customer pays with MoMo or card on your store. Your profit on that sale is saved for you straight away and you withdraw to your MoMo whenever you like from GH₵20. If a bundle fails, the customer is refunded and your profit on it is reversed. Nothing ever comes out of your pocket." },
      { t: "Buy from your wallet", s: "Top up once, buy at agent price with no checkout fee", d: "A wallet for buying data for yourself or walk-in customers from your dashboard, at the agent price, with no checkout fee. It is separate from your earnings, so your profit stays untouched." },
      { t: "Every order in one list", s: "Search, filter, group by day, export, WhatsApp the customer", d: "Order ID, paid time, bundle, number, amount, your profit and the live delivery stage. Search by number or ID, filter by stage or network, group by day, export to CSV. One tap opens WhatsApp with the customer about their order." },
      { t: "Check MTN numbers first", s: "See if a number is cleared before you sell to it", d: "MTN verifies a number the first time it receives a bundle. Check any number from your dashboard or your store before you sell to it, and submit new numbers for verification in bulk." },
    ],
  },
  {
    id: "customers", icon: Users, title: "Customers", pitch: "Accounts, wallets, order history and support, built in. Most of it answers for you.",
    items: [
      { t: "Customer accounts on your store", s: "They sign up with you, see their orders, track the live ones", d: "Your customers create an account on your store, see every order they have placed with you and track the ones in progress. Signed up on your store means your customer, not ours." },
      { t: "A wallet for repeat buyers", s: "Top up once, pay in seconds next time", d: "Customers top up a wallet on your store and pay from it next time, so the second purchase takes seconds. Faster checkout, more repeat sales." },
      { t: "WhatsApp button and live chat", s: "On every page. Replies from your Support inbox", d: "A WhatsApp button and a live chat sit on every page of your store. Messages land in your Support inbox and you reply from any device. Turn either one on or off." },
      { t: "Chat assistant that answers for you", s: "Knows your prices and your store. Replies to customers day and night", d: "Your chat assistant knows your prices, your bundles and your store details and replies to customers at any hour. When a question needs you, it hands the chat over with the full history." },
      { t: "Sale alerts", s: "An email the moment someone buys", d: "You know about every sale and every order that needs a look, without refreshing anything." },
    ],
  },
  {
    id: "marketing", icon: Megaphone, title: "Marketing", pitch: "Built for selling on WhatsApp: it makes the status, runs the promo, posts the news and tells you what sold.",
    items: [
      { t: "Status maker", s: "Your WhatsApp status image, drawn for you with today's prices", d: "Your store draws the image in your template's look, with your logo, your link and today's prices pulled live from your store. One bundle, two bundles side by side, three bundles with a Most popular tag, a promo with the old price crossed out, or your whole price list for a network. Preview it in your dashboard, share it straight to WhatsApp or download it. The caption is written for you." },
      { t: "Promos with an end date", s: "Old price crossed out, countdown, back to normal by itself", d: "Put any bundle on promo. Your store shows the old price crossed out, the promo price and how long it lasts. When it ends, the normal price comes back on its own." },
      { t: "Announcements", s: "Post news on your store and email it to your customers", d: "New prices, a new network, a holiday notice, whatever you want them to know. Posted on your store and emailed to every customer with an account." },
      { t: "Pop-ups on any page", s: "A message with a button, a link or a form. See who saw it and who tapped", d: "A pop-up with a title, a message, an image and a button that opens a link, collects a form or sends a message. Show it once per visit, choose which pages, and see how many people saw it and how many tapped." },
      { t: "Analytics", s: "Visits per day, orders, sales, best sellers", d: "See what sells, when people buy, and which bundle to push next." },
      { t: "Invite and earn", s: "Free data when the people you invite buy", d: "Share your invite link and earn free data when the people you invite buy. On top of your profit." },
    ],
  },
  {
    id: "team", icon: UsersRound, title: "Team and growth", pitch: "Add people when it gets busy. Build your own network of agents when it gets big.",
    items: [
      { t: "Staff accounts", s: "Their own login. Customers and orders, not your money", d: "Give a sibling or a shop assistant their own login. They can reply to customers, watch orders and check numbers. They cannot touch your prices, your earnings or your payouts." },
      { t: "Your own agents", s: "By invitation. Your fee, your form, your coupons, your cut", d: "Recruit agents under your store with your own monthly fee, your own application form and coupons on that fee. They sell from their own stores and you earn on every sale they make." },
      { t: "Store assistant", s: "An assistant in your dashboard that knows your store, your orders and your money", d: "Ask it anything: where a setting is, why an order is still processing, what you make on MTN 10GB, how to withdraw. It sees your own store, orders, earnings and prices, answers in plain English with the exact page and button, and never changes anything. One tap from every dashboard page." },
      { t: "Help Center", s: "How everything works, in your dashboard and on a public page", d: "How earnings, payouts, orders, prices and plans work, written out and searchable in your dashboard, plus the same answers on a public page you can send to anyone." },
      { t: "Something new almost every week", s: "Every new tool is yours, at no extra cost", d: "The Status maker, the two and three bundle layouts, customer wallets, the assistant, the order list and header names were all added in the last few weeks. Your store keeps getting better and you pay nothing extra for any of it." },
    ],
  },
];

/** The questions people ask before applying; also published as FAQ rich-result markup. */
const FAQ = [
  {
    q: "Do I need a deposit to become an agent?",
    a: "No. Your customers pay first, with Mobile Money or card on your store. Your profit on each sale is saved for you and you withdraw it to Mobile Money from GH₵20 (1% payout fee, minimum GH₵1). If a bundle fails, the customer is refunded and nothing comes out of your pocket.",
  },
  {
    q: "How much does an agent earn per bundle?",
    a: "You set your own prices, so you decide. The agent price for MTN 10GB is GH₵41.00 against a public price of GH₵43.00, so selling at the public price keeps GH₵2.00; sell higher and keep more. The live agent prices are on this page.",
  },
  {
    q: "What does the agent plan cost?",
    a: "GH₵30 a month, due only after you are approved. Longer plans cost less per month and can be paid from your dashboard. The usual 4% checkout fee applies to each sale and is paid by the customer at checkout.",
  },
  {
    q: "Will my customers know the store runs on DataYego?",
    a: "Your store carries your name, your logo, your prices and your link, and the WhatsApp preview shows your store, not ours. DataYego is not mentioned inside it.",
  },
  {
    q: "What happens if I miss a month?",
    a: "Your store pauses until the plan is paid. Your earnings, your customers and your settings stay exactly as they were.",
  },
  {
    q: "Can I use my own domain name?",
    a: "Yes. Connect a domain you already own, or buy a .com straight from your dashboard; we set it up for you.",
  },
];


function FeatureRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-white/[0.07]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">{item.t}</span>
          <span className="mt-0.5 block text-[12.5px] leading-5 text-muted-foreground">{item.s}</span>
        </span>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-faint-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="-mt-1 pb-4 pr-7 text-[13.5px] leading-6 text-muted-foreground">{item.d}</p>}
    </li>
  );
}

export default function AgentsStore() {
  const savings = headlineSavings(useAgentSavings(), 4);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  useEffect(() => { void planQuote().then(setQuote); }, []);
  const fee = quote ? (quote.promo ? quote.pay_now : quote.monthly) : null;
  const feeText = fee !== null ? formatGHS(fee) : "one small fee";
  const total = SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="mk-wrap py-8 sm:py-14">
      <Seo {...metaFor("/agents/store")} jsonLd={faqPageLd(FAQ)} />
      <div className="mx-auto max-w-2xl">
        {/* Hero */}
        <span className="mk-eyebrow">Agents</span>
        <h1 className="mk-h2 mt-3">Everything in your store.</h1>
        <p className="mk-lead mt-5">{total} features, {SECTIONS.length} sections, {fee !== null ? `${feeText} a month` : "one small monthly fee"}. A real website with your name on it, agent prices on every bundle, customers who pay first so you never need a deposit, and the tools to sell on WhatsApp every day. Tap any row for the detail.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link to="/agents" className="mk-btn mk-btn-primary">Apply now</Link>
          <span className="text-[12.5px] text-muted-foreground">{feeText} a month{quote?.promo ? ` (${quote.promo.percent_off}% off)` : ""} · no deposit</span>
        </div>

        {/* Contents */}
        <nav aria-label="Sections" className="mt-8 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {SECTIONS.map((s, i) => <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 text-[13px] text-foreground hover:text-primary-glow"><span className="w-5 text-[11px] font-semibold text-faint-foreground">{String(i + 1).padStart(2, "0")}</span>{s.title}<span className="text-[11px] text-faint-foreground">{s.items.length}</span></a>)}
        </nav>

        {/* Live prices */}
        {savings.length > 0 && (
          <div className="mt-8 border-y border-white/[0.08] py-3">
            <div className="flex items-baseline justify-between"><p className="text-[14px] font-semibold text-foreground">Agent prices right now</p><span className="text-[12px] font-semibold text-primary-glow">Live</span></div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {savings.map((s) => <p key={`${s.network}${s.gb}`} className="text-[13px] text-foreground"><span className="font-semibold">{s.network} {s.gb}GB</span> {formatGHS(s.agent)} <span className="text-faint-foreground line-through">{formatGHS(s.pub)}</span> <span className="text-primary-glow">+{formatGHS(s.pub - s.agent)}</span></p>)}
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint-foreground">The green figure is what you keep per sale at the public price. Sell higher and keep more.</p>
          </div>
        )}

        {/* Sections */}
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><s.icon size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--gold)]">{s.items.length} features</p>
                <h2 className="mk-h3 mt-0.5 !text-[24px] sm:!text-[28px]">{s.title}</h2>
                <p className="mt-1.5 text-[13.5px] leading-6 text-muted-foreground">{s.pitch}</p>
              </div>
            </div>
            <ul className="mt-4 border-b border-white/[0.07]">{s.items.map((it) => <FeatureRow key={it.t} item={it} />)}</ul>
          </section>
        ))}

        {/* The deal */}
        <section className="agents-panel mt-12 p-6 sm:p-8">
          <span className="mk-eyebrow">The deal</span>
          <h2 className="mk-h3 mt-2 !text-[26px] sm:!text-[30px]">All {total} features for {feeText} a month.</h2>
          <p className="mt-3 text-[13.5px] leading-6 text-muted-foreground">One fee, everything on this page, and everything we add after it. Plus the usual 4% checkout fee on each sale, which your customer pays at checkout. The fee is only due once you are approved. If a month is not paid your store pauses until you pay; your money, your earnings and your customers stay exactly where they are.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/agents" className="mk-btn mk-btn-primary">Apply to be an agent</Link>
            <Link to="/help/agents" className="text-[12.5px] text-muted-foreground hover:text-foreground">How earnings and payouts work</Link>
          </div>
          {quote && quote.plans.length > 1 && (
            <ul className="mt-6 grid gap-2 sm:grid-cols-3">
              {quote.plans.map((p) => (
                <li key={p.months} className="rounded-2xl border border-[hsl(var(--border))] px-4 py-3">
                  <p className="font-display text-[16px] font-bold text-foreground">{p.months} month{p.months > 1 ? "s" : ""} · {formatGHS(p.pay_now)}</p>
                  <p className="text-[12.5px] text-muted-foreground">GH₵{p.per_month.toFixed(2)} a month{p.saving_pct > 0 ? `, ${p.saving_pct}% less` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Questions, written out in full. */}
        <section className="mt-12" aria-labelledby="agents-faq">
          <h2 id="agents-faq" className="mk-h3 !text-[24px] sm:!text-[28px]">Before you apply</h2>
          <dl className="mt-6 grid gap-7">
            {FAQ.map((f) => (
              <div key={f.q} className="fact">
                <dt className="text-[16px] font-semibold text-foreground">{f.q}</dt>
                <dd className="mk-body mt-1.5">{f.a}</dd>
              </div>
            ))}
          </dl>
          <Link to="/agents" className="mk-btn mk-btn-primary mt-8 inline-flex">Apply now</Link>
        </section>
      </div>
    </div>
  );
}
