import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bell, BotMessageSquare, Check, Globe, Image as ImageIcon, LayoutTemplate, Megaphone, MessageCircle, Network, Palette, PhoneForwarded, Receipt, ShieldCheck, ShoppingBag, Sparkles, Store, Tag, Users, Wallet, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { headlineSavings, useAgentSavings } from "@/hooks/useAgentSavings";
import { planQuote, type PlanQuote } from "@/lib/agents";
import { formatGHS } from "@/lib/format";

/* Everything in a DataYego store, laid out to sell it. Linked from the agents
   page (hero + "Free online store" card) and from the pay screen approved
   agents see, so the fee is never a question of "what do I get?". */

interface Feature { icon: typeof Store; title: string; body: string; tag?: string }
interface Group { id: string; kicker: string; title: string; lead: string; features: Feature[] }

const GROUPS: Group[] = [
  { id: "store", kicker: "Your store", title: "A real website, not a WhatsApp list", lead: "Your customers open a link and see a proper store with your name on it. Nobody sees DataYego inside it. It is yours.", features: [
    { icon: Globe, title: "Your own address", body: "yourname.datayego.com from day one. Want a real domain like mystore.com? Connect one you own or buy one from your dashboard. Your emails can come from it too." },
    { icon: LayoutTemplate, title: "3 full templates", body: "Classic, Market and Studio. Each one is a completely different design with its own home page, bundle pages and checkout. Switch any time." },
    { icon: Palette, title: "Make it yours", body: "Your logo, your colour, your banner, your about text, opening hours, a notice bar, your socials and your own FAQ. Even the payment screen matches your look." },
    { icon: Tag, title: "You set every price", body: "Every bundle on every network has a price you choose. Raise it, lower it, run a promo. Customers only ever see your price." },
    { icon: ShieldCheck, title: "WhatsApp preview with your name", body: "Share your link anywhere and the preview shows your store name and logo. Not ours." },
  ] },
  { id: "sell", kicker: "Selling", title: "Customers pay, you keep the profit", lead: "Buy at agent prices and sell at yours. No float, no deposit, no chasing people for money.", features: [
    { icon: Zap, title: "Agent prices on everything", body: "MTN, Telecel and AirtelTigo at prices below the public price, for yourself or to sell. The exact numbers are on this page, live.", tag: "Live" },
    { icon: Wallet, title: "No deposit, ever", body: "Your customer pays through your store with MoMo or card. Your profit is saved for you on every sale and paid to your MoMo from GH₵20." },
    { icon: ShoppingBag, title: "Buy data from your wallet", body: "Top up once and buy for yourself or walk-in customers from your dashboard, with no checkout fee." },
    { icon: Receipt, title: "Every order tracked", body: "Order ID, paid time, delivery stage and the customer's number, all in one list. Search it, filter it, export it to CSV. One tap to WhatsApp the customer." },
    { icon: PhoneForwarded, title: "Check MTN numbers", body: "See if a number is cleared for data before you sell to it, from your dashboard or your store." },
  ] },
  { id: "customers", kicker: "Customers", title: "They come back because it is easy", lead: "Accounts, wallets, order history, support. Everything a serious shop has.", features: [
    { icon: Users, title: "Customer accounts", body: "Your customers sign up on your store, see their orders and keep a wallet so paying next time takes seconds." },
    { icon: MessageCircle, title: "WhatsApp and live chat", body: "A WhatsApp button and a live chat on every page. Reply from your Support inbox on any device." },
    { icon: BotMessageSquare, title: "A store assistant that answers for you", body: "It knows your prices and your store and replies to customers day and night, then hands over to you when it matters." },
    { icon: Bell, title: "Sale alerts", body: "An email the moment someone buys, so you never miss a sale or a stuck order." },
  ] },
  { id: "marketing", kicker: "Marketing", title: "Tools that bring the next sale", lead: "Built-in, free, and made for how people actually buy data in Ghana: on WhatsApp.", features: [
    { icon: ImageIcon, title: "Status maker", body: "Your store draws your WhatsApp status for you, in your store's look, with your logo, your link and today's prices. One bundle, two, three, a promo or your whole price list. Preview it, share it, done.", tag: "New" },
    { icon: Tag, title: "Promos", body: "Put any bundle on promo with an end date. Your store shows the old price crossed out and the countdown." },
    { icon: Megaphone, title: "Announcements and pop-ups", body: "Post news on your store, email it to your customers, and put a pop-up on any page with a button, a form or a link." },
    { icon: BarChart3, title: "Analytics", body: "Visits per day, orders, sales and your best sellers. Know what sells and when." },
  ] },
  { id: "team", kicker: "Team and growth", title: "Grow past one phone", lead: "When it gets busy, add people. When it gets big, build your own network.", features: [
    { icon: Users, title: "Staff accounts", body: "Give a sibling or a shop assistant their own login to reply to customers and watch orders, without touching your money." },
    { icon: Network, title: "Your own agents", body: "Recruit agents under your store with your own fee, your own application form and coupons. Your network, your rules.", tag: "By invitation" },
    { icon: Sparkles, title: "Help Center and updates", body: "A help centre inside your dashboard, announcements from us, and new features added almost every week. Your store keeps getting better without you lifting a finger." },
  ] },
];

export default function AgentsStore() {
  const savings = headlineSavings(useAgentSavings(), 4);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  useEffect(() => { void planQuote().then(setQuote); }, []);
  const fee = quote ? (quote.promo ? quote.pay_now : quote.monthly) : null;

  return (
    <div className="mk-wrap py-8 sm:py-14">
      <Seo path="/agents/store" title="Everything in your DataYego store" description="Your own data store with templates, your prices, customer accounts, chat, promos, a status maker and more. No deposit." />
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><Store size={12} />Your store</span>
          <h1 className="mt-3 font-display text-[30px] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-[42px]">Everything you get<br />the day you open your store.</h1>
          <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-6 text-muted-foreground">Not a link to our site. A full online data business with your name on it, built for WhatsApp selling, and it keeps getting new tools every week.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link to="/agents" className="onyx-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-[13.5px]">Apply now<ArrowRight size={15} /></Link>
            {fee !== null && <span className="text-[12.5px] text-muted-foreground">{formatGHS(fee)} a month{quote?.promo ? ` (${quote.promo.percent_off}% off)` : ""} · no deposit</span>}
          </div>
        </div>

        {/* Live savings */}
        {savings.length > 0 && (
          <div className="onyx-panel mt-8 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-foreground">Agent prices right now</p><span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary-glow">Live</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {savings.map((s) => (
                <div key={`${s.network}${s.gb}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[12px] text-muted-foreground">{s.network} {s.gb}GB</p>
                  <p className="mt-0.5 text-[18px] font-semibold leading-none text-foreground">{formatGHS(s.agent)}</p>
                  <p className="mt-1 text-[11.5px] text-faint-foreground">public <span className="line-through">{formatGHS(s.pub)}</span> · you keep <span className="text-primary-glow">{formatGHS(s.pub - s.agent)}</span></p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] text-faint-foreground">That is the saving at the public price. Set your own price and the profit is yours.</p>
          </div>
        )}

        {/* Groups */}
        {GROUPS.map((g) => (
          <section key={g.id} className="mt-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">{g.kicker}</p>
            <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight text-foreground sm:text-[26px]">{g.title}</h2>
            <p className="mt-1.5 max-w-xl text-[13.5px] leading-6 text-muted-foreground">{g.lead}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {g.features.map(({ icon: Icon, title, body, tag }) => (
                <div key={title} className="onyx-panel rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><Icon size={17} /></span>
                    {tag && <span className="rounded-full border border-primary/30 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary-glow">{tag}</span>}
                  </div>
                  <p className="mt-3 text-[14.5px] font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* The deal */}
        <div className="onyx-panel mt-12 rounded-2xl p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">The deal</p>
          <h2 className="mt-1 font-display text-[22px] font-semibold text-foreground">All of this for {fee !== null ? formatGHS(fee) : "one small fee"} a month</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {["No deposit and no float. Your customers pay first.", "Agent prices on every bundle, every network.", "Your profit saved on every sale, paid to MoMo from GH₵20.", "Delivery, payment and support handled for you.", "Your store, your name, your customers. We stay invisible.", "New tools added almost every week, free."].map((t) => <li key={t} className="flex gap-2 text-[13px] text-muted-foreground"><Check size={15} className="mt-0.5 shrink-0 text-primary-glow" />{t}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/agents" className="onyx-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-[13.5px]">Apply to be an agent<ArrowRight size={15} /></Link>
            <Link to="/help/agents" className="text-[12.5px] text-muted-foreground hover:text-foreground">Read how earnings and payouts work</Link>
          </div>
          <p className="mt-3 text-[11.5px] text-faint-foreground">Plus the usual 4% checkout fee on each sale. The fee is only due after you are approved. If a month is not paid your store pauses until you pay; your money and earnings stay safe.</p>
        </div>
      </div>
    </div>
  );
}
