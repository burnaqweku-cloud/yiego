import type { CSSProperties } from "react";
import BackLink from "@/components/layout/BackLink";
import { CheckCircle2 } from "lucide-react";
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
    h1: "MTN data bundles in Ghana — live prices, buy online",
    intro: "Buy MTN data online for any Ghana number: yours, family, friends or customers. Pay with Mobile Money or card; the price you see is the price at checkout.",
    bullets: [
      "Works for any MTN number in Ghana — buy for yourself or someone else",
      "Pay with MTN MoMo, other Mobile Money, or card (secured by Paystack)",
      "No account needed — check out as a guest and track with your YG- reference",
      "Sent to the number automatically after payment",
    ],
    faqs: [
      { q: "How do I buy MTN data online in Ghana?", a: "Choose an MTN bundle on this page, enter the recipient's MTN number, and pay with Mobile Money or card. The bundle is sent to that number automatically and you get a YG- reference to track it." },
      { q: "Can I buy MTN data for another number?", a: "Yes. Enter any MTN number as the recipient. The data goes to the number you enter, not to your own line — handy for family, friends or customers." },
      { q: "Do I need an account to buy MTN data?", a: "No. You can check out as a guest and pay by Mobile Money or card. You'll get a YG- reference to track your order. An account adds a wallet, saved details and order history." },
      { q: "How long does MTN data delivery take?", a: "Delivery is automatic once payment clears. Network speed varies, so instead of promising a time we give every order a live status on the Track Order page, and the support team is there if anything stalls." },
      { q: "How do the bundle validities work?", a: "Each bundle shows its validity next to the price on this page — what you see listed is exactly what the network applies when the bundle lands." },
    ],
  },
  telecel: {
    path: "/telecel-data-bundles",
    h1: "Telecel data bundles (formerly Vodafone)",
    intro: "Buy Telecel Ghana data online (formerly Vodafone Ghana) for any Telecel number. Pay with Mobile Money or card; the price you see is the price at checkout.",
    bullets: [
      "Works for any Telecel (ex-Vodafone) number in Ghana",
      "Pay with Telecel Cash, MTN MoMo, other Mobile Money, or card",
      "Guest checkout — no account required, track with your YG- reference",
      "Sent to the number automatically after payment",
    ],
    faqs: [
      { q: "Is Telecel the same as Vodafone Ghana?", a: "Yes — Vodafone Ghana was rebranded as Telecel Ghana. If your SIM was a Vodafone SIM, it's now a Telecel SIM, and the bundles on this page work for it." },
      { q: "How do I buy Telecel data online?", a: "Pick a bundle on this page, enter the recipient's Telecel number, and pay with Mobile Money or card. The bundle is sent automatically and you can follow it on the Track Order page." },
      { q: "Can I buy Telecel data for someone else?", a: "Yes. Enter their Telecel number as the recipient and the data goes straight to their line." },
      { q: "Do I need an account?", a: "No — guest checkout works with Mobile Money or card, and you get a YG- reference to track the order. An account adds a wallet and order history." },
    ],
  },
  at: {
    path: "/airteltigo-data-bundles",
    h1: "AirtelTigo data bundles, built for value",
    intro: "Buy AirtelTigo (AT) data online for any AT number. Pay with Mobile Money or card; the price you see is the price at checkout.",
    bullets: [
      "Works for any AirtelTigo (AT) number in Ghana",
      "Pay with AT Money, MTN MoMo, other Mobile Money, or card",
      "Guest checkout — no account required, track with your YG- reference",
      "Sent to the number automatically after payment",
    ],
    faqs: [
      { q: "How do I buy AirtelTigo data online?", a: "Choose an AT bundle on this page, enter the recipient's AirtelTigo number, and pay with Mobile Money or card. Delivery is automatic and every order can be followed on the Track Order page." },
      { q: "Are AT and AirtelTigo the same network?", a: "Yes — AirtelTigo also trades as AT. The bundles on this page work for any AirtelTigo/AT number in Ghana." },
      { q: "Can I buy AT data for another number?", a: "Yes. Enter any AirtelTigo number as the recipient — the data goes to that line, so you can buy for family, friends or customers." },
      { q: "Do I need an account to buy?", a: "No. Guest checkout works with Mobile Money or card, and your YG- reference lets you track the order. An account adds a wallet and order history." },
    ],
  },
};

const NET_CLASS: Record<NetworkId, string> = { mtn: "net-mtn", telecel: "net-telecel", at: "net-at" };
const NET_MARK: Record<NetworkId, string> = { mtn: "MTN", telecel: "TEL", at: "AT" };

export default function NetworkBundles({ network }: { network: NetworkId }) {
  const config = PAGES[network];
  const networkName = NETWORKS.find((n) => n.id === network)?.name ?? network;
  const { byNetwork } = useLiveBundles();
  const { openBuyData } = useFlows();
  const bundles = [...byNetwork[network]].sort((a, b) => a.capacityGb - b.capacityGb || a.price - b.price);
  const cheapest = bundles.length ? Math.min(...bundles.map((b) => b.price)) : null;

  const jsonLd = [
    faqPageLd(config.faqs),
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Prices", path: "/prices" }, { name: `${networkName} data bundles`, path: config.path }]),
    ...(bundles.length ? [bundleOffersLd(networkName, config.path, bundles.map((b) => ({ name: b.size, price: b.price })))] : []),
  ];

  const others = (Object.keys(PAGES) as NetworkId[]).filter((id) => id !== network);

  return (
    <div className={NET_CLASS[network]}>
      <Seo {...metaFor(config.path)} jsonLd={jsonLd} />

      {/* Hero: the copy on the left, the whole price list on the right. */}
      <section className="mk-wrap" aria-labelledby="network-title">
        {/* Phones: headline, then the prices, then the detail. Desktop: copy left, prices right. */}
        <div className="grid gap-8 py-10 sm:py-14 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-6 lg:py-20">
          <div className="lg:col-span-6">
            <BackLink className="mb-5" />
            <div className="flex items-center gap-3">
              <span className="net-mark" aria-hidden="true">{NET_MARK[network]}</span>
              <span className="mk-eyebrow !text-foreground">{networkName} · Ghana</span>
            </div>
            <h1 id="network-title" className="mk-h2 mt-5 max-w-[18ch] !text-[clamp(32px,5.2vw,58px)]">{config.h1}</h1>
            <p className="mk-lead mt-5">{config.intro}</p>
          </div>

          <div className="lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1" id="prices">
            <div className="board">
              <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                <p className="font-display text-[15px] font-bold text-foreground">{networkName} bundle prices today</p>
                {cheapest != null && <span className="text-[12.5px] text-muted-foreground">from GH₵{cheapest.toFixed(2)}</span>}
              </div>
              {bundles.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Prices are loading slowly right now. Open the <Link className="font-semibold text-foreground underline underline-offset-4" to="/shop">shop</Link> to browse every live {networkName} bundle.</p>
              ) : (
                bundles.map((bundle, i) => (
                  <button
                    key={bundle.productCode}
                    type="button"
                    className="board-row"
                    style={{ "--i": Math.min(i, 10) } as CSSProperties}
                    disabled={bundle.paused}
                    aria-label={bundle.paused ? `${networkName} ${bundle.size} is unavailable right now` : `Buy ${networkName} ${bundle.size} for GH₵${bundle.price.toFixed(2)}`}
                    onClick={() => openBuyData({ kind: "bundle", networkId: network, productCode: bundle.productCode })}
                  >
                    <span>
                      <span className="board-size">{bundle.size}</span>
                      <span className="board-meta block">{bundle.paused ? "Unavailable right now" : bundle.validity ?? networkName}</span>
                    </span>
                    <span className="board-price"><small>GH₵</small>{bundle.price.toFixed(2)}</span>
                  </button>
                ))
              )}
              <div className="board-foot">
                <span>Tap a bundle to buy it. The price here is the price at checkout.</span>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-faint-foreground">Wallet payments skip the card and MoMo processing fee: top up once and buy in two taps.</p>
          </div>

          <div className="lg:col-span-6">
            <ul className="grid gap-3">
              {config.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-[15px] leading-6 text-muted-foreground">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />{bullet}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {network === "mtn" ? (
                <Link to="/check-mtn" className="mk-btn mk-btn-ghost w-full sm:w-auto">Check an MTN number first</Link>
              ) : (
                <Link to="/prices" className="mk-btn mk-btn-ghost w-full sm:w-auto">Compare all networks</Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Questions, written out in full so the page answers them without a tap. */}
      <section className="mk-section-tight" aria-labelledby="network-faq">
        <div className="mk-wrap">
          <h2 id="network-faq" className="mk-h2 max-w-[20ch]">Common questions about {networkName} data</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {config.faqs.map((faq) => (
              <div key={faq.q} className="fact">
                <dt className="mk-h3">{faq.q}</dt>
                <dd className="mk-body mt-2">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Cross-links keep crawl depth shallow and buyers moving. */}
      <section className="mk-section-tight" aria-labelledby="network-others">
        <div className="mk-wrap flex flex-col gap-6 border-t border-[hsl(var(--border))] pt-10 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="network-others" className="mk-h3 max-w-[24ch]">Compare with the other networks</h2>
          <div className="flex flex-wrap gap-3">
            {others.map((id) => (
              <Link key={id} to={PAGES[id].path} className="mk-btn mk-btn-ghost">{NETWORKS.find((n) => n.id === id)?.name} bundles</Link>
            ))}
            <Link to="/prices" className="mk-btn mk-btn-ghost">All prices</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
