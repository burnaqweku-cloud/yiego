import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CopyRef from "@/components/admin/CopyRef";
import { Panel, Pill, Stat, StatGrid } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSent, OUTCOME_LABEL, type SentOrder } from "@/lib/mtn-verification-admin";

/* Admin → MTN verification → Sent. Every order sent from the queue, who sent it, and what DBH says now. */
const deliveryOf = (o: SentOrder): { text: string; tone: "good" | "warn" | "bad" | "muted" } =>
  o.order_status === "delivered" ? { text: "Delivered", tone: "good" }
  : o.order_status === "processing" ? { text: `With DBH${o.supplier_status ? ` · ${o.supplier_status}` : ""}`, tone: "warn" }
  : o.order_status === "refunded" ? { text: "Refunded", tone: "muted" }
  : { text: o.order_status.replace(/_/g, " "), tone: "bad" };

export default function AdminMtnVerificationSent() {
  const [rows, setRows] = useState<SentOrder[] | null>(null);
  const load = async () => { try { setRows(await loadSent(200)); } catch (e) { toast.error((e as Error).message); setRows([]); } };
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, []);

  const delivered = rows?.filter((r) => r.order_status === "delivered").length ?? 0;
  const pending = rows?.filter((r) => r.order_status === "processing" && (r.outcome === "sent" || r.outcome === "adopted")).length ?? 0;
  const problems = rows?.filter((r) => r.outcome === "failed" || r.outcome === "refused" || (r.order_status !== "delivered" && r.order_status !== "processing" && r.order_status !== "refunded")).length ?? 0;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Sent" description="Orders sent to DataBundlesHub from the verification queue. Delivery updates as DBH reports back (every few minutes)." action={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/[0.1] p-1.5 text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCw size={14} /></button>
      } />
      <StatGrid cols={3}>
        <Stat label="Delivered" value={rows ? delivered : "—"} tone="good" loading={!rows} />
        <Stat label="Still with DBH" value={rows ? pending : "—"} tone={pending ? "warn" : "muted"} loading={!rows} />
        <Stat label="Problems" value={rows ? problems : "—"} tone={problems ? "bad" : "muted"} note="failed or refused" loading={!rows} />
      </StatGrid>
      <Panel title={rows ? `${rows.length} sent` : "Loading…"} icon={Send}>
        {rows === null ? <p className="py-5 text-center text-[12px] text-faint-foreground">Loading…</p> : rows.length === 0 ? <p className="py-5 text-center text-[12px] text-faint-foreground">Nothing sent from the queue yet.</p> : (
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((o) => { const d = deliveryOf(o); const oc = OUTCOME_LABEL[o.outcome]; return (
              <li key={o.id} className="py-2.5">
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"><span className="font-mono font-semibold">{o.phone}</span><span className="font-semibold">{o.bundle}</span><Pill tone={oc.tone === "default" ? "muted" : oc.tone}>{oc.text}</Pill>{(o.outcome === "sent" || o.outcome === "adopted") && <Pill tone={d.tone}>{d.text}</Pill>}{o.store_name && <Pill>{o.store_name}</Pill>}</p>
                <p className="text-[11px] text-faint-foreground"><CopyRef value={o.order_reference} /> · GH₵{Number(o.amount).toFixed(2)} · sent {formatAdminDate(o.sent_at)}{o.sent_by ? ` by ${o.sent_by}` : ""}{o.supplier_purchase_id ? ` · DBH ${o.supplier_purchase_id}` : ""}{o.delivered_at ? ` · delivered ${formatAdminDate(o.delivered_at)}` : ""}</p>
                {o.detail && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{o.detail}</p>}
                <Link to={`/admin/orders?q=${encodeURIComponent(o.order_reference)}`} className="mt-0.5 inline-block text-[11.5px] font-semibold text-primary-glow hover:underline">Open order</Link>
              </li>); })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
