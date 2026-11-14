import { useEffect, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { clockParts, dayLabel, deliveryToShow, loadLatest, networkMark, rightNow, tookLabel, type LatestDelivery as Delivery } from "@/lib/latestDelivery";
import "./latest-delivery.css";

const REFRESH_MS = 60_000;

/* The latest order that arrived on a network, for every visitor, above the bundles: one real order, the minute it was
   paid, the minute it landed, and how long that took, then what the network is doing right now. It follows the
   network tab (MTN while "All" is open). It wears the advert banner's look (deep green, slanted panel, amber edge).
   Shown only while the news is good and current: see deliveryToShow. The owner's standing rules hold here too: no
   totals, no word about refunds or failure, never a figure that is not true. */
export default function LatestDelivery({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  const [all, setAll] = useState<Record<string, Delivery>>({});

  useEffect(() => {
    let alive = true;
    const read = () => { void loadLatest().then((next) => { if (alive) setAll(next); }); };
    read();
    const timer = window.setInterval(() => { if (!document.hidden) read(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const d = deliveryToShow(all, network, speed);
  if (!d) return null;
  const mark = networkMark(d.network);
  const paid = clockParts(d.paidAt); const landed = clockParts(d.deliveredAt);
  const took = tookLabel(d); const day = dayLabel(d);

  return (
    <section className="yg-latest" aria-label={`The latest ${d.network} order delivered`}>
      <div className="yg-latest__panel" aria-hidden="true" />
      <h2 className="yg-latest__head">
        <span className="yg-latest__label"><span className="yg-latest__dot" aria-hidden="true" />Latest {d.network} delivery</span>
        <span className="yg-latest__took">{took}</span>
      </h2>

      {/* keyed by the order, so the line draws again when a newer delivery takes its place */}
      <div className="yg-latest__board" key={`${d.network}-${d.deliveredAt}`}>
        <p className="yg-latest__order">
          <span className="yg-latest__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
          <span className="yg-latest__what"><b>{d.gb}GB</b><span className="sr-only"> {d.network}</span><em>to {d.phone}</em></span>
          {day && <span className="yg-latest__day">{day}</span>}
        </p>
        <div className="yg-latest__trip">
          <p className="yg-latest__stop"><span>Paid</span><time dateTime={new Date(d.paidAt).toISOString()}>{paid.time}<small>{paid.period}</small></time></p>
          <span className="yg-latest__track" aria-hidden="true"><i /><b><Check size={12} strokeWidth={3.6} /></b></span>
          <p className="yg-latest__stop" data-end=""><span>Delivered</span><time dateTime={new Date(d.deliveredAt).toISOString()}>{landed.time}<small>{landed.period}</small></time></p>
        </div>
      </div>

      <p className="yg-latest__now"><Clock3 size={16} aria-hidden="true" /><span>{d.network} right now</span><b>{rightNow(speed)}</b></p>
    </section>
  );
}
