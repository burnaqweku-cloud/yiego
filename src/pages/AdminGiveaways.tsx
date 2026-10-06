import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Row, Rows, Stat, StatGrid } from "@/components/admin/ui";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Giveaway campaigns: what each one costs us, how many have been claimed, and the switch to stop it. */
interface C { id: string; slug: string; title: string; price: number; normal_price: number; cost: number | null; product: string; is_active: boolean; max: number; paid: number; pending: number; discount_given: number; created_at: string }
interface R { id: string; recipient_phone: string; status: string; created_at: string; order_id: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };

export default function AdminGiveaways() {
  const [list, setList] = useState<C[] | null>(null); const [open, setOpen] = useState<string | null>(null); const [reds, setReds] = useState<R[]>([]);
  const load = async () => { const { data } = await db().rpc("admin_campaign_stats", {}); setList((data as C[]) ?? []); };
  useEffect(() => { void load(); }, []);
  const toggle = async (c: C) => { const { error } = await db().from("campaigns").update({ is_active: !c.is_active }).eq("id", c.id); if (error) return toast.error("Couldn't update."); void load(); };
  const setMax = async (c: C) => { const v = window.prompt(`Hidden cap for "${c.title}" (currently ${c.max}). Customers never see this number.`, String(c.max)); if (!v) return; const n = Number(v); if (!Number.isInteger(n) || n < 0) return toast.error("Whole number."); await db().from("campaigns").update({ max_redemptions: n }).eq("id", c.id); void load(); };
  const show = async (c: C) => { if (open === c.id) return setOpen(null); const { data } = await db().from("campaign_redemptions").select("id, recipient_phone, status, created_at, order_id").eq("campaign_id", c.id).order("created_at", { ascending: false }).limit(300); setReds((data as R[]) ?? []); setOpen(c.id); };
  const totals = (list ?? []).reduce((a, c) => ({ paid: a.paid + Number(c.paid), discount: a.discount + Number(c.discount_given) }), { paid: 0, discount: 0 });
  return (
    <div className="space-y-5">
      <AdminPageHeader title="Giveaways" description="Special-price links. One claim per number, account and device; the cap is never shown to customers. The discount shows in profit automatically (lower revenue against the same cost)." />
      <StatGrid><Stat label="Bundles given" value={totals.paid} icon={Gift} tone="good" /><Stat label="Discount given" value={formatGHS(totals.discount)} note="normal price minus giveaway price, paid orders only" /></StatGrid>
      <Panel title="Campaigns">
        <Rows empty={list === null ? "Loading…" : "No giveaways yet."}>
          {(list ?? []).map((c) => (
            <div key={c.id}>
              <Row primary={<span>{c.title} <span className="font-normal text-faint-foreground">· datayego.com/g/{c.slug}</span></span>} secondary={`${c.product.replace(" Data — ", " ")} at ${formatGHS(Number(c.price))} (normal ${formatGHS(Number(c.normal_price))}${c.cost != null ? `, our cost ${formatGHS(Number(c.cost))}` : ""}) · ${c.paid} paid · ${c.pending} pending · cap ${c.max}${Number(c.paid) + Number(c.pending) >= c.max ? " · FULL" : ""}`} right={c.is_active ? "Live" : "Off"} tone={c.is_active ? "good" : "muted"} onClick={() => void show(c)} />
              <div className="mb-2 flex flex-wrap gap-2 px-1"><button type="button" onClick={() => void toggle(c)} className="rounded-full border border-white/[0.12] px-3 py-1 text-[12px] text-foreground">{c.is_active ? "Stop" : "Resume"}</button><button type="button" onClick={() => void setMax(c)} className="rounded-full border border-white/[0.12] px-3 py-1 text-[12px] text-foreground">Change cap</button><button type="button" onClick={() => { void navigator.clipboard.writeText(`https://datayego.com/g/${c.slug}`); toast.success("Link copied."); }} className="rounded-full border border-white/[0.12] px-3 py-1 text-[12px] text-foreground">Copy link</button></div>
              {open === c.id && <div className="mb-3 rounded-2xl bg-white/[0.03] p-3"><p className="mb-2 text-[12px] text-faint-foreground">{reds.length} claims, newest first</p><ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto text-[12.5px]">{reds.map((r) => <li key={r.id} className="flex items-center justify-between py-1.5"><span className="font-mono">{r.recipient_phone.slice(0, 3)}•••{r.recipient_phone.slice(-3)}</span><span className={r.status === "paid" ? "text-primary-glow" : "text-faint-foreground"}>{r.status}</span><span className="text-faint-foreground">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul></div>}
            </div>
          ))}
        </Rows>
      </Panel>
    </div>
  );
}
