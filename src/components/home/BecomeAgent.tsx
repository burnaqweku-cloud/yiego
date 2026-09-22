import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Store, Wallet } from "lucide-react";
import { agentsStatus, myAgentStatus, previewRequested } from "@/lib/agents";

/* Home page section: the agent offer, shown once agents are launched.
   Agents see a shortcut to their dashboard instead. */
export default function BecomeAgent() {
  const [state, setState] = useState<"hidden" | "offer" | "agent">("hidden");
  useEffect(() => { void agentsStatus().then(async ({ launched }) => { if (!(launched || previewRequested())) return; const me = await myAgentStatus(); setState(me?.is_agent ? "agent" : "offer"); }); }, []);
  if (state === "hidden") return null;
  return (
    <section className="mk-wrap py-10 sm:py-14">
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-10">
        <div className="max-w-xl">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{state === "agent" ? "Your store" : "Become an agent"}</p>
          <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight text-foreground sm:text-[34px]">{state === "agent" ? "Manage your store, prices and earnings." : "Start your own data business."}</h2>
          <p className="mt-3 text-[14.5px] leading-6 text-muted-foreground">{state === "agent" ? "Your dashboard has today's sales, your earnings balance, your share link and payouts." : "Agents buy data cheaper than everyone else — MTN 1GB at 4.00, 10GB at 40.00 — for themselves or to sell. You get a free online store, set your own prices and withdraw your profit to MoMo. No deposit needed. Only 3.00 a month."}</p>
          {state === "offer" && (
            <ul className="mt-5 grid gap-2 sm:grid-cols-3">
              {[[BadgeCheck, "Cheaper data, every bundle"], [Store, "Free store, your prices"], [Wallet, "Profit paid to your MoMo"]].map(([Icon, t]) => { const I = Icon as typeof Store; return <li key={String(t)} className="flex items-center gap-2 text-[13px] text-foreground"><I size={15} className="text-primary-glow" />{String(t)}</li>; })}
            </ul>
          )}
          <Link to={state === "agent" ? "/agent" : "/agents"} className="mk-btn mk-btn-primary group mt-6 inline-flex">{state === "agent" ? "Open my dashboard" : "Apply to be an agent"}<ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-0.5" /></Link>
        </div>
      </div>
    </section>
  );
}
