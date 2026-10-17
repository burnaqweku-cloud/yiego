import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { agentsStatus, myAgentStatus, previewRequested } from "@/lib/agents";
import { fee2, useAgentFee } from "@/hooks/useAgentFee";

/**
 * Home page: the agent offer, shown once agents are launched. Agents see a
 * shortcut to their dashboard instead.
 */
const POINTS = [
  ["Cheaper data", "Every bundle costs an agent less than the public price: MTN 1GB at GH₵4.00, 10GB at GH₵41.00."],
  ["Your own store", "A free online shop with your name, your prices and your own link to share."],
  ["Profit to MoMo", "The difference between your price and ours is yours. Withdraw it to Mobile Money."],
] as const;

/** Shown until the live quote arrives (and in the pre-rendered page); the quote replaces it. */
const LIST_FEE = 30;

export default function BecomeAgent() {
  const fee = useAgentFee();
  // The offer is the default (it is in the pre-rendered page); the client hides it if agents are not
  // launched and swaps in the dashboard shortcut for agents.
  const [state, setState] = useState<"hidden" | "offer" | "agent">("offer");
  useEffect(() => {
    void agentsStatus().then(async ({ launched }) => {
      if (!(launched || previewRequested())) { setState("hidden"); return; }
      const me = await myAgentStatus();
      setState(me?.is_agent ? "agent" : "offer");
    });
  }, []);
  if (state === "hidden") return null;

  return (
    <section className="mk-section-tight" aria-labelledby="agents-h">
      <div className="mk-wrap">
        <div className="agents-panel p-7 sm:p-10 lg:p-14">
          {state === "agent" ? (
            <div className="max-w-xl">
              <span className="mk-eyebrow">Your store</span>
              <h2 id="agents-h" className="mk-h2 mt-3">Manage your store, prices and earnings.</h2>
              <p className="mk-lead mt-4">Today's sales, your earnings balance, your share link and payouts are all on your dashboard.</p>
              <Link to="/agent" className="mk-btn mk-btn-primary mt-8 inline-flex">Open my dashboard</Link>
            </div>
          ) : (
            <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
              <div className="lg:col-span-6">
                <span className="mk-eyebrow">Become an agent</span>
                <h2 id="agents-h" className="mk-h2 mt-3">Start your own data business.</h2>
                <p className="mk-lead mt-4">
                  Buy data cheaper than everyone else, for yourself or to sell. No deposit. The plan is
                  {" "}GH₵{fee2(fee ? fee.payNow : LIST_FEE)} a month and you can cancel any time.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/agents" className="mk-btn mk-btn-primary">Apply to be an agent</Link>
                  <Link to="/help/agents" className="mk-btn mk-btn-ghost">How the programme works</Link>
                </div>
              </div>
              <ul className="grid gap-6 lg:col-span-6 lg:mt-2">
                {POINTS.map(([t, b]) => (
                  <li key={t} className="border-t border-[hsl(var(--border))] pt-4">
                    <h3 className="mk-h3">{t}</h3>
                    <p className="mk-body mt-1.5 max-w-[44ch]">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
