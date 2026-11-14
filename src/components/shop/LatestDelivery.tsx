import type { ReactNode } from "react";
import { useLatestDelivery } from "@/hooks/useLatestDelivery";
import { cn } from "@/lib/utils";
import { Check, Clock3 } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { boardKey, clockParts, dayLabel, networkMark, rightNow, tookLabel, type LatestDelivery as Delivery } from "@/lib/latestDelivery";
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

/* The same delivery at half the size, for the home page (owner, 14 Nov 2026: "not big, not small"): one white board
   of two short lines. Which order, how long it took, then its journey. Same rule as the shop band (deliveryToShow):
   it is only there while the news is good and true of now, and it follows the price board's network tab. */
export function DeliveryStrip({ network, speed, className }: { network: string; speed: NetworkSpeed | undefined; className?: string }) {
  const d = useLatestDelivery(network, speed);
  if (!d) return null;
  const mark = networkMark(d.network);
  const paid = clockParts(d.paidAt); const landed = clockParts(d.deliveredAt);
  const day = dayLabel(d);
  return (
    <section className={cn("yg-strip", className)} aria-label={`The latest ${d.network} order delivered`}>
      <div className="yg-strip__top">
        <span className="yg-latest__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
        <p className="yg-strip__what"><span>Latest {d.network} delivery</span><b>{d.gb}GB<em>to {d.phone}</em></b></p>
        <p className="yg-strip__took"><b>{tookLabel(d)}</b>{day && <span>{day}</span>}</p>
      </div>
      {/* keyed by the order, so the line draws again when a newer delivery takes its place */}
      <div className="yg-strip__trip" key={boardKey(d)}>
        <time dateTime={new Date(d.paidAt).toISOString()}><span className="sr-only">Paid </span>{paid.time}<small>{paid.period}</small></time>
        <span className="yg-latest__track" aria-hidden="true"><i /><b><Check size={11} strokeWidth={3.6} /></b></span>
        <time dateTime={new Date(d.deliveredAt).toISOString()}><span className="sr-only">Delivered </span>{landed.time}<small>{landed.period}</small></time>
      </div>
    </section>
  );
}
