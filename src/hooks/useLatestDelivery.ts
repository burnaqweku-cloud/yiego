import { useEffect, useState } from "react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { deliveryToShow, loadLatest, type LatestDelivery } from "@/lib/latestDelivery";

const REFRESH_MS = 60_000;

/** The delivery to show for a network right now, read live and again every minute while the page is in view. */
export function useLatestDelivery(network: string, speed: NetworkSpeed | undefined): LatestDelivery | null {
  const [all, setAll] = useState<Record<string, LatestDelivery>>({});
  useEffect(() => {
    let alive = true;
    const read = () => { void loadLatest().then((next) => { if (alive) setAll(next); }); };
    read();
    const timer = window.setInterval(() => { if (!document.hidden) read(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return deliveryToShow(all, network, speed);
}
