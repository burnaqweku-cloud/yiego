import { useEffect, useState } from "react";
import { Gauge, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/* Delivery speed, as the admin sees it: what the supplier's live tracker
   measured, and the sentence you can type to override it. Whatever is typed
   here is shown to customers verbatim; clearing it hands control back to the
   measurement. */

interface Snapshot {
  scanner_state: string;
  message: string | null;
  last_lag_minutes: number | string | null;
  pending_batches: number | null;
  checked_at: string;
  error_message: string | null;
}

function humanise(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 2 ? `${hours.toFixed(1)} hrs` : `${Math.round(hours)} hrs`;
}

export default function DeliverySpeedCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.functions.invoke<{ manual: string | null; snapshot: Snapshot | null }>(
      "supplier-delivery-status", { body: { action: "admin_state" } });
    setManual(data?.manual ?? "");
    setSnapshot(data?.snapshot ?? null);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>(
      "supplier-delivery-status", { body: { action: "set_manual", estimate: manual } });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error ?? "Could not save the estimate."); return; }
    toast.success(manual.trim() ? "Customers now see your wording." : "Back to the measured estimate.");
  };

  const lag = snapshot?.last_lag_minutes == null ? null : Number(snapshot.last_lag_minutes);

  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Delivery speed</CardTitle>
            {snapshot && <Badge variant={lag !== null && lag > 45 ? "amber" : "success"}>
              {snapshot.scanner_state === "live" ? "Tracker live" : snapshot.scanner_state}
            </Badge>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Measured from the supplier's live tracker every five minutes and shown to customers before they pay.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="grid min-h-24 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div> : <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint-foreground">Last order took</p>
              <p className="mt-2 font-display text-xl font-semibold text-white">{lag === null ? "—" : humanise(lag)}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint-foreground">Queue at supplier</p>
              <p className="mt-2 font-display text-xl font-semibold text-white">{snapshot?.pending_batches?.toLocaleString() ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint-foreground">Checked</p>
              <p className="mt-2 font-display text-xl font-semibold text-white">
                {snapshot?.checked_at ? new Date(snapshot.checked_at).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>

          {snapshot?.message && <p className="mt-3 text-xs text-faint-foreground">Supplier says: {snapshot.message}</p>}
          {snapshot?.error_message && <p className="mt-3 text-xs text-amber">Tracker error: {snapshot.error_message}</p>}

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Your wording (optional) — overrides the measurement, shown to customers exactly as typed
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="onyx-field w-full"
                maxLength={200}
                placeholder="e.g. Most orders arrive within minutes."
                value={manual}
                onChange={(event) => setManual(event.target.value)}
              />
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}Save
              </Button>
            </div>
            <span className="mt-1.5 block text-xs text-faint-foreground">
              Leave it empty and customers see the measured figure instead. <Gauge size={11} className="inline" /> Slow is flagged above 45 minutes.
            </span>
          </label>
        </>}
      </CardContent>
    </Card>
  );
}
