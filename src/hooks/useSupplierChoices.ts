import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NetworkId } from "@/data/bundles";

/* ══════════════════════════════════════════════════════════════
   The suppliers a customer may choose between, each with its own
   name, its own prices and its own delivery wording. The real
   supplier is never named here — only the label we invented.
   ══════════════════════════════════════════════════════════════ */

export interface SupplierBundle {
  productCode: string;
  networkId: NetworkId;
  size: string;
  validity: string | null;
  price: number;
  capacityGb: number;
}

export interface DeliveryRow {
  label: string;
  value: string;
  detail: string | null;
  tone: "fast" | "queue";
}

export interface SupplierChoice {
  id: string;
  name: string;
  blurb: string | null;
  banner: { text: string; tone: "ok" | "slow" } | null;
  rows: DeliveryRow[];
  slow: boolean;
  bundles: SupplierBundle[];
}

export function useSupplierChoices() {
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.functions.invoke<{ suppliers?: SupplierChoice[] }>(
        "supplier-delivery-status", { body: { action: "choices" } },
      );
      if (cancelled) return;
      // Only suppliers with something to sell are worth offering.
      setSuppliers((data?.suppliers ?? []).filter((s) => s.bundles?.length));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { suppliers, loading };
}
