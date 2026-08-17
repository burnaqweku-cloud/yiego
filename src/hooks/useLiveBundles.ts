import { useEffect, useState } from "react";
import type { NetworkId } from "@/data/bundles";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";

/* ══════════════════════════════════════════════════════════════
   Live catalogue prices for the SEO landing pages (/prices and
   the per-network pages). Same source the shop sells from, so a
   price shown on a landing page is by construction the price at
   checkout — the freshness that ranks in this niche.
   ══════════════════════════════════════════════════════════════ */

export interface LiveBundle {
  productCode: string;
  size: string;
  validity: string | null;
  price: number;
  /** Size in GB, used to compare bundles by price per GB. */
  capacityGb: number;
}

/** "500MB" and "1.5GB" both appear as labels, so parse rather than assume GB. */
function capacityFrom(product: Phase1Product): number {
  const declared = Number(product.capacity_gb);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const match = /([\d.]+)\s*(GB|MB)/i.exec(product.name);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  return match[2].toUpperCase() === "MB" ? value / 1024 : value;
}

const PREFIX: Record<NetworkId, string> = { mtn: "mtn", telecel: "tel", at: "at" };

function toBundle(product: Phase1Product): LiveBundle {
  return {
    productCode: product.app_product_code ?? product.id,
    size: product.name.replace(/^.*?—\s*/, ""),
    validity: product.validity,
    price: Number(product.customer_price),
    capacityGb: capacityFrom(product),
  };
}

export function useLiveBundles() {
  const [byNetwork, setByNetwork] = useState<Record<NetworkId, LiveBundle[]>>({ mtn: [], telecel: [], at: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: loadError } = await loadPhase1Products();
      if (cancelled) return;
      if (loadError) setError(loadError);
      else {
        const grouped: Record<NetworkId, LiveBundle[]> = { mtn: [], telecel: [], at: [] };
        for (const id of Object.keys(grouped) as NetworkId[]) {
          grouped[id] = data.filter((p) => p.app_product_code?.startsWith(PREFIX[id])).map(toBundle);
        }
        setByNetwork(grouped);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { byNetwork, loading, error };
}
