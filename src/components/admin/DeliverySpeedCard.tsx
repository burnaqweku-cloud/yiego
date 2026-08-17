import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/* The Delivery Progress panel, as the admin controls it.

   Left alone, the panel reports what the supplier's tracker measured. Type a
   banner or add rows and customers see those words instead, exactly as
   written — clearing a field hands that part back to the measurement. */

interface Snapshot {
  scanner_state: string;
  message: string | null;
  last_lag_minutes: number | string | null;
  pending_batches: number | null;
  checked_at: string;
  error_message: string | null;
}
interface PanelRow { label: string; value: string; detail: string; tone: "fast" | "queue" }

function humanise(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 2 ? `${hours.toFixed(1)} hrs` : `${Math.round(hours)} hrs`;
}
const emptyRow: PanelRow = { label: "", value: "", detail: "", tone: "queue" };

export default function DeliverySpeedCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [banner, setBanner] = useState("");
  const [rows, setRows] = useState<PanelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.functions.invoke<{
        panel?: { banner?: string; rows?: PanelRow[] }; snapshot: Snapshot | null;
      }>("supplier-delivery-status", { body: { action: "admin_state" } });
      setBanner(data?.panel?.banner ?? "");
      setRows(data?.panel?.rows ?? []);
      setSnapshot(data?.snapshot ?? null);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>(
      "supplier-delivery-status", { body: { action: "set_panel", banner, rows } });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error ?? "Could not save the panel."); return; }
    toast.success(banner.trim() || rows.length ? "Customers now see your wording." : "Back to the measured figures.");
  };

  const setRow = (index: number, patch: Partial<PanelRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const lag = snapshot?.last_lag_minutes == null ? null : Number(snapshot.last_lag_minutes);

  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Delivery progress</CardTitle>
            {snapshot && <Badge variant={lag !== null && lag > 45 ? "amber" : "success"}>
              {snapshot.scanner_state === "live" ? "Tracker live" : snapshot.scanner_state}
            </Badge>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Shown to customers on the shop, at checkout and on their orders. Measured from the supplier every five minutes — anything you type below replaces it word for word.
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

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Banner — the line at the top of the panel</span>
            <input
              className="onyx-field w-full" maxLength={240}
              placeholder="Leave empty to use the measured status"
              value={banner} onChange={(event) => setBanner(event.target.value)}
            />
          </label>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-muted-foreground">Rows — e.g. “Fast lane · 6h 10m”</span>
              <Button variant="ghost" size="sm" onClick={() => setRows((current) => [...current, { ...emptyRow }])} disabled={rows.length >= 4}>
                <Plus size={15} />Add row
              </Button>
            </div>
            {rows.length === 0
              ? <p className="mt-2 text-xs text-faint-foreground">No rows — customers see the measured delivery time instead.</p>
              : <div className="mt-3 space-y-3">
                  {rows.map((row, index) => (
                    <div key={index} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                        <input className="onyx-field w-full" maxLength={60} placeholder="Label, e.g. Fast lane"
                          value={row.label} onChange={(event) => setRow(index, { label: event.target.value })} />
                        <input className="onyx-field w-full" maxLength={40} placeholder="Time, e.g. 6h 10m"
                          value={row.value} onChange={(event) => setRow(index, { value: event.target.value })} />
                        <Button variant="ghost" size="sm" onClick={() => setRows((c) => c.filter((_, i) => i !== index))}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      <input className="onyx-field mt-2 w-full" maxLength={120} placeholder="Detail (optional), e.g. placed 17 Aug 11:23 am → delivered 5:32 pm"
                        value={row.detail} onChange={(event) => setRow(index, { detail: event.target.value })} />
                      <div className="mt-2 flex gap-2">
                        {(["fast", "queue"] as const).map((tone) => (
                          <button key={tone} type="button" onClick={() => setRow(index, { tone })}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${row.tone === tone ? "bg-primary/[0.14] text-primary-glow" : "text-faint-foreground"}`}>
                            {tone === "fast" ? "Fast" : "Queue"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>}
          </div>

          <Button className="mt-5" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}Save panel
          </Button>
        </>}
      </CardContent>
    </Card>
  );
}
