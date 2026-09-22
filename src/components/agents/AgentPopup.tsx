import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store, X } from "lucide-react";
import { agentsStatus, myAgentStatus, previewRequested, rememberPreview } from "@/lib/agents";

/* Shows once per visit, a few seconds after the page loads, inviting
   people to apply as agents. Only when agents are launched. */
/** Small strip for signed-in agents who still need to pay: shown wherever the popup is mounted. */
export function AgentNudge() {
  const [state, setState] = useState<"awaiting_payment" | "paused" | null>(null);
  useEffect(() => { void agentsStatus().then(async ({ launched }) => { if (!(launched || previewRequested())) return; const me = await myAgentStatus(); if (me?.is_agent && (me.agent_status === "awaiting_payment" || me.agent_status === "paused")) setState(me.agent_status); }); }, []);
  if (!state) return null;
  return (
    <div className="mk-wrap mt-3"><Link to="/agent" className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-[13px] text-foreground"><span><b>{state === "paused" ? "Your agent store is paused." : "Your agent application is approved."}</b> {state === "paused" ? "Pay this month's fee to reopen it." : "Pay the monthly fee to open your store."}</span><span className="shrink-0 font-semibold text-primary-glow">Pay now →</span></Link></div>
  );
}

export default function AgentPopup() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null; let mounted = true;
    rememberPreview();
    void agentsStatus().then(async ({ launched, plan }) => {
      if (!mounted || !(launched || previewRequested())) return;
      const dismissedAt = Number(localStorage.getItem("yg-agent-popup-dismissed") ?? 0);
      if (Date.now() - dismissedAt < 24 * 3600 * 1000) return;
      const me = await myAgentStatus();
      if (me?.is_agent || me?.application?.status === "pending") return;
      timer = setTimeout(() => { if (mounted) setOpen(true); }, Math.max(1, plan?.popup_delay_seconds ?? 10) * 1000);
    });
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, []);
  const close = () => { setOpen(false); localStorage.setItem("yg-agent-popup-dismissed", String(Date.now())); };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-5 backdrop-blur-[2px]" onClick={close} role="dialog" aria-modal="true" aria-label="Become an agent">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-[320px] overflow-hidden rounded-3xl border border-white/[0.1] bg-background shadow-2xl">
        <button type="button" aria-label="Close" onClick={close} className="absolute right-3 top-3 z-10 rounded-full bg-black/25 p-1.5 text-white/90 hover:bg-black/45"><X size={14} /></button>
        <div className="bg-gradient-to-br from-primary/30 via-primary/10 to-transparent px-5 pb-4 pt-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-primary-glow"><Store size={21} /></span>
          <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Become an agent</p>
          <h2 className="mt-1 font-display text-[21px] font-semibold leading-tight text-foreground">Start your own<br />data business.</h2>
        </div>
        <div className="px-5 pb-5 pt-1">
          <ul className="space-y-1.5 text-[12.5px] leading-[1.35] text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary-glow">✓</span><span><b className="text-foreground">Buy data cheaper</b> — MTN 1GB 4.00, 10GB 40.00. For you, or to sell.</span></li>
            <li className="flex gap-2"><span className="text-primary-glow">✓</span><span><b className="text-foreground">Free online store.</b> Your link, your prices.</span></li>
            <li className="flex gap-2"><span className="text-primary-glow">✓</span><span><b className="text-foreground">No deposit.</b> Customers pay, you keep the profit.</span></li>
            <li className="flex gap-2"><span className="text-primary-glow">✓</span><span><b className="text-foreground">Withdraw to MoMo</b> from 20.00.</span></li>
          </ul>
          <p className="mt-3 text-center text-[12px] text-muted-foreground">Only <b className="text-foreground">3.00 a month</b> · <span className="text-primary-glow">40% off for now</span></p>
          <Link to="/agents" onClick={() => setOpen(false)} className="onyx-btn-primary mt-3 block w-full py-2.5 text-center text-[13.5px]">Apply now</Link>
          <button type="button" onClick={close} className="mt-1 w-full py-1.5 text-[12px] text-muted-foreground">Maybe later</button>
        </div>
      </div>
    </div>
  );
}
