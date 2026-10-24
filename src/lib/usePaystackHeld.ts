import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { paystackHoldingsSchema } from "@/lib/paystackHoldings";
import { paystackHeld, type PaystackHeld, type RefundItem } from "@/lib/financeV2";

const refundsSchema = z.object({ ok: z.boolean(), items: z.array(z.object({ id: z.union([z.number(), z.string()]), status: z.string(), amount: z.number(), deducted: z.number(), created: z.string().nullable().optional() })) });
const schema = paystackHoldingsSchema.extend({ refunds_not_fully_deducted: refundsSchema.optional() });
export type HeldReading = z.infer<typeof schema>;

/** Reads Paystack directly (admin-protected, read-only). held is null whenever any part is incomplete. */
export function usePaystackHeld(enabled: boolean) {
  const [reading, setReading] = useState<HeldReading | null>(null);
  const [held, setHeld] = useState<PaystackHeld | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const res = await supabase.functions.invoke("paystack-holdings", { body: {} });
      if (res.error) throw new Error("unavailable");
      const parsed = schema.parse(res.data);
      setReading(parsed); setHeld(paystackHeld(parsed as Parameters<typeof paystackHeld>[0]));
    } catch { setReading(null); setHeld(null); setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { reading, held, loading, failed, load, refunds: (reading?.refunds_not_fully_deducted?.items ?? []) as RefundItem[] };
}
