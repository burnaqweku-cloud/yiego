import { ArrowRight, CheckCircle2, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import { useFlows } from "@/store/flows";
import { useLiveBundles } from "@/hooks/useLiveBundles";
import { breadcrumbLd, bundleOffersLd, faqPageLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   Per-network SEO landing pages: /mtn-data-bundles,
   /telecel-data-bundles, /airteltigo-data-bundles. Each targets
   one network's buying searches with static crawlable copy, the
   LIVE price list from the catalogue, structured data, and a
   one-tap buy flow. The copy states only things that are true of
   DataYego today.
   ══════════════════════════════════════════════════════════════ */

interface NetworkPageConfig {
  path: string;
  h1: string;
  intro: string;
  bullets: string[];
  faqs: Array<{ q: string; a: string }>;
}

const PAGES: Record<NetworkId, NetworkPageConfig> = {
  mtn: {
    path: "/mtn-data-bundles",
    h1: "MTN data bundles, delivered in minutes",
    intro: "Buy MTN data online for any Ghana number — yours, family, friends or customers. Pick a bundle below, pay with Mobile Money or card, and the data lands on the line within minutes of payment clearing. The prices you see are the live prices you pay at checkout.",
    bullets: [
      "Works for any MTN number in Ghana — buy for yourself or someone else",
      "Pay with MTN MoMo, other Mobile Money, or card (secured by Paystack)",
      "No account needed — check out as a guest and track with your YG- reference",
      "Delivered automatically, usually within minutes of payment",
    ],
    faqs: [
      { q: "How do I buy MTN data online in Ghana?", a: "Choose an MTN bundle on this page, enter the recipient's MTN number, and pay with Mobile Money or card. The bundle is sent to that number automatically — most orders complete within minutes." },
      { q: "Can I buy MTN data for another number?", a: "Yes. Enter any MTN number as the recipient. The data goes to the number you enter, not to your own line — handy for family, friends or customers." },
      { q: "Do I need an account to buy MTN data?", a: "No. You can check out as a guest and pay by Mobile Money or card. You'll get a YG- reference to track your order. An account adds a wallet, saved details and order history." },
      { q: "How long does MTN data delivery take?", a: "Most orders are delivered within minutes of payment clearing. If the network is slow, your order stays visible with its live status on the Track Order page until it completes." },
      { q: "How do the bundle validities work?", a: "Each bundle shows its validity next to the price on this page — what you see listed is exactly what the network applies when the bundle lands." },
    ],
  },
  telecel: {
    path: "/telecel-data-bundles",
    h1: "Telecel data bundles (formerly Vodafone)",
    intro: "Buy Telecel Ghana data online — the network formerly known as Vodafone Ghana. Choose a bundle below, pay with Mobile Money or card, and it's delivered to any Telecel number in minutes. Prices come straight from our live catalogue, so what you see is what you pay.",
    bullets: [
      "Works for any Telecel (ex-Vodafone) number in Ghana",
      "Pay with Telecel Cash, MTN MoMo, other Mobile Money, or card",
      "Guest checkout — no account required, track with your YG- reference",
      "Delivered automatically, usually within minutes of payment",
    ],
    faqs: [
      { q: "Is Telecel the same as Vodafone Ghana?", a: "Yes — Vodafone Ghana was rebranded as Telecel Ghana. If your SIM was a Vodafone SIM, it's now a Telecel SIM, and the bundles on this page work for it." },
      { q: "How do I buy Telecel data online?", a: "Pick a bundle on this page, enter the recipient's Telecel number, and pay with Mobile Money or card. The bundle is delivered automatically, usually within minutes." },
      { q: "Can I buy Telecel data for someone else?", a: "Yes. Enter their Telecel number as the recipient and the data goes straight to their line." },
      { q: "Do I need an account?", a: "No — guest checkout works with Mobile Money or card, and you get a YG- reference to track the order. An account adds a wallet and order history." },
    ],
  },
  at: {
    path: "/airteltigo-data-bundles",
    h1: "AirtelTigo data bundles, built for value",
    intro: "Buy AirtelTigo (AT) data online for any Ghana number. AT bundles stretch further for students, teams and heavy browsers — pick one below, pay with Mobile Money or card, and it's delivered within minutes. Prices are live from our catalogue.",
    bullets: [
      "Works for any AirtelTigo (AT) number in Ghana",
      "Pay with AT Money, MTN MoMo, other Mobile Money, or card",
      "Guest checkout — no account required, track with your YG- reference",
      "Delivered automatically, usually within minutes of payment",
    ],
    faqs: [
      { q: "How do I buy AirtelTigo data online?", a: "Choose an AT bundle on this page, enter the recipient's AirtelTigo number, and pay with Mobile Money or card. Delivery is automatic, usually within minutes." },
      { q: "Are AT and AirtelTigo the same network?", a: "Yes — AirtelTigo also trades as AT. The bundles on this page work for any AirtelTigo/AT number in Ghana." },
      { q: "Can I buy AT data for another number?", a: "Yes. Enter any AirtelTigo number as the recipient — the data goes to that line, so you can buy for family, friends or customers." },
      { q: "Do I need an account to buy?", a: "No. Guest checkout works with Mobile Money or card, and your YG- reference lets you track the order. An account adds a wallet and order history." },
    ],
  },
};

export default function NetworkBundles({ network }: { network: NetworkId }) {
  const config = PAGES[network];
  const networkName = NETWORKS.find((n) => n.id === network)?.name ?? network;
  const { byNetwork, loading, error } = useLiveBundles();
  const { openBuyData } = useFlows();
  const bundles = byNetwork[network];

  const jsonLd = [
    faqPageLd(config.faqs),
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Prices", path: "/prices" }, { name: `${networkName} data bundles`, path: config.path }]),
    ...(bundles.length ? [bundleOffersLd(networkName, config.path, bundles.map((b) => ({ name: b.size, price: b.price })))] : []),
  ];

  const others = (Object.keys(PAGES) as NetworkId[]).filter((id) => id !== network);

  return (
    <section className="mk-section-tight" aria-labelledby="network-title">
      <Seo {...metaFor(config.path)} jsonLd={jsonLd} />
      <div className="mk-wrap">
        <p className="mk-eyebrow">{networkName} · Ghana</p>
        <h1 id="network-title" className="mk-display mt-5 max-w-[18ch] !text-[clamp(30px,5vw,50px)]">{config.h1}</h1>
        <p className="mk-lead mt-6 max-w-[62ch]">{config.intro}</p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {config.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm leading-6 text-muted-foreground">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />{bullet}
            </li>
          ))}
        </ul>

        {/* ── Live price table ── */}
        <div className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="mk-h3">{networkName} bundle prices today</h2>
            <p className="text-xs text-faint-foreground">Live from our catalogue — the price here is the price at checkout.</p>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[22px] border border-white/[0.07]">
            {loading ? (
              <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>
            ) : error || bundles.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Prices are loading slowly right now — open the <Link className="font-semibold text-primary-glow underline" to="/shop">shop</Link> to browse every live {networkName} bundle.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] uppercase tracking-[0.14em] text-faint-foreground">
                    <th className="px-5 py-3.5 font-semibold">Bundle</th>
                    <th className="px-5 py-3.5 font-semibold">Validity</th>
                    <th className="px-5 py-3.5 font-semibold">Price</th>
                    <th className="px-5 py-3.5"><span className="sr-only">Buy</span></th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => (
                    <tr key={bundle.productCode} className="border-b border-white/[0.05] last:border-b-0">
                      <td className="px-5 py-4 font-semibold text-foreground">{bundle.size}</td>
                      <td className="px-5 py-4 text-muted-foreground">{bundle.validity ?? "—"}</td>
                      <td className="px-5 py-4 font-mono text-[13.5px] text-foreground">GHS {bundle.price.toFixed(2)}</td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" className="mk-btn mk-btn-primary !px-4 !py-2 !text-[13px]" onClick={() => openBuyData({ kind: "bundle", networkId: network, productCode: bundle.productCode })}>
                          Buy<Zap size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-faint-foreground">Wallet payments skip the card/MoMo processing fee — top up once and buy in two taps.</p>
        </div>

        {/* ── FAQ (mirrors the FAQPage structured data) ── */}
        <div className="mt-14">
          <h2 className="mk-h3">Common questions about {networkName} data</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {config.faqs.map((faq) => (
              <div key={faq.q} className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-6">
                <h3 className="font-display text-[15px] font-semibold tracking-tight text-foreground">{faq.q}</h3>
                <p className="mt-2.5 text-sm leading-6 text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cross-links keep crawl depth shallow and buyers moving ── */}
        <div className="mt-14 flex flex-col gap-6 border-t border-white/[0.07] pt-9 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="mk-h3 max-w-[24ch]">Compare with the other networks</h2>
          <div className="flex flex-wrap gap-3">
            {others.map((id) => (
              <Link key={id} to={PAGES[id].path} className="mk-btn mk-btn-ghost group">
                {NETWORKS.find((n) => n.id === id)?.name} bundles<ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
              </Link>
            ))}
            <Link to="/prices" className="mk-btn mk-btn-ghost group">All prices<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
