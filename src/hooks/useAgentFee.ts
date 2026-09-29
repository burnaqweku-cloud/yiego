import { useEffect, useState } from "react";
import { planQuote } from "@/lib/agents";

/* Live agent fee for marketing copy: what a first-timer pays for 1 month (promo
   applied when one is running) and the normal monthly price. */
export function useAgentFee() {
  const [fee, setFee] = useState<{ payNow: number; list: number; percentOff: number } | null>(null);
  useEffect(() => { void planQuote().then((q) => { if (q) setFee({ payNow: Number(q.pay_now), list: Number(q.monthly), percentOff: q.promo?.percent_off ?? 0 }); }); }, []);
  return fee;
}
export const fee2 = (n: number) => n.toFixed(2);
