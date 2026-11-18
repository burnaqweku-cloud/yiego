import { useStore } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";
import Seo from "@/components/seo/Seo";
import DeliveryTimesBody from "@/components/help/DeliveryTimesBody";
import { DELIVERY_TIMES } from "@/lib/deliveryTimes";
import { storeBase } from "@/lib/storeHost";

/* <store>/delivery-times: the same explainer as the main site, in the store's own frame and without our name. */
export default function StoreDeliveryTimes() {
  const store = useStore(); const base = storeBase(store.slug);
  return (
    <StorePage title={DELIVERY_TIMES.title} lead={DELIVERY_TIMES.lead}>
      <Seo path={`${base}/delivery-times`} title={`${DELIVERY_TIMES.title} — ${store.store_name}`} description={DELIVERY_TIMES.lead} />
      <DeliveryTimesBody links={{ buy: `${base}/bundles`, track: `${base}/track`, help: `${base}/contact`, checkMtn: `${base}/check-mtn` }} />
    </StorePage>
  );
}
