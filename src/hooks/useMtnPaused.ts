import { useEffect, useState } from "react";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";

/** True when every MTN bundle in the live catalogue is paused (the admin switched MTN off).
 *  Read live, so the banner and the paused panel go away by themselves when MTN is switched back on. */
export function mtnAllPaused(products: Pick<Phase1Product, "app_product_code" | "is_paused">[]): boolean {
  const mtn = products.filter((p) => (p.app_product_code ?? "").startsWith("mtn"));
  return mtn.length > 0 && mtn.every((p) => p.is_paused);
}

let cache: { at: number; value: Promise<boolean> } | null = null;
export function useMtnPaused(): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let on = true;
    if (!cache || Date.now() - cache.at > 60_000) {
      cache = { at: Date.now(), value: loadPhase1Products().then((r) => (!r.error ? mtnAllPaused(r.data) : false)).catch(() => false) };
    }
    void cache.value.then((v) => { if (on) setPaused(v); });
    return () => { on = false; };
  }, []);
  return paused;
}
