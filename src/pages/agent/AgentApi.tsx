import { useState } from "react";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import ApiAccessPanel from "@/components/api/ApiAccessPanel";

/* My store -> API (owner, 21 Nov 2026): an agent's own website or app buying from us through the API. */
export default function AgentApi() {
  const [topUp, setTopUp] = useState(false);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-foreground">API</h1>
        <p className="text-[12.5px] text-muted-foreground">Let your own website or app buy bundles from us automatically.</p>
      </div>
      <ApiAccessPanel variant="agent" onTopUp={() => setTopUp(true)} />
      <AddMoneyFlow open={topUp} onClose={() => setTopUp(false)} />
    </div>
  );
}
