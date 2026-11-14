import type { ReactNode } from "react";
import { Check, Clock3 } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { clockParts, dayLabel, networkMark, rightNow, type LatestDelivery as Delivery } from "@/lib/latestDelivery";
import "./latest-delivery.css";

/* The two pieces of the latest delivery that the shop band shows (ShopBand): the order's own board, and the line
   under it saying what the network is doing right now. */

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
