import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Zap } from "lucide-react";
import BackLink from "@/components/layout/BackLink";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import { useFlows } from "@/store/flows";
import { useLiveBundles } from "@/hooks/useLiveBundles";
import { breadcrumbLd, faqPageLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   /cheap-data-bundles-ghana — targets "cheap / fast data" searches.
   Our prices come LIVE from the catalogue. The only official figure
   quoted is MTN's published per-MB rate (mtn.com.gh/tarrifs-update);
   Telecel and AirtelTigo publish no comparable rate, so the page
   tells buyers to compare against their menus instead of inventing one.
   ══════════════════════════════════════════════════════════════ */

const PATH = "/cheap-data-bundles-ghana";
// MTN published effective rate for GH₵5–99.9 purchases: GH₵0.014244 per MB.
const MTN_RATE_PER_GB = 0.014244 * 1024;
const NET_PATH: Record<NetworkId, string> = { mtn: "/mtn-data-bundles", telecel: "/telecel-data-bundles", at: "/airteltigo-data-bundles" };
const MENU: Record<NetworkId, string> = { mtn: "*138#", telecel: "*700#", at: "*111#" };

const FAQS = [
  { q: "Where can I buy cheap data in Ghana?", a: "On DataYego you can buy MTN, Telecel and AirtelTigo bundles online for any number. The prices on this page are live, so what you see is what you pay at checkout." },
  { q: "Is DataYego cheaper than buying on *138#?", a: "For most MTN sizes, yes. MTN publishes an effective rate of about GH₵0.0142 per MB for purchases between GH₵5 and GH₵99.9, roughly GH₵14.59 per GB. Compare that with the price per GB shown next to each bundle on this page." },
  { q: "How fast is delivery?", a: "Delivery starts automatically as soon as your payment clears, with no one needing to approve it by hand. Every order gets a YG- reference and a live status on the Track Order page." },
  { q: "Can I buy cheap data for someone else's number?", a: "Yes. Enter any Ghana number on the right network and the bundle goes to that line." },
  { q: "Do I need an account?", a: "No. Pay with Mobile Money or card as a guest. An account adds a wallet, which skips the payment processing fee." },
];

export default function CheapData() {
  const { byNetwork } = useLiveBundles();
  const { openBuyData } = useFlows();

  const jsonLd = [
    faqPageLd(FAQS),
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Cheap data bundles in Ghana", path: PATH }]),
  ];

  return (
    <div>
      <Seo {...metaFor(PATH)} jsonLd={jsonLd} />

      <section className="mk-wrap py-10 sm:py-14 lg:py-20" aria-labelledby="cheap-title">
        <BackLink className="mb-5" />
        <span className="mk-eyebrow">Ghana · All networks</span>
        <h1 id="cheap-title" className="mk-h2 mt-5 max-w-[20ch] !text-[clamp(32px,5.2vw,58px)]">Cheap data bundles in Ghana, delivered fast</h1>
        <p className="mk-lead mt-5 max-w-[60ch]">Cheap MTN, Telecel and AirtelTigo data for any number. Live prices, the cost per GB shown on every bundle, and automatic delivery once you pay.</p>
        <ul className="mt-7 grid gap-3 sm:grid-cols-2">
          {[
            "Price per GB shown, so you can see the cheapest deal at a glance",
            "Sent automatically once payment clears, tracked with your YG- reference",
            "Pay with any Mobile Money or card, no account needed",
            "Buy for yourself, family, friends or customers",
          ].map((b) => (
            <li key={b} className="flex items-start gap-3 text-[15px] leading-6 text-muted-foreground">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />{b}
            </li>
          ))}
        </ul>
      </section>

      <section className="mk-section-tight" aria-labelledby="cheap-compare">
        <div className="mk-wrap">
          <h2 id="cheap-compare" className="mk-h2 max-w-[22ch]">Our prices next to the network's own</h2>
          <p className="mk-body mt-3 max-w-[64ch]">
            MTN publishes an effective rate of about GH₵0.0142 per MB for purchases from GH₵5 to GH₵99.9, which works out to roughly <strong className="text-foreground">GH₵{MTN_RATE_PER_GB.toFixed(2)} per GB</strong> on {MENU.mtn} (source: MTN Ghana tariffs page). Telecel and AirtelTigo don't publish a comparable rate, so check their menus ({MENU.telecel}, {MENU.at}) against the price per GB below.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {NETWORKS.map((n) => {
              const id = n.id as NetworkId;
              const rows = [...(byNetwork[id] ?? [])].filter((b) => !b.paused && b.capacityGb > 0).sort((a, b) => a.capacityGb - b.capacityGb).slice(0, 8);
              return (
                <div key={id} className="board">
                  <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                    <p className="font-display text-[15px] font-bold text-foreground">{n.name}</p>
                    <span className="text-[12px] text-muted-foreground">price · per GB</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">Prices are loading. <Link to={NET_PATH[id]} className="font-semibold text-foreground underline underline-offset-4">See {n.name} bundles</Link></p>
                  ) : rows.map((b, i) => {
                    const perGb = b.price / b.capacityGb;
                    const saving = id === "mtn" ? Math.round((1 - perGb / MTN_RATE_PER_GB) * 100) : null;
                    return (
                      <button
                        key={b.productCode}
                        type="button"
                        className="board-row"
                        style={{ "--i": i } as CSSProperties}
                        aria-label={`Buy ${n.name} ${b.size} for GH₵${b.price.toFixed(2)}`}
                        onClick={() => openBuyData({ kind: "bundle", networkId: id, productCode: b.productCode })}
                      >
                        <span>
                          <span className="board-size">{b.size}</span>
                          <span className="board-meta block">
                            GH₵{perGb.toFixed(2)}/GB{saving != null && saving > 0 ? ` · ${saving}% below MTN's rate` : ""}
                          </span>
                        </span>
                        <span className="board-price"><small>GH₵</small>{b.price.toFixed(2)}</span>
                      </button>
                    );
                  })}
                  <div className="board-foot">
                    <span>Tap to buy.</span>
                    <Link to={NET_PATH[id]} className="font-semibold text-foreground underline-offset-4 hover:underline">All {n.name} sizes</Link>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[13px] leading-5 text-faint-foreground">Network rates can change at any time. Card and MoMo checkouts add a small processing fee; wallet payments don't.</p>
        </div>
      </section>

      <section className="mk-section-tight" aria-labelledby="cheap-fast">
        <div className="mk-wrap">
          <div className="rounded-[24px] border border-[var(--gold)]/30 bg-[var(--gold)]/[0.06] p-6 sm:p-8">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gold)]"><Zap size={14} aria-hidden="true" />Fast data</p>
            <h2 id="cheap-fast" className="mk-h3 mt-2">How delivery stays fast</h2>
            <p className="mk-body mt-2 max-w-[64ch]">Your order goes to the network automatically the moment payment clears. If a number has moved network, we warn you before you pay so the bundle isn't lost. You can follow every order live on <Link to="/track-order" className="font-semibold text-foreground underline underline-offset-4">Track Order</Link>.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/shop" className="mk-btn mk-btn-primary">Buy cheap data now</Link>
              <Link to="/prices" className="mk-btn mk-btn-ghost">Full price list</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section-tight" aria-labelledby="cheap-faq">
        <div className="mk-wrap">
          <h2 id="cheap-faq" className="mk-h2 max-w-[20ch]">Questions about cheap data</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {FAQS.map((f) => (
              <div key={f.q} className="fact">
                <dt className="mk-h3">{f.q}</dt>
                <dd className="mk-body mt-2">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mk-body mt-10">Guides: <Link className="underline underline-offset-4" to="/blog/mtn-data-codes-ghana">MTN codes</Link> · <Link className="underline underline-offset-4" to="/blog/telecel-data-codes-ghana">Telecel codes</Link> · <Link className="underline underline-offset-4" to="/blog/airteltigo-data-codes-ghana">AirtelTigo codes</Link> · <Link className="underline underline-offset-4" to="/blog/transfer-data-mtn-to-mtn-ghana">Send MTN data to another number</Link></p>
        </div>
      </section>
    </div>
  );
}
