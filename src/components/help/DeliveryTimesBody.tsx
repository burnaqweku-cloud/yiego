import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CircleCheck, Clock, Radio, TriangleAlert, Users, Wrench } from "lucide-react";
import { DELIVERY_TIMES as C, speedNetworks, type DeliveryReason } from "@/lib/deliveryTimes";
import { useDeliverySpeed } from "@/hooks/useDeliverySpeed";
import { useLatestFeed } from "@/hooks/useLatestDelivery";
import { speedLine } from "@/lib/deliveryRange";

/* The body of "Why does my data sometimes take longer?", shared by the main site and every agent store.
   Only onyx-panel and plain utility classes, which both the main look and the store templates style, and never our
   name: "we" is whoever's shop the reader is in. Wording lives in lib/deliveryTimes.ts. */
export interface DeliveryLinks { buy: string; track: string; help: string; checkMtn: string }

const REASON_ICON: Record<DeliveryReason["key"], typeof Users> = { busy: Users, first_mtn: BadgeCheck, network: Wrench, number: TriangleAlert };

export default function DeliveryTimesBody({ links }: { links: DeliveryLinks }) {
  const speeds = useDeliverySpeed();
  const latestFeed = useLatestFeed();
  const live = speedNetworks(Object.keys(speeds)).map((n) => ({ name: n, pill: speedLine(n, speeds[n], latestFeed.all[n]) })).filter((x) => x.pill);
  return (
    <div className="space-y-5">
      <section className="onyx-panel rounded-[22px] p-5 sm:p-6">
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{C.stepsTitle}</h2>
        <ol className="mt-4 space-y-4">
          {C.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-[14px] font-bold text-primary-glow">{i + 1}</span>
              <div><p className="text-[15px] font-semibold text-foreground">{s.title}</p><p className="mt-0.5 text-[13.5px] leading-6 text-muted-foreground">{s.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="onyx-panel rounded-[22px] border-l-4 border-l-amber p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[15.5px] font-semibold text-foreground"><Radio size={18} className="shrink-0 text-amber" />{C.notNetworkTitle}</p>
        <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{C.notNetworkBody}</p>
      </section>

      <section className="onyx-panel rounded-[22px] p-5 sm:p-6">
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{C.reasonsTitle}</h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-muted-foreground">{C.reasonsLead}</p>
        <ul className="mt-4 space-y-3">
          {C.reasons.map((r) => { const Icon = REASON_ICON[r.key]; return (
            <li key={r.key} className="flex gap-3 rounded-2xl border border-white/[0.07] p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground"><Icon size={17} /></span>
              <div>
                <p className="text-[14.5px] font-semibold text-foreground">{r.title}</p>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">{r.body}</p>
                {r.key === "first_mtn" && <Link to={links.checkMtn} className="mt-1.5 inline-block text-[13px] font-semibold text-primary-glow underline-offset-2 hover:underline">Check an MTN number</Link>}
              </div>
            </li>); })}
        </ul>
      </section>

      <section className="onyx-panel rounded-[22px] p-5 sm:p-6">
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">{C.canCantTitle}</h2>
        <p className="mt-3 text-[13.5px] leading-6 text-muted-foreground"><b className="text-foreground">What we can't do:</b> {C.cant}</p>
        <p className="mt-2.5 text-[13.5px] leading-6 text-muted-foreground"><b className="text-foreground">What we can do:</b> {C.can} <Link to={links.help} className="font-semibold text-primary-glow underline-offset-2 hover:underline">Get help</Link></p>
      </section>

      <section className="onyx-panel rounded-[22px] border-l-4 border-l-primary-glow p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[15.5px] font-semibold text-foreground"><CircleCheck size={18} className="shrink-0 text-primary-glow" />{C.trackedTitle}</p>
        <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{C.trackedBody} <Link to={links.track} className="font-semibold text-primary-glow underline-offset-2 hover:underline">Track an order</Link></p>
      </section>

      <section className="onyx-panel rounded-[22px] p-5 sm:p-6">
        <p className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-tight text-foreground"><Clock size={18} className="shrink-0 text-primary-glow" />{C.liveTitle}</p>
        <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{C.liveBody}</p>
        {live.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Right now</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {live.map(({ name, pill }) => (
                <span key={name} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold ${pill!.paused ? "border-white/[0.12] bg-white/[0.05] text-muted-foreground" : pill!.slow ? "border-amber/30 bg-amber/[0.08] text-amber" : "border-primary-glow/20 bg-primary/[0.08] text-primary-glow"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${pill!.paused ? "bg-faint-foreground" : pill!.slow ? "bg-amber" : "bg-primary-glow"}`} />{pill!.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <Link to={links.buy} className="onyx-btn-primary inline-flex items-center gap-2"><ArrowLeft size={16} />{C.back}</Link>
    </div>
  );
}
