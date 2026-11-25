import { Link } from "react-router-dom";
import { Wrench, ShieldCheck } from "lucide-react";
import { useMtnPaused } from "@/hooks/useMtnPaused";
import { MTN_BACK_BY } from "@/components/shop/MtnPaused";

/* Store versions of the MTN pause notice: in the store's own voice, never our name, no prices.
   Shown only while every MTN bundle is paused, so they go away when MTN is switched back on. */
export function StoreMtnBanner() {
  const paused = useMtnPaused();
  if (!paused) return null;
  return (
    <div className="yg-mtnbar" role="status">
      <span className="yg-mtnbar__dot" aria-hidden="true" />
      <p><b>MTN orders are paused</b> while MTN carries out portal maintenance (until about {MTN_BACK_BY}). Telecel and AirtelTigo are working normally.</p>
    </div>
  );
}

export function StoreMtnPanel({ onOther, trackHref }: { onOther: () => void; trackHref: string }) {
  return (
    <section className="onyx-panel rounded-2xl border border-[#f7a701]/50 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4d6] text-[#3d2a00]"><Wrench size={19} /></span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">MTN service notice</p>
          <h3 className="text-[16px] font-bold text-foreground">MTN orders are paused for now</h3>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">MTN is carrying out major portal maintenance, expected to run until <b className="text-foreground">{MTN_BACK_BY}</b>. This is a network-wide issue from MTN itself, so new MTN orders can't be placed until it is done.</p>
      <div className="mt-3 flex gap-2 rounded-xl bg-primary/[0.08] p-3 text-[13px] text-foreground">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary-glow" />
        <p>Already have a <b>Processing</b> order? It is safe and will be delivered as soon as the maintenance ends, or earlier if the portal opens briefly.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onOther} className="onyx-btn-primary rounded-full px-4 py-2 text-[13px] font-semibold">Buy Telecel or AirtelTigo</button>
        <Link to={trackHref} className="rounded-full border border-white/[0.12] px-4 py-2 text-[13px] font-semibold text-foreground">Track my order</Link>
      </div>
    </section>
  );
}
