import { Link } from "react-router-dom";
import StorePage from "@/components/store/StorePage";
import { useStore } from "@/components/store/StoreShell";
import { useHomeData, netOf, prefixOf } from "@/pages/store/homeData";
import { NETWORKS } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { storeBase } from "@/lib/storeHost";
import Seo from "@/components/seo/Seo";

/* Public price list for a store — the page shared on the channel so people who
   want to sell under this agent can see the exact prices before they apply.
   Read-only: buying stays on the store home, applying on /join. Drawn with the
   store's own template so it feels like part of the same shop. */
export default function StorePrices() {
  const store = useStore();
  const { live, priced, loaded } = useHomeData(store);
  const base = storeBase(store.slug);

  return (
    <StorePage
      title={`${store.store_name} prices`}
      lead="Every bundle this store sells and what it costs. Like the prices? Apply to sell under this store — no monthly fee, you earn from your own sales."
      aside={<Link to={`${base}/join`} className="mk-btn mk-btn-primary inline-flex px-4 py-2 text-[13px]">Apply to sell under {store.store_name}</Link>}
    >
      <Seo path={`${base}/prices`} title={`${store.store_name} price list — MTN, Telecel & AirtelTigo data`} description={`See every bundle price at ${store.store_name} and apply to sell under them.`} />
      {!loaded && <p className="py-10 text-center text-[13px] text-muted-foreground">Loading prices…</p>}
      {loaded && live.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">No bundles on sale right now.</p>}
      <div className="space-y-6">
        {NETWORKS.map((n) => {
          const items = live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))).sort((a, b) => priced(a) - priced(b));
          if (!items.length) return null;
          return (
            <section key={n.id}>
              <h2 className="mb-2 text-[15px] font-semibold text-foreground">{n.name}</h2>
              <div className="space-y-2">
                {items.map((p) => {
                  const price = priced(p);
                  const promo = store.promos?.[p.id];
                  return (
                    <div key={p.id} className="onyx-panel flex items-center gap-3 rounded-2xl px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-foreground">{p.name.replace(/^.*?—\s*/, "")}</span>
                        <span className="block text-[12px] text-muted-foreground">{p.validity ?? "Validity set by the network"}</span>
                      </span>
                      <span className="text-right text-[14px] font-semibold text-primary-glow">
                        {promo && <s className="mr-1.5 text-[12px] font-medium opacity-60">{formatGHS(promo.was)}</s>}
                        {formatGHS(price)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="onyx-panel mt-6 rounded-[22px] p-5 text-center">
        <p className="text-[14px] font-semibold text-foreground">Want to earn with these prices?</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-muted-foreground">Apply to open your own store under {store.store_name}. You set your own prices above these and keep the difference.</p>
        <Link to={`${base}/join`} className="onyx-btn-primary mt-4 inline-block px-5 py-2.5 text-[13px]">Apply now</Link>
      </div>
    </StorePage>
  );
}
