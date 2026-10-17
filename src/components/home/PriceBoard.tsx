import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { NETWORKS, type NetworkId } from "@/data/bundles";
import { useLiveBundles, type LiveBundle } from "@/hooks/useLiveBundles";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";

/**
 * The hero's right-hand side: today's prices, one network at a time, every row
 * a real product you can buy with one tap. Seeded from the build-time catalogue
 * snapshot (so the pre-rendered HTML already carries prices and hydration
 * matches), then replaced by the live catalogue.
 */

const NETWORK_PATH: Record<NetworkId, string> = {
  mtn: "/mtn-data-bundles",
  telecel: "/telecel-data-bundles",
  at: "/airteltigo-data-bundles",
};

const NETWORK_CLASS: Record<NetworkId, string> = { mtn: "net-mtn", telecel: "net-telecel", at: "net-at" };

/** Rows the board shows before the "all bundles" link takes over. */
const ROWS = 7;

const byCapacity = (a: LiveBundle, b: LiveBundle) => a.capacityGb - b.capacityGb || a.price - b.price;

export default function PriceBoard() {
  const { byNetwork } = useLiveBundles();
  const { openBuyData } = useFlows();
  const [networkId, setNetworkId] = useState<NetworkId>("mtn");
  const network = NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0];
  const all = [...(byNetwork[networkId] ?? [])].sort(byCapacity);
  const rows = all.slice(0, ROWS);

  return (
    <div className={`board ${NETWORK_CLASS[networkId]}`}>
      <div className="board-tabs" role="tablist" aria-label="Network">
        {NETWORKS.map((n) => (
          <button
            key={n.id}
            type="button"
            role="tab"
            id={`board-tab-${n.id}`}
            aria-selected={n.id === networkId}
            aria-controls="board-panel"
            className={`board-tab ${NETWORK_CLASS[n.id]}`}
            onClick={() => setNetworkId(n.id)}
          >
            <span className="dot" aria-hidden="true" />
            {n.name}
          </button>
        ))}
      </div>

      <div id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${networkId}`}>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {network.name} bundles are off the board right now.{" "}
            <Link to="/prices" className="font-semibold text-foreground underline underline-offset-4">See all prices</Link>
          </p>
        ) : (
          rows.map((b, i) => (
            <button
              key={b.productCode}
              type="button"
              className="board-row"
              style={{ "--i": i } as CSSProperties}
              onClick={() => openBuyData({ kind: "bundle", networkId, productCode: b.productCode })}
              aria-label={`Buy ${network.name} ${b.size} for ${formatGHS(b.price)}`}
            >
              <span>
                <span className="board-size">{b.size}</span>
                <span className="board-meta block">{network.name}{b.validity ? ` · ${b.validity}` : ""}</span>
              </span>
              <span className="board-price"><small>GH₵</small>{b.price.toFixed(2)}</span>
            </button>
          ))
        )}
      </div>

      <div className="board-foot">
        <span>Tap a bundle to buy it.</span>
        <Link to={NETWORK_PATH[networkId]} className="font-semibold text-foreground underline-offset-4 hover:underline">
          All {all.length} {network.name} bundles
        </Link>
      </div>
    </div>
  );
}
