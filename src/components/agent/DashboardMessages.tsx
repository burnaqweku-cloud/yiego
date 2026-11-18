import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Megaphone } from "lucide-react";
import { p1 } from "@/components/agent/AgentShell";
import { settled } from "@/lib/settled";
import { buttonLabel, isInAppLink, readDashboardMessages, whenLabel, type DashboardMessage } from "@/lib/dashboardMessages";

/* Messages from us on the agent dashboard (owner, 18 Nov 2026): a card in the page under the balance, never a pop-up.
   The newest first, arrows when there is more than one, and "Got it" puts it away for good on this account. */
export default function DashboardMessages() {
  const [msgs, setMsgs] = useState<DashboardMessage[]>([]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let alive = true;
    void settled(p1().rpc("my_dashboard_messages", {}) as PromiseLike<{ data: unknown }>, { data: [] }).then((r) => { if (alive) setMsgs(readDashboardMessages(r.data)); });
    return () => { alive = false; };
  }, []);
  if (msgs.length === 0) return null;
  const i = Math.min(at, msgs.length - 1); const m = msgs[i];
  const label = buttonLabel(m); const when = whenLabel(m.starts_at);
  const gotIt = () => {
    setMsgs((list) => list.filter((x) => x.id !== m.id)); setAt((n) => Math.max(0, Math.min(n, msgs.length - 2)));
    void settled(p1().rpc("dismiss_dashboard_message", { p_id: m.id }) as PromiseLike<unknown>, null);
  };
  return (
    <section className="onyx-panel rounded-[22px] p-4" aria-label="Message from DataYego">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber/15 px-2.5 py-1 text-[11.5px] font-semibold text-amber"><Megaphone size={13} />From DataYego{when ? ` · ${when}` : ""}</span>
        {msgs.length > 1 && (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <button type="button" onClick={() => setAt((i - 1 + msgs.length) % msgs.length)} aria-label="Previous message" className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/[0.06]"><ChevronLeft size={15} /></button>
            <span className="tabular-nums">{i + 1} of {msgs.length}</span>
            <button type="button" onClick={() => setAt((i + 1) % msgs.length)} aria-label="Next message" className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/[0.06]"><ChevronRight size={15} /></button>
          </span>
        )}
      </div>
      <p className="mt-2.5 text-[15.5px] font-semibold leading-snug text-foreground">{m.title}</p>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-muted-foreground">{m.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {label && m.link_url && (isInAppLink(m.link_url)
          ? <Link to={m.link_url} className="onyx-btn-primary px-4 py-2 text-[13px]">{label}</Link>
          : <a href={m.link_url} target="_blank" rel="noreferrer" className="onyx-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-[13px]">{label}<ExternalLink size={13} /></a>)}
        <button type="button" onClick={gotIt} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">Got it</button>
      </div>
    </section>
  );
}
