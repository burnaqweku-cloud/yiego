import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDeliveryNow } from "@/hooks/useLatestDelivery";
import { cn } from "@/lib/utils";
import { Check, CircleHelp, Clock3 } from "lucide-react";
import type { NetworkSpeed } from "@/hooks/useDeliverySpeed";
import { boardKey, clockParts, dayLabel, networkMark, rightNow, tookLabel, type LatestDelivery as Delivery } from "@/lib/latestDelivery";
import type { DeliveryRange } from "@/lib/deliveryRange";
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

/** "11 hr 18 min" with the numbers large and "hr"/"min" small, so a long time still fits one line (owner, 19 Nov 2026:
    hours and minutes, never "11.3 hours"). */
function Dur({ text }: { text: string }) {
  // Numbers as plain text, not spans: the boards style their own label spans small.
  return <>{text.split(" ").map((w, i) => (/^\d+$/.test(w) ? <Fragment key={i}>{i ? " " : ""}{w}</Fragment> : <small key={i}>{w}</small>))}</>;
}
/** "11 hr 18 min to 11 hr 36 min", or "about 6 hr 27 min" when both come to the same minute. */
function RangeWords({ r }: { r: DeliveryRange }) {
  return r.from === r.to ? <>about <Dur text={r.to} /></> : <><Dur text={r.from} /> <small className="yg-range__to">to</small> <Dur text={r.to} /></>;
}

/** The same board while deliveries are slow (owner, 19 Nov 2026): how long orders are taking, from the last delivered
    order up to the longest real wait, in hours and minutes (lib/deliveryRange). No order, no number, no times of day. */
export function DeliveryRangeBoard({ r }: { r: DeliveryRange }) {
  const mark = networkMark(r.network);
  return (
    <div className="yg-latest__board" data-slow="">
      <p className="yg-latest__lead" aria-label={`${r.network} deliveries right now: ${r.text}`}><span className="yg-latest__dot" aria-hidden="true" /><span>{r.network} deliveries right now</span><b className="yg-range"><RangeWords r={r} /></b></p>
      <p className="yg-latest__order">
        <span className="yg-latest__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
        <span className="yg-latest__what"><b>Payment to delivery</b><em>time taken</em></span>
      </p>
      {r.from === r.to ? (
        // One figure (both in the same hour, or only one known): "Takes about 11 hr 36 min", never "From X Up to X".
        <div className="yg-latest__trip" data-one="">
          <p className="yg-latest__stop"><span>Takes about</span><strong className="yg-range"><Dur text={r.to} /></strong></p>
          <span className="yg-latest__track" aria-hidden="true"><i /><b><Clock3 size={12} strokeWidth={3} /></b></span>
        </div>
      ) : (
        <div className="yg-latest__trip">
          <p className="yg-latest__stop"><span>From</span><strong className="yg-range"><Dur text={r.from} /></strong></p>
          <span className="yg-latest__track" aria-hidden="true"><i /><b><Clock3 size={12} strokeWidth={3} /></b></span>
          <p className="yg-latest__stop" data-end=""><span>Up to</span><strong className="yg-range"><Dur text={r.to} /></strong></p>
        </div>
      )}
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
/** "Why does data sometimes take longer?" beside a slow board (owner, 19 Nov 2026: at the top as well, not only in the
    bundle list). Main site only: it opens our /delivery-times page. */
export function DelayHelpLink({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link to="/delivery-times" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-glow underline-offset-2 hover:underline">
        <CircleHelp size={14} aria-hidden="true" />Why does data sometimes take longer?
      </Link>
    </p>
  );
}

/** The home page's slow version (owner, 19 Nov 2026): the same half-size board, "From … Up to …" as on the shop. */
function DeliveryRangeStrip({ r, className }: { r: DeliveryRange; className?: string }) {
  const mark = networkMark(r.network);
  return (
    <div className={className}>
      <section className="yg-strip" data-slow="" aria-label={`How long ${r.network} orders are taking right now`}>
        <div className="yg-strip__top">
          <span className="yg-latest__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
          <p className="yg-strip__what"><span>{r.network} deliveries</span><b>right now</b></p>
          <p className="yg-strip__took" aria-label={r.text}><b className="yg-range"><RangeWords r={r} /></b></p>
        </div>
        {r.from === r.to ? (
          <div className="yg-strip__trip" data-one="">
            <span className="yg-strip__end yg-range">Takes about <Dur text={r.to} /></span>
            <span className="yg-latest__track" aria-hidden="true"><i /><b><Clock3 size={11} strokeWidth={3} /></b></span>
          </div>
        ) : (
          <div className="yg-strip__trip">
            <span className="yg-strip__end yg-range">From <Dur text={r.from} /></span>
            <span className="yg-latest__track" aria-hidden="true"><i /><b><Clock3 size={11} strokeWidth={3} /></b></span>
            <span className="yg-strip__end yg-range">Up to <Dur text={r.to} /></span>
          </div>
        )}
      </section>
      <DelayHelpLink className="mt-2.5" />
    </div>
  );
}

export function DeliveryStrip({ network, speed, className }: { network: string; speed: NetworkSpeed | undefined; className?: string }) {
  const { latest: d, range } = useDeliveryNow(network, speed);
  if (!d) return range ? <DeliveryRangeStrip key={`${range.network}-${range.text}`} r={range} className={className} /> : null;
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
