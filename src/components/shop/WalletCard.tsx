import { useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { useCountUp } from "@/hooks/useCountUp";
import { formatGHS, moneyParts } from "@/lib/format";
import { useLatestDelivery } from "@/hooks/useLatestDelivery";
import { boardKey, tookLabel } from "@/lib/latestDelivery";
import { useFlows } from "@/store/flows";
import { useWallet } from "@/store/wallet";
import { DeliveryBoard, DeliveryNow } from "./LatestDelivery";

/* The one card at the top of the shop for someone signed in: their wallet (balance, Add money) and, inside the same
   card, the latest order that arrived on the network in view. It took the place of two cards stacked on each other
   (the old wallet card, then the latest-delivery card): the owner wanted one (14 Nov 2026).
   The wallet part is always there. The delivery part follows the same rule as the visitor's card (deliveryToShow):
   when deliveries are slow it is simply not in the card. */
export default function WalletCard({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  const { balance, isRealWallet, hasWallet, loading } = useWallet();
  const { openAddMoney } = useFlows();
  const [hidden, setHidden] = useState(false);
  const { symbol, value } = moneyParts(formatGHS(useCountUp(balance)));
  const d = useLatestDelivery(network, speed);
  const state = loading ? "syncing" : isRealWallet ? null : "unavailable";

  return (
    <section className={`yg-latest yg-latest--wallet${d ? "" : " yg-latest--bare"}`} aria-label="Your wallet">
      <div className="yg-latest__panel" aria-hidden="true" />
      <div className="yg-latest__purse">
        <p className="yg-latest__label">
          Your wallet{state && <span className="yg-latest__state">· {state}</span>}
          <button type="button" className="yg-latest__eye" onClick={() => setHidden((v) => !v)} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>
            {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </p>
        <button type="button" className="yg-latest__add" onClick={openAddMoney} disabled={loading || !hasWallet}>
          <Plus size={16} strokeWidth={2.8} aria-hidden="true" />Add money
        </button>
        <p className="yg-latest__took yg-latest__money" data-long={!hidden && value.length > 8 ? "" : undefined}>{symbol && <small>{symbol}</small>}{hidden ? "••••••" : value}</p>
      </div>

      {d && (
        <div className="yg-latest__more">
          <DeliveryBoard key={boardKey(d)} d={d} head={<p className="yg-latest__lead"><span className="yg-latest__dot" aria-hidden="true" /><span>Latest {d.network} delivery</span><b>{tookLabel(d)}</b></p>} />
          <DeliveryNow network={d.network} speed={speed} />
        </div>
      )}
    </section>
  );
}
