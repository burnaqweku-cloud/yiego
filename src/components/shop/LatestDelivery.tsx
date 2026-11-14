import type { ReactNode } from "react";
import { Check, Clock3 } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { useLatestDelivery } from "@/hooks/useLatestDelivery";
import { boardKey, clockParts, dayLabel, networkMark, rightNow, tookLabel, type LatestDelivery as Delivery } from "@/lib/latestDelivery";
import "./latest-delivery.css";

/** The white board: the order itself, then its journey from the minute it was paid to the minute it landed.
    `head` is an optional first line (the wallet card names the delivery there, since its own headline is the balance). */
export function DeliveryBoard({ d, head }: { d: Delivery; head?: ReactNode }) {
  const mark = networkMark(d.network);
  const paid = clockParts(d.paidAt); const landed = clockParts(d.deliveredAt);
  const day = dayLabel(d);
  return (
    <div className="yg-latest__board">
      {head}
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
  );
}

/** The last line of the card: what the network is doing at this moment. */
export function DeliveryNow({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  return <p className="yg-latest__now"><Clock3 size={16} aria-hidden="true" /><span>{network} right now</span><b>{rightNow(speed)}</b></p>;
}

/* The latest order that arrived on a network, for a visitor who is not signed in, above the bundles: one real order,
   the minute it was paid, the minute it landed, and how long that took, then what the network is doing right now.
   It follows the network tab (MTN while "All" is open). Someone signed in sees the same order inside their wallet
   card instead (WalletCard), so the page never carries two of these.
   It wears the advert banner's look (deep green, slanted panel, amber edge). Shown only while the news is good and
   current: see deliveryToShow. The owner's standing rules hold here too: no totals, no word about refunds or
   failure, never a figure that is not true. */
export default function LatestDelivery({ network, speed }: { network: string; speed: NetworkSpeed | undefined }) {
  const d = useLatestDelivery(network, speed);
  if (!d) return null;
  return (
    <section className="yg-latest" aria-label={`The latest ${d.network} order delivered`}>
      <div className="yg-latest__panel" aria-hidden="true" />
      <h2 className="yg-latest__head">
        <span className="yg-latest__label"><span className="yg-latest__dot" aria-hidden="true" />Latest {d.network} delivery</span>
        <span className="yg-latest__took">{tookLabel(d)}</span>
      </h2>
      <DeliveryBoard key={boardKey(d)} d={d} />
      <DeliveryNow network={d.network} speed={speed} />
    </section>
  );
}
