import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppOffer } from "@/lib/appInstall";
import { agentAppBarResting, closeAgentAppBar } from "@/lib/agentAppBar";
import { isStoreHost } from "@/lib/storeHost";

/* "Get the app" at the top of the agent dashboard on phones, the same strip the main site shows, with one
   difference: an agent can close it. Closed, it rests for a day and returns; closed five times, it stops
   (lib/agentAppBar.ts). Like the main site's strip it never shows inside the app, on a phone that already has it,
   or on a computer. AgentShell mounts it for main agents only: a sub-agent's dashboard carries the parent's name. */
export default function AgentAppBar() {
  const { show, device } = useAppOffer();
  const [resting, setResting] = useState(() => agentAppBarResting());
  if (!show || resting) return null;
  const iphone = device === "iphone";
  const body = (
    <>
      <img src="/yiego-icon-192.png?v=3" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[11px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">DataYego app</span>
        <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">{iphone ? "Add it to your home screen" : "Free for Android"}</span>
      </span>
      <span className="yg-appbar-cta">{iphone ? <Share size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{iphone ? "Install" : "Download"}</span>
    </>
  );
  const label = iphone ? "Add DataYego to your home screen" : "Download the DataYego app";
  return (
    <div className="yg-appbar yg-appbar-closable sm:hidden">
      <button type="button" className="yg-appbar-x" aria-label="Not now" onClick={() => { closeAgentAppBar(); setResting(true); }}><X size={16} aria-hidden="true" /></button>
      {/* The app page lives on the main site; a dashboard opened on a store's own address has to leave for it. */}
      {isStoreHost()
        ? <a href="https://datayego.com/app" className="flex min-w-0 flex-1 items-center gap-2.5" aria-label={label}>{body}</a>
        : <Link to="/app" className="flex min-w-0 flex-1 items-center gap-2.5" aria-label={label}>{body}</Link>}
    </div>
  );
}
