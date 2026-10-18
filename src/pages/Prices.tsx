import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import { useFlows } from "@/store/flows";
import { useLiveBundles, type LiveBundle } from "@/hooks/useLiveBundles";
import { breadcrumbLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   /prices — every network's live bundle prices on one crawlable
   page. Targets "data bundle prices in Ghana" comparison
   searches; each network board links on to its dedicated
   landing page. Prices come from the same catalogue the shop
   sells from (snapshot first, then live), so the page is current
   and the pre-rendered HTML already carries the numbers.
   ══════════════════════════════════════════════════════════════ */

const NETWORK_PATHS: Record<NetworkId, string> = {
  mtn: "/mtn-data-bundles",
  telecel: "/telecel-data-bundles",
  at: "/airteltigo-data-bundles",
};
const NET_CLASS: Record<NetworkId, string> = { mtn: "net-mtn", telecel: "net-telecel", at: "net-at" };

const byCapacity = (a: LiveBundle, b: LiveBundle) => a.capacityGb - b.capacityGb || a.price - b.price;

/** The bundle with the lowest price per GB on a network (paused bundles excluded). */
function bestValue(list: LiveBundle[]): LiveBundle | null {
  const live = list.filter((b) => !b.paused && b.capacityGb > 0);
  if (!live.length) return null;
  return live.reduce((best, b) => (b.price / b.capacityGb < best.price / best.capacityGb ? b : best));
}

export default function Prices() {
  const { byNetwork } = useLiveBundles();
  const { openBuyData } = useFlows();
  const onSale = Object.values(byNetwork).flat().filter((b) => !b.paused);
  const cheapest = onSale.length ? Math.min(...onSale.map((b) => b.price)) : null;

  return (
    <>
      <Seo {...metaFor("/prices")} jsonLd={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Prices", path: "/prices" }])} />

      <section className="mk-wrap" aria-labelledby="prices-title">
        <div className="py-8 sm:py-12 lg:py-16">
          <span className="mk-eyebrow">Live prices</span>
          <h1 id="prices-title" className="mk-hero-title mt-3 max-w-[14ch] !text-[clamp(36px,6.5vw,72px)]">Data bundle prices in Ghana</h1>
          <p className="mk-lead mt-5">
            Every bundle for MTN, Telecel and AirtelTigo, live from the catalogue{cheapest != null ? `, from GH₵${cheapest.toFixed(2)}` : ""}. The
            price here is the price at checkout.
          </p>
        </div>

        {/* Three boards, one per network, every bundle listed. */}
        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          {NETWORKS.map((network) => {
            const bundles = [...byNetwork[network.id]].sort(byCapacity);
            return (
              <section key={network.id} className={`board ${NET_CLASS[network.id]}`} aria-labelledby={`prices-${network.id}`}>
                <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                  <h2 id={`prices-${network.id}`} className="flex items-center gap-2.5 font-display text-[16px] font-bold text-foreground">
                    <span className="h-3 w-3 rounded-full" style={{ background: "var(--net)" }} aria-hidden="true" />
                    {network.name} prices
                  </h2>
                  <Link to={NETWORK_PATHS[network.id]} className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {network.name} page
                  </Link>
                </div>
                {bundles.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No {network.name} bundles are on sale right now. Check back shortly.</p>
                ) : (
                  bundles.map((bundle, i) => (
                    <button
                      key={bundle.productCode}
                      type="button"
                      className="board-row"
                      style={{ "--i": Math.min(i, 10) } as CSSProperties}
                      disabled={bundle.paused}
                      aria-label={bundle.paused ? `${network.name} ${bundle.size} is unavailable right now` : `Buy ${network.name} ${bundle.size} for GH₵${bundle.price.toFixed(2)}`}
                      onClick={() => openBuyData({ kind: "bundle", networkId: network.id, productCode: bundle.productCode })}
                    >
                      <span>
                        <span className="board-size">{bundle.size}</span>
                        <span className="board-meta block">{bundle.paused ? "Unavailable right now" : bundle.validity ?? network.name}</span>
                      </span>
                      <span className="board-price"><small>GH₵</small>{bundle.price.toFixed(2)}</span>
                    </button>
                  ))
                )}
                <div className="board-foot"><span>Tap a bundle to buy it.</span></div>
              </section>
            );
          })}
        </div>
      </section>

      {/* Best value per network, computed from the same list. */}
      <section className="mk-section-tight" aria-labelledby="prices-value">
        <div className="mk-wrap">
          <h2 id="prices-value" className="mk-h2 max-w-[18ch]">Best value per GB</h2>
          <p className="mk-lead mt-4">The bundle on each network with the lowest price per gigabyte right now.</p>
          <dl className="mt-10 grid gap-8 sm:grid-cols-3">
            {NETWORKS.map((network) => {
              const best = bestValue(byNetwork[network.id]);
              return (
                <div key={network.id} className={`fact ${NET_CLASS[network.id]}`}>
                  <dt className="flex items-center gap-2 text-[14px] font-semibold text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--net)" }} aria-hidden="true" />{network.name}
                  </dt>
                  <dd className="mt-2">
                    {best ? (
                      <>
                        <p className="fact-n">{best.size} <span className="text-[var(--gold)]">GH₵{best.price.toFixed(2)}</span></p>
                        <p className="fact-l">About GH₵{(best.price / best.capacityGb).toFixed(2)} per GB{best.validity ? `, ${best.validity.toLowerCase()}` : ""}.</p>
                      </>
                    ) : (
                      <p className="fact-l">No bundles on sale right now.</p>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      <section className="mk-section-tight" aria-labelledby="prices-pay">
        <div className="mk-wrap">
          <div className="mk-card p-6 sm:p-8">
            <h2 id="prices-pay" className="mk-h3">How paying works</h2>
            <p className="mk-body mt-3 max-w-[70ch]">
              Pay per order with Mobile Money or card (secured by Paystack), or top up your DataYego wallet once and buy in two taps;
              wallet payments skip the processing fee. No account is needed to buy: guest checkout gives you a YG- reference you can
              follow on the <Link className="font-semibold text-foreground underline underline-offset-4" to="/track-order">Track Order</Link> page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
