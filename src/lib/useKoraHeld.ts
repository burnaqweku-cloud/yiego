import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { koraHeld, koraHoldingsSchema, type KoraReading } from "./koraHoldings";

export function useKoraHeld(enabled: boolean) {
  const [reading, setReading] = useState<KoraReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false); setReading(null);
    try {
      const result = await supabase.functions.invoke("kora-holdings", { body: {} });
      if (result.error) throw new Error("unavailable");
      const parsed = koraHoldingsSchema.parse(result.data);
      if (!koraHeld(parsed)) throw new Error("incomplete");
      setReading(parsed);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { reading, held: koraHeld(reading), loading, failed, load };
}