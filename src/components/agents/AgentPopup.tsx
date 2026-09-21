import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store, X } from "lucide-react";
import { agentsStatus, previewRequested, rememberPreview } from "@/lib/agents";

/* Shows once per visit, a few seconds after the page loads, inviting
   people to apply as agents. Only when agents are launched. */
export default function AgentPopup() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null; let mounted = true;
    rememberPreview();
    void agentsStatus().then(({ launched, plan }) => {
      if (!mounted || !(launched || previewRequested())) return;
      if (sessionStorage.getItem("yg-agent-popup-seen") === "1") return;
      timer = setTimeout(() => { if (mounted) { setOpen(true); sessionStorage.setItem("yg-agent-popup-seen", "1"); } }, Math.max(1, plan?.popup_delay_seconds ?? 10) * 1000);
    });
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-background p-4 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5">
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full p-1 text-faint-foreground hover:bg-white/[0.06]"><X size={16} /></button>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-glow"><Store size={18} /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">We're accepting agents</p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Sell data at agent prices from your own DataYego store and earn on every bundle.</p>
          <div className="mt-3 flex gap-2"><Link to="/agents" onClick={() => setOpen(false)} className="onyx-btn-primary px-4 py-2 text-[13px]">Apply now</Link><button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-[13px] text-muted-foreground">Not now</button></div>
        </div>
      </div>
    </div>
  );
}
