import Band from "@/components/layout/Band";
import Seo from "@/components/seo/Seo";
import DeliveryTimesBody from "@/components/help/DeliveryTimesBody";
import { DELIVERY_TIMES } from "@/lib/deliveryTimes";
import { metaFor } from "@/lib/site";

/* datayego.com/delivery-times: why an order can take longer, linked from the speed shown on the buy page. */
export default function DeliveryTimes() {
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Seo {...metaFor("/delivery-times")} />
      <Band kicker={DELIVERY_TIMES.kicker} title={DELIVERY_TIMES.title} sub={DELIVERY_TIMES.lead} className="mb-5" />
      <DeliveryTimesBody links={{ buy: "/shop", track: "/track-order", help: "/support", checkMtn: "/check-mtn" }} />
    </div>
  );
}
