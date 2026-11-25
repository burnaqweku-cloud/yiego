import { Link } from "react-router-dom";
import { Wrench, ShieldCheck, ArrowRight } from "lucide-react";
import { useMtnPaused } from "@/hooks/useMtnPaused";

export const MTN_BACK_BY = "1 December 2026";

/** Thin strip under the header on every page of the main site while MTN is switched off. */
export function MtnPauseBanner() {
  const paused = useMtnPaused();
  if (!paused) return null;
  return (
    <div className="yg-mtnbar" role="status">
      <span className="yg-mtnbar__dot" aria-hidden="true" />
      <p><b>MTN orders are paused</b> while MTN carries out portal maintenance (until about {MTN_BACK_BY}). Telecel and AirtelTigo are working normally.</p>
      <Link to="/shop" className="yg-mtnbar__link">Shop <ArrowRight size={13} /></Link>
    </div>
  );
}

/** Takes the place of the MTN bundle list while MTN is switched off. */
export function MtnPausedPanel({ onOther }: { onOther?: () => void }) {
  return (
    <div className="yg-mtnoff">
      <div className="yg-mtnoff__head">
        <span className="yg-mtnoff__icon"><Wrench size={20} /></span>
        <div>
          <p className="yg-mtnoff__tag">MTN service notice</p>
          <h4>MTN orders are paused for now</h4>
        </div>
      </div>
      <p className="yg-mtnoff__lead">MTN is carrying out major portal maintenance, expected to run until <b>{MTN_BACK_BY}</b>. This is a network-wide issue from MTN itself, so new MTN orders can't be placed until it is done.</p>
      <div className="yg-mtnoff__safe">
        <ShieldCheck size={18} />
        <p>Already have a <b>Processing</b> order? It is safe and accounted for. It will be delivered as soon as the maintenance ends, or earlier if the portal opens briefly.</p>
      </div>
      <div className="yg-mtnoff__foot">
        {onOther && <button type="button" onClick={onOther} className="onyx-btn-primary">Buy Telecel or AirtelTigo</button>}
        <Link to="/track" className="onyx-btn-ghost">Track my order</Link>
      </div>
    </div>
  );
}
