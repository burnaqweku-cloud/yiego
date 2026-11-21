import { useEffect, useMemo, useState } from "react";
import { useDeliverySpeed, type NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { deliveryToShow, loadLatest, readFeed, withLatest, type LatestDelivery, type LatestFeed } from "@/lib/latestDelivery";
import { deliveryRange, type DeliveryRange } from "@/lib/deliveryRange";

const REFRESH_MS = 60_000;

/** The latest deliveries and the owner's switch, read live and again every minute while the page is in view. */
export function useLatestFeed(): LatestFeed {
  const [feed, setFeed] = useState<LatestFeed>(() => readFeed(null));
  useEffect(() => {
    let alive = true;
    const read = () => { void loadLatest().then((next) => { if (alive) setFeed(next); }); };
    read();
    const timer = window.setInterval(() => { if (!document.hidden) read(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return feed;
}

/** The delivery to show for a network right now (good news only, see deliveryToShow). */
export function useLatestDelivery(network: string, speed: NetworkSpeed | undefined): LatestDelivery | null {
  const feed = useLatestFeed();
  return deliveryToShow(feed.all, network, speed, feed.always);
}

/** What the shop says about a network's delivery right now: the latest delivery while it is fast, otherwise how
    long orders are taking as a range (lib/deliveryRange), otherwise nothing. Never both. */
export function useDeliveryNow(network: string, speed: NetworkSpeed | undefined): { latest: LatestDelivery | null; range: DeliveryRange | null } {
  const feed = useLatestFeed();
  const latest = deliveryToShow(feed.all, network, speed, feed.always);
  return { latest, range: latest ? null : deliveryRange(network, speed, feed.all[network]) };
}

/** Every network's live speed, with the latest delivery standing in wherever its card is on show (withLatest). Use
    this, not useDeliverySpeed, anywhere a customer or an agent reads how long orders take. */
export function useLiveSpeeds(): Record<string, NetworkSpeed> {
  const speeds = useDeliverySpeed();
  const feed = useLatestFeed();
  return useMemo(() => withLatest(speeds, feed), [speeds, feed]);
}
