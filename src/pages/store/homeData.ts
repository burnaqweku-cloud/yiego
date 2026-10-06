import { useEffect, useMemo, useState } from "react";
import { NETWORKS, type Network } from "@/data/bundles";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import type { StoreData } from "@/components/store/StoreShell";

/* What every template's home page needs: live products with this store's prices,
   the featured picks (or cheapest per network), and per-network counts. */
export const NET_COLOURS: Record<string, string> = { mtn: "#ffcc00", telecel: "#e60000", at: "#1a5bd8" };
export const NET_SHORT: Record<string, string> = { mtn: "MTN", telecel: "TEL", at: "AT" };
export const prefixOf = (n: Network) => (n.id === "mtn" ? "mtn" : n.id === "telecel" ? "tel" : "at");
export const netOf = (p: Phase1Product) => NETWORKS.find((n) => p.app_product_code?.startsWith(prefixOf(n)));

export function useHomeData(store: StoreData) {
  const [products, setProducts] = useState<Phase1Product[]>([]);
  useEffect(() => { void loadPhase1Products().then((r) => setProducts(r.data ?? [])); }, []);
  const live = useMemo(() => products.filter((p) => !p.is_paused), [products]);
  const priced = (p: Phase1Product) => Number(store.prices?.[p.id] ?? p.customer_price);
  const picks = useMemo(() => {
    const chosen = (store.featured_product_ids ?? []).map((id) => live.find((p) => p.id === id)).filter((p): p is Phase1Product => Boolean(p));
    const fallback = NETWORKS.map((n) => live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))).sort((a, b) => priced(a) - priced(b))[0]).filter((p): p is Phase1Product => Boolean(p));
    return (chosen.length ? chosen : fallback).slice(0, 6).map((p) => ({ p, n: netOf(p)!, price: priced(p) })).filter((x) => x.n);
  }, [live, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const perNetwork = useMemo(() => NETWORKS.map((n) => { const ps = live.filter((p) => p.app_product_code?.startsWith(prefixOf(n))); return { n, count: ps.length, from: ps.length ? Math.min(...ps.map(priced)) : null }; }), [live, store]); // eslint-disable-line react-hooks/exhaustive-deps
  return { live, picks, perNetwork, priced, loaded: products.length > 0 };
}
