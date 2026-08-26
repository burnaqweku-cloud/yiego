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
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke<{ suppliers?: SupplierChoice[] }>(
        "supplier-delivery-status", { body: { action: "choices" } },
      );
      if (cancelled) return;
      // Only suppliers with something to sell are worth offering.
      const list = (data?.suppliers ?? []).filter((s) => s.bundles?.length);
      setSuppliers(list);
      setError(invokeError || list.length === 0 ? "Plans are temporarily unavailable." : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return { suppliers, loading, error, reload: () => setAttempt((n) => n + 1) };
}
