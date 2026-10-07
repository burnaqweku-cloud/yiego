import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { headlineSavings, useAgentSavings } from "@/hooks/useAgentSavings";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";

/* Everything in a DataYego store, written to sell it. Dense on purpose: no
   boxes, one tight row per feature with real detail, so a reader who scrolls
   once has actually read something. Linked from the agents page (hero and
   store card) and the pay screen approved agents see. */

interface Item { t: string; d: string }
interface Section { id: string; kicker: string; title: string; pitch: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    id: "store", kicker: "Your store", title: "A real website with your name on it.", pitch: "Not a link to our site and not a price list on WhatsApp. Your customers open your address and land on a full store: your name, your logo, your colours, your prices. DataYego is not mentioned anywhere inside it. People who buy from you think it is yours, because it is.",
    items: [
      { t: "Your own address from day one.", d: "yourname.datayego.com, live the moment you pay. Change the name any time from your dashboard; the old link keeps working for 90 days so nobody you already sent it to is lost." },
      { t: "Want mystore.com? Have it.", d: "Connect a domain you already own, or buy a .com straight from your dashboard and we set it up for you. Your store, your emails and your WhatsApp previews all carry it." },
      { t: "Three complete templates.", d: "Classic, Market and Studio. Not three colour schemes: three different designs, each with its own home page, bundle pages, menu, footer and checkout. Switch in one tap, switch back in one tap." },
      { t: "Your logo, your colour, your words.", d: "Upload a logo, pick an accent colour, write your about text, set opening hours, add a notice bar for the top of every page, link your socials, write your own FAQ. Even the payment screen takes your look." },
      { t: "A proper home page.", d: "A headline, a Buy data button, your networks, your featured bundles, how it works, about and FAQ. Pick which bundles sit at the top as your picks." },
      { t: "Previews that look like you.", d: "Share your link anywhere and the WhatsApp or Facebook preview shows your store name and your logo. Not ours." },
    ],
  },
  {
    id: "sell", kicker: "Selling", title: "You set the prices. You keep the profit.", pitch: "Every bundle on MTN, Telecel and AirtelTigo has an agent price below the public price. You sell at whatever you like. The customer pays through your store, the data is delivered, and the difference is yours. No float to top up. No deposit. No chasing anyone for money.",
    items: [
      { t: "Agent prices on everything.", d: "Every bundle, every network, priced below the public price for you. The live numbers are at the top of this page and they follow the catalogue, so what you see is what you get." },
      { t: "One price list, yours.", d: "Set every price yourself from the Prices page. Round it, push it, undercut the shop next door. Customers only ever see your number." },
      { t: "No deposit, ever.", d: "Your customer pays with MoMo or card on your store. Your profit on that sale is saved for you straight away, and you withdraw to your MoMo whenever you like from GH₵20. If a bundle fails, the customer is refunded and your profit on it is reversed. Nothing comes out of your pocket." },
      { t: "Buy from your wallet too.", d: "Top up a wallet once and buy data for yourself or for walk-in customers from your dashboard at the agent price, with no checkout fee. Separate from your earnings, so your profit stays untouched." },
      { t: "Every order in one list.", d: "Order ID, paid time, bundle, number, amount, your profit and the live delivery stage. Search by number or ID, filter by stage or network, group by day, export to CSV. One tap to WhatsApp the customer about their order." },
      { t: "Check MTN numbers first.", d: "MTN verifies a number the first time it receives a bundle. Check any number from your dashboard or your store before you sell to it, and submit new numbers for verification in bulk." },
    ],
  },
  {
    id: "customers", kicker: "Customers", title: "They come back because it is easy.", pitch: "A store people return to needs accounts, a wallet, order history and someone to answer when they ask. Yours has all of it built in, and most of it answers for you.",
    items: [
      { t: "Customer accounts on your store.", d: "Your customers sign up on your store, see every order they have placed with you, and track the ones in progress. Signed up on your store means your customer, not ours." },
      { t: "A wallet for repeat buyers.", d: "Customers top up once and pay from their wallet next time, so the second purchase takes seconds. Faster checkout, more repeat sales." },
      { t: "WhatsApp button and live chat.", d: "A WhatsApp button and a live chat sit on every page of your store. Messages land in your Support inbox and you reply from any device. Turn either one on or off." },
      { t: "An assistant that answers for you.", d: "Your store assistant knows your prices, your bundles and your store details and replies to customers day and night. When a question needs you, it hands the chat over with the full history." },
      { t: "Sale alerts.", d: "An email the moment someone buys, so you know about every sale and every order that needs a look." },
    ],
  },
  {
    id: "marketing", kicker: "Marketing", title: "Tools that bring the next sale.", pitch: "Most data in Ghana is sold on WhatsApp. Your store is built for that: it makes the status, it runs the promo, it posts the news and it tells you what sold.",
    items: [
      { t: "Status maker.", d: "Your store draws your WhatsApp status image for you, in your template's look, with your logo, your link and today's prices pulled live from your store. One bundle, two bundles side by side, three bundles with a Most popular tag, a promo with the old price crossed out, or your whole price list for a network. Preview it in your dashboard, share it straight to WhatsApp or download it, and the caption is written for you." },
      { t: "Promos with an end date.", d: "Put any bundle on promo. Your store shows the old price crossed out, the promo price and how long it lasts. When it ends, the normal price comes back by itself." },
      { t: "Announcements.", d: "Post news on your store and email it to every customer who has an account with you. New prices, a new network, a holiday notice, whatever you want them to know." },
      { t: "Pop-ups on any page.", d: "A pop-up with a title, a message and a button, a link or a form. Show it once per visit, choose which pages, see how many people saw it and how many tapped." },
      { t: "Analytics.", d: "Visits per day, orders, sales and your best sellers. See what sells, when people buy, and which bundle to push next." },
      { t: "Invite and earn.", d: "Share your invite link with customers and earn free data when they buy. On top of your profit." },
    ],
  },
  {
    id: "team", kicker: "Team and growth", title: "Grow past one phone.", pitch: "When it gets busy, add people. When it gets big, build your own network of agents under your store.",
    items: [
      { t: "Staff accounts.", d: "Give a sibling or a shop assistant their own login. They can reply to customers, watch orders and check numbers. They cannot touch your prices, your earnings or your payouts." },
      { t: "Your own agents.", d: "By invitation. Recruit agents under your store with your own monthly fee, your own application form and coupons on that fee. They sell from their own stores, you earn on every sale they make." },
      { t: "Help Center in your dashboard.", d: "How earnings, payouts, orders, prices and plans work, written out and searchable, plus the same answers on a public page you can send to anyone." },
      { t: "Something new almost every week.", d: "The Status maker, the two and three bundle layouts, customer wallets, the assistant, the order list, header names, all added in the last weeks. Your store keeps getting better and you pay nothing extra for any of it." },
    ],
  },
];

export default function AgentsStore() {
  const savings = headlineSavings(useAgentSavings(), 4);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  useEffect(() => { void planQuote().then(setQuote); }, []);
  const fee = quote ? (quote.promo ? quote.pay_now : quote.monthly) : null;
  const feeText = fee !== null ? formatGHS(fee) : "one small fee";

  return (
    <div className="mk-wrap py-8 sm:py-14">
      <Seo path="/agents/store" title="Everything in your DataYego store" description="Your own data store: templates, your prices, customer accounts, chat, promos, a status maker and more. No deposit." />
      <div className="mx-auto max-w-2xl">
        {/* Hero */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Agents</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-[44px]">Everything you get the day you open your store.</h1>
        <p className="mt-4 text-[15px] leading-7 text-muted-foreground">For {feeText} a month you get a complete online data business: a real website with your name on it, agent prices on every bundle, customers who pay first so you never need a deposit, and the marketing tools to sell on WhatsApp every day. This page is the whole list. Read it once and decide.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link to="/agents" className="onyx-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-[13.5px]">Apply now<ArrowRight size={15} /></Link>
          <span className="text-[12.5px] text-muted-foreground">{feeText} a month{quote?.promo ? ` (${quote.promo.percent_off}% off)` : ""} · no deposit · cancel any time</span>
        </div>

        {/* Live prices: one tight strip */}
        {savings.length > 0 && (
          <div className="mt-8 border-y border-white/[0.08] py-3">
            <div className="flex items-baseline justify-between"><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Agent prices right now</p><span className="text-[10.5px] font-semibold uppercase tracking-wide text-primary-glow">Live</span></div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {savings.map((s) => <p key={`${s.network}${s.gb}`} className="text-[13px] text-foreground"><span className="font-semibold">{s.network} {s.gb}GB</span> {formatGHS(s.agent)} <span className="text-faint-foreground line-through">{formatGHS(s.pub)}</span> <span className="text-primary-glow">+{formatGHS(s.pub - s.agent)}</span></p>)}
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint-foreground">The green figure is what you keep per sale at the public price. Sell higher and keep more.</p>
          </div>
        )}

        {/* Sections: headline, pitch, tight rows */}
        {SECTIONS.map((s) => (
          <section key={s.id} className="mt-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{s.kicker}</p>
            <h2 className="mt-1.5 font-display text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]">{s.title}</h2>
            <p className="mt-3 text-[14px] leading-[1.65] text-muted-foreground">{s.pitch}</p>
            <ul className="mt-4 divide-y divide-white/[0.07] border-t border-white/[0.07]">
              {s.items.map((it) => (
                <li key={it.t} className="flex gap-3 py-3">
                  <Check size={16} className="mt-[3px] shrink-0 text-primary-glow" />
                  <p className="text-[13.5px] leading-6 text-muted-foreground"><span className="font-semibold text-foreground">{it.t}</span> {it.d}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* The deal */}
        <section className="mt-12 border-t border-white/[0.08] pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">The deal</p>
          <h2 className="mt-1.5 font-display text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]">All of it for {feeText} a month.</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-muted-foreground">One fee, every feature on this page, and everything we add after it. Plus the usual 4% checkout fee on each sale, which your customer pays at checkout. The fee is only due once you are approved. If a month is not paid your store pauses until you pay; your money, your earnings and your customers stay exactly where they are.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/agents" className="onyx-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-[13.5px]">Apply to be an agent<ArrowRight size={15} /></Link>
            <Link to="/help/agents" className="text-[12.5px] text-muted-foreground hover:text-foreground">How earnings and payouts work</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
