import { useEffect, useState } from "react";
import { loadPhase1Networks, loadPhase1Products } from "@/lib/phase1-api";

/* Live agent-vs-public prices for the recruitment pages, so "buy data cheaper"
   never quotes a number that has since changed. */
export interface Saving { network: string; gb: number; agent: number; pub: number }

export function useAgentSavings(): Saving[] {
  const [rows, setRows] = useState<Saving[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadPhase1Products(), loadPhase1Networks()]).then(([{ data: products }, { data: networks }]) => {
      const name = (id: string) => { const n = networks.find((x) => x.id === id); return n?.code === "mtn" ? "MTN" : n?.code === "telecel" ? "Telecel" : "AirtelTigo"; };
      const out = products
        .filter((p) => !p.is_paused && Number(p.agent_price) > 0 && Number(p.agent_price) < Number(p.customer_price))
        .map((p) => ({ network: name(p.network_id), gb: Number(p.capacity_gb), agent: Number(p.agent_price), pub: Number(p.customer_price) }));
      if (alive) setRows(out);
    });
    return () => { alive = false; };
  }, []);
  return rows;
}

/** The few rows worth quoting: MTN 1, 2, 10, 20GB when they exist, else the first of any network. */
export function headlineSavings(rows: Saving[], count = 3): Saving[] {
  const mtn = rows.filter((r) => r.network === "MTN");
  const picks = [1, 2, 10, 20].map((gb) => mtn.find((r) => r.gb === gb)).filter((r): r is Saving => Boolean(r));
  return (picks.length ? picks : rows.slice().sort((a, b) => a.gb - b.gb)).slice(0, count);
}
