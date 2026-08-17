import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { NETWORKS } from "@/data/bundles";
import { useLiveBundles } from "@/hooks/useLiveBundles";

/* The live half of the price-comparison guide: every bundle we currently sell,
   ranked by what a gigabyte actually costs on it. Because it reads the same
   catalogue the shop sells from, the article is accurate on the day it is read
   rather than on the day it was written. */

function cedisPerGb(price: number, capacityGb: number) {
  return capacityGb > 0 ? price / capacityGb : Infinity;
}

export default function BestValueTable() {
  const { byNetwork, loading, error } = useLiveBundles();

  const ranked = NETWORKS.map((network) => {
    const usable = byNetwork[network.id].filter((bundle) => bundle.capacityGb > 0);
    const best = usable.length
      ? usable.reduce((a, b) => (cedisPerGb(a.price, a.capacityGb) <= cedisPerGb(b.price, b.capacityGb) ? a : b))
      : null;
    return { network, best, count: usable.length };
  }).filter((row) => row.best);

  if (loading) {
    return <div className="grid min-h-32 place-items-center rounded-[18px] border border-white/[0.07]"><Loader2 className="animate-spin text-primary-glow" /></div>;
  }
  if (error || ranked.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Live prices are not loading right now — the full list is on the <Link className="font-semibold text-primary-glow underline" to="/prices">prices page</Link>.
      </p>
    );
  }

  const cheapest = ranked.reduce((a, b) =>
    cedisPerGb(a.best!.price, a.best!.capacityGb) <= cedisPerGb(b.best!.price, b.best!.capacityGb) ? a : b);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <div className="overflow-x-auto rounded-[18px] border border-white/[0.07]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] uppercase tracking-[0.14em] text-faint-foreground">
              <th className="px-5 py-3.5 font-semibold">Network</th>
              <th className="px-5 py-3.5 font-semibold">Best-value bundle</th>
              <th className="px-5 py-3.5 font-semibold">Price</th>
              <th className="px-5 py-3.5 font-semibold">Per GB</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ network, best }) => (
              <tr key={network.id} className="border-b border-white/[0.05] last:border-b-0">
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-2 text-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: network.color }} aria-hidden="true" />
                    {network.name}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-semibold text-foreground">{best!.size}</td>
                <td className="px-5 py-3.5 font-mono text-[13.5px] text-foreground">GHS {best!.price.toFixed(2)}</td>
                <td className="px-5 py-3.5 font-mono text-[13.5px] text-foreground">GHS {cedisPerGb(best!.price, best!.capacityGb).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-faint-foreground">
        DataYego prices, read live on {today}. Best value per network by price per gigabyte — on the day you read this, the winner is <strong className="text-muted-foreground">{cheapest.network.name}</strong>. See every size on the <Link className="font-semibold text-primary-glow underline" to="/prices">prices page</Link>.
      </p>
    </div>
  );
}
