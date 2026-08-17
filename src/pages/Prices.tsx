import { ArrowRight, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import { useFlows } from "@/store/flows";
import { useLiveBundles } from "@/hooks/useLiveBundles";
import { breadcrumbLd } from "@/lib/structuredData";

/* ══════════════════════════════════════════════════════════════
   /prices — every network's live bundle prices on one crawlable
   page. Targets "data bundle prices in Ghana" comparison
   searches; each network section links on to its dedicated
   landing page. Prices come from the same catalogue the shop
   sells from, so the page is always current.
   ══════════════════════════════════════════════════════════════ */

const NETWORK_PATHS: Record<NetworkId, string> = {
  mtn: "/mtn-data-bundles",
  telecel: "/telecel-data-bundles",
  at: "/airteltigo-data-bundles",
};

export default function Prices() {
  const { byNetwork, loading, error } = useLiveBundles();
  const { openBuyData } = useFlows();
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="mk-section-tight" aria-labelledby="prices-title">
      <Seo {...metaFor("/prices")} jsonLd={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Prices", path: "/prices" }])} />
      <div className="mk-wrap">
        <p className="mk-eyebrow">Live prices</p>
        <h1 id="prices-title" className="mk-display mt-5 max-w-[16ch] !text-[clamp(30px,5vw,50px)]">Data bundle prices in Ghana</h1>
        <p className="mk-lead mt-6 max-w-[62ch]">
          Every bundle DataYego sells for MTN, Telecel and AirtelTigo, priced live as of {today}. These are the exact prices at checkout — pay with Mobile Money or card and the data is delivered to any number in minutes.
        </p>

        {loading ? (
          <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>
        ) : error ? (
          <p className="mt-10 text-sm text-muted-foreground">Prices are loading slowly right now — open the <Link className="font-semibold text-primary-glow underline" to="/shop">shop</Link> to browse every live bundle.</p>
        ) : (
          <div className="mt-10 space-y-12">
            {NETWORKS.map((network) => {
              const bundles = byNetwork[network.id];
              return (
                <div key={network.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="mk-h3 flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: network.color }} aria-hidden="true" />
                      {network.name} bundle prices
                    </h2>
                    <Link to={NETWORK_PATHS[network.id]} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-glow">
                      {network.name} page<ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-[22px] border border-white/[0.07]">
                    {bundles.length === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground">No {network.name} bundles are on sale right now — check back shortly.</p>
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
                                <button type="button" className="mk-btn mk-btn-primary !px-4 !py-2 !text-[13px]" onClick={() => openBuyData({ kind: "bundle", networkId: network.id, productCode: bundle.productCode })}>
                                  Buy<Zap size={14} aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-14 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-6 sm:p-7">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-foreground">How paying works</h2>
          <p className="mt-2.5 max-w-[70ch] text-sm leading-6 text-muted-foreground">
            Pay per order with Mobile Money or card (secured by Paystack), or top up your DataYego wallet once and buy in two taps — wallet payments skip the processing fee. No account is needed to buy: guest checkout gives you a YG- reference you can follow on the <Link className="font-semibold text-primary-glow underline" to="/track-order">Track Order</Link> page.
          </p>
        </div>
      </div>
    </section>
  );
}
