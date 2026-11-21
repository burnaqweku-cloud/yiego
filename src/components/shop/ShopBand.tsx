import Band from "@/components/layout/Band";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { useDeliveryNow } from "@/hooks/useLatestDelivery";
import { boardKey, tookLabel } from "@/lib/latestDelivery";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";
import { DelayHelpLink, DeliveryBoard, DeliveryNow, DeliveryRangeBoard } from "./LatestDelivery";
import Purse from "./Purse";

const dateFmt = new Intl.DateTimeFormat("en-GH", { weekday: "long", day: "numeric", month: "long" });
function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/* The top of the shop. Signed in: the greeting, the wallet (balance, Add money) and the latest delivery, in one band.
   Not signed in: the page's name and the latest delivery. One band either way, never two cards stacked (owner,
   14 Nov 2026). The delivery follows the network tab (MTN while "All" is open) and is only there while it is good
   news that is also true of now (deliveryToShow). When it is not, the band carries the slow board instead
   (DeliveryRangeBoard, lib/deliveryRange: from how long the last delivered order took to the longest wait still in
   progress, owner 19 Nov 2026), and the speed line in the catalogue says the same. Owner's standing rules: no
   totals, no word about refunds or failure, never a figure that is not true. */
export default function ShopBand({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  const { isAuthenticated } = useAuth();
  const { profile } = useProfile();
  // Fast: the latest real delivery. Slow: how long orders are taking, as a range (owner, 19 Nov 2026). Never both.
  const { latest: d, range } = useDeliveryNow(network, speed);
  const delivery = d ? (
    <>
      <DeliveryBoard key={boardKey(d)} d={d} head={<p className="yg-latest__lead"><span className="yg-latest__dot" aria-hidden="true" /><span>Latest {d.network} delivery</span><b>{tookLabel(d)}</b></p>} />
      <DeliveryNow network={d.network} speed={speed} latest={d} />
    </>
  ) : range ? <DeliveryRangeBoard key={`${range.network}-${range.text}`} r={range} /> : null;
  // While the slow board is up, the "why" link sits right under the band too (owner, 19 Nov 2026).
  const why = !d && range ? <DelayHelpLink className="-mt-2 text-center lg:-mt-5" /> : null;
  if (isAuthenticated) {
    return (
      <>
        <Band kicker={dateFmt.format(new Date())} title={`${greeting()}, ${profile.firstName}`} className="yg-band--shop">
          <Purse />
          {delivery}
        </Band>
        {why}
      </>
    );
  }
  return (
    <>
      <Band title="Buy Ghana data online" sub="Tap a bundle, enter the number, pay with MoMo or card." className="yg-band--shop">
        {delivery}
      </Band>
      {why}
    </>
  );
}
