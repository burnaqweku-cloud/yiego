import Band from "@/components/layout/Band";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { useLatestDelivery } from "@/hooks/useLatestDelivery";
import { boardKey, tookLabel } from "@/lib/latestDelivery";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";
import { DeliveryBoard, DeliveryNow } from "./LatestDelivery";
import Purse from "./Purse";

const dateFmt = new Intl.DateTimeFormat("en-GH", { weekday: "long", day: "numeric", month: "long" });
function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/* The top of the shop. Signed in: the greeting, the wallet (balance, Add money) and the latest delivery, in one band.
   Not signed in: the page's name and the latest delivery. One band either way, never two cards stacked (owner,
   14 Nov 2026). The delivery follows the network tab (MTN while "All" is open) and is only there while it is good
   news that is also true of now (deliveryToShow): when deliveries are slow the band simply does not carry it, and
   the speed line in the catalogue, which is always on, says how long orders are taking. Owner's standing rules: no
   totals, no word about refunds or failure, never a figure that is not true. */
export default function ShopBand({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  const { isAuthenticated } = useAuth();
  const { profile } = useProfile();
  const d = useLatestDelivery(network, speed);
  const delivery = d && (
    <>
      <DeliveryBoard key={boardKey(d)} d={d} head={<p className="yg-latest__lead"><span className="yg-latest__dot" aria-hidden="true" /><span>Latest {d.network} delivery</span><b>{tookLabel(d)}</b></p>} />
      <DeliveryNow network={d.network} speed={speed} />
    </>
  );
  if (isAuthenticated) {
    return (
      <Band kicker={dateFmt.format(new Date())} title={`${greeting()}, ${profile.firstName}`} className="yg-band--shop">
        <Purse />
        {delivery}
      </Band>
    );
  }
  return (
    <Band title="Buy Ghana data online" sub="Tap a bundle, enter the number, pay with MoMo or card." className="yg-band--shop">
      {delivery}
    </Band>
  );
}
