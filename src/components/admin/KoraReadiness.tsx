import { useState } from "react";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { z } from "zod";

const Reading = z.object({ configured: z.boolean(), test: z.boolean().optional(), ok: z.boolean().optional(),
  items: z.array(z.object({ currency: z.string(), available: z.number().finite(), pending: z.number().finite() })).nullable(),
});

export default function KoraReadiness() {
  const [reading, setReading] = useState<z.infer<typeof Reading> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const load = async () => {
    setBusy(true); setError(false); setReading(null);
    try {
      const result = await supabase.functions.invoke("kora-holdings", { body: {} });
      const parsed = Reading.safeParse(result.data);
      if (result.error || !parsed.success || (parsed.data.configured && !parsed.data.ok)) setError(true);
      else setReading(parsed.data);
    } catch { setError(true); } finally { setBusy(false); }
  };
  const ghs = reading?.items?.find((item) => item.currency === "GHS");
  return <section className="border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold"><CreditCard size={16} />Kora · preparation</h2>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Check balances</Button>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Not activated. Paystack remains in use. Kora balances are not included in profit.</p>
    {error && <p role="alert" className="mt-2 text-sm text-danger">Kora balances are unavailable. No balance is assumed.</p>}
    {reading && !reading.configured && <p className="mt-2 text-sm text-muted-foreground">Kora credentials are not configured.</p>}
    {reading?.configured && <>
      <p className="mt-2 text-xs text-muted-foreground">{reading.test ? "Test balances — not real money" : "Provider balances — settlement reconciliation pending"}</p>
      {ghs ? <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Available · GHS</dt><dd className="mt-1 font-semibold tabular-nums">{formatGHS(ghs.available)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Pending · GHS</dt><dd className="mt-1 font-semibold tabular-nums">{formatGHS(ghs.pending)}</dd></div>
      </dl> : <p className="mt-2 text-sm text-muted-foreground">No GHS balance returned by Kora.</p>}
    </>}
  </section>;
}