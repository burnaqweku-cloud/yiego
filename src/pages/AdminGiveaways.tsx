import { useEffect, useMemo, useState } from "react";
import { Copy, Gift, Link2, Pause, Play, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import ManagedList from "@/components/agent/ManagedList";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Giveaways: create one, see exactly how it's going (claimed, paid, remaining, what it really costs us), change the cap,
   stop or resume it, and read every claim. datayego.com/giveaway always shows the newest running one. */
interface C { id: string; slug: string; title: string; price: number; normal_price: number; cost: number | null; real_loss: number | null; product: string; is_active: boolean; max: number; paid: number; pending: number; discount_given: number; created_at: string }
interface R { id: string; recipient_phone: string; status: string; created_at: string; order_id: string | null; user_id: string | null }
interface Product { id: string; name: string; customer_price: number; cost_price: number | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };
const PUBLIC = "https://datayego.com/giveaway";

export default function AdminGiveaways() {
  const [list, setList] = useState<C[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [claimsFor, setClaimsFor] = useState<string | null>(null); const [claims, setClaims] = useState<R[]>([]);
  const [capEdit, setCapEdit] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ title: "", blurb: "", product_id: "", price: "", max: "100", slug: "", require_account: true });
  const load = async () => {
    const [s, p] = await Promise.all([db().rpc("admin_campaign_stats", {}), db().from("data_products").select("id, name, customer_price, cost_price").eq("is_active", true).order("display_order")]);
    setList((s.data as C[]) ?? []); setProducts((p.data as Product[]) ?? []);
  };
  useEffect(() => { void load(); }, []);
  const current = useMemo(() => (list ?? []).find((c) => c.is_active && Number(c.paid) + Number(c.pending) < c.max) ?? null, [list]);
  const toggle = async (c: C) => { const { error } = await db().from("campaigns").update({ is_active: !c.is_active }).eq("id", c.id); if (error) return toast.error("Couldn't update."); toast.success(c.is_active ? "Giveaway stopped. The page now says there's no active giveaway." : "Giveaway is live again."); void load(); };
  const saveCap = async (c: C) => { const n = Number(capEdit[c.id]); if (!Number.isInteger(n) || n < 0) return toast.error("Whole number."); const { error } = await db().from("campaigns").update({ max_redemptions: n }).eq("id", c.id); if (error) return toast.error("Couldn't save."); toast.success(`Cap set to ${n}.`); setCapEdit((x) => { const y = { ...x }; delete y[c.id]; return y; }); void load(); };
  const showClaims = async (c: C) => { if (claimsFor === c.id) return setClaimsFor(null); const { data } = await db().from("campaign_redemptions").select("id, recipient_phone, status, created_at, order_id, user_id").eq("campaign_id", c.id).order("created_at", { ascending: false }).limit(1000); setClaims((data as R[]) ?? []); setClaimsFor(c.id); };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied."); };
  const chosen = products.find((p) => p.id === f.product_id);
  const create = async () => {
    const price = Number(f.price); const max = Number(f.max);
    if (!f.title.trim()) return toast.error("Give it a title.");
    if (!chosen) return toast.error("Pick a bundle.");
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter the giveaway price.");
    if (!Number.isInteger(max) || max <= 0) return toast.error("Enter how many can claim (the cap).");
    const slug = (f.slug.trim() || f.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const { error } = await db().from("campaigns").insert({ slug, title: f.title.trim(), blurb: f.blurb.trim() || null, product_id: chosen.id, price, max_redemptions: max, require_account: f.require_account });
    if (error) return toast.error(error.message.includes("duplicate") ? "A giveaway with that link name exists; change the link name." : error.message);
    toast.success("Giveaway created and live."); setCreating(false); setF({ title: "", blurb: "", product_id: "", price: "", max: "100", slug: "", require_account: true }); void load();
  };
  const totals = (list ?? []).reduce((a, c) => ({ paid: a.paid + Number(c.paid), discount: a.discount + Number(c.discount_given), loss: a.loss + Number(c.real_loss ?? 0) }), { paid: 0, discount: 0, loss: 0 });
  const d = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Giveaways" description="One link for everything: datayego.com/giveaway always shows the newest running giveaway. One claim per number, account and device. Customers never see the cap or how many are left." action={<Button size="sm" onClick={() => setCreating((v) => !v)}><Plus size={14} />New giveaway</Button>} />

      <Panel title="The public link" icon={Link2} note={current ? `showing: ${current.title}` : "nothing running: the page says there's no active giveaway"}>
        <div className="flex flex-wrap items-center gap-2"><code className="rounded-xl bg-white/[0.05] px-3 py-2 text-[13.5px] text-foreground">{PUBLIC}</code><Button size="sm" variant="ghost" onClick={() => copy(PUBLIC)}><Copy size={14} />Copy</Button></div>
      </Panel>

      {creating && (
        <Panel title="New giveaway" icon={Gift}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1 block text-[12px] font-semibold text-foreground">Title (customers see this)</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 80) })} placeholder="MTN 1GB for GH₵ 3.50" className="onyx-field w-full" /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[12px] font-semibold text-foreground">Short text (optional)</span><textarea value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value.slice(0, 240) })} rows={2} placeholder="A thank-you to our WhatsApp channel. One per number." className="onyx-field w-full resize-y" /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Bundle</span><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })} className="onyx-field w-full"><option value="">Choose a bundle</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name.replace(" Data — ", " ")} · {formatGHS(Number(p.customer_price))}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Giveaway price</span><input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder={chosen ? `normal ${formatGHS(Number(chosen.customer_price))}` : "GH₵"} className="onyx-field w-full" /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">How many can claim (hidden cap)</span><input value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="onyx-field w-full" /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Link name (optional)</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="e.g. 1gb → datayego.com/g/1gb" className="onyx-field w-full" /></label>
            <label className="flex items-center gap-2 text-[13px] text-foreground sm:col-span-2"><input type="checkbox" checked={f.require_account} onChange={(e) => setF({ ...f, require_account: e.target.checked })} />Must be signed in to claim (recommended)</label>
            {chosen && f.price && <p className="text-[12.5px] text-muted-foreground sm:col-span-2">Each bundle: customer pays {formatGHS(Number(f.price))}, normal price {formatGHS(Number(chosen.customer_price))}{chosen.cost_price != null ? `, supplier price around ${formatGHS(Number(chosen.cost_price))} (the real charge is taken from each purchase)` : ""}. At {f.max || 0} claims that is up to {formatGHS(Number(f.max || 0) * Math.max(0, Number(chosen.cost_price ?? chosen.customer_price) - Number(f.price)))} out of pocket.</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button><Button size="sm" onClick={() => void create()}>Create and go live</Button></div>
        </Panel>
      )}

      <StatGrid>
        <Stat label="Bundles given" value={totals.paid} icon={Gift} tone="good" note="paid giveaway orders" />
        <Stat label="Discount given" value={formatGHS(totals.discount)} note="normal price minus giveaway price" />
        <Stat label="Real cost to us" value={formatGHS(totals.loss)} note="supplier's actual charge minus what customers paid" tone={totals.loss > 0 ? "bad" : "default"} />
      </StatGrid>

      {list === null && <Panel title="Campaigns"><p className="text-[13px] text-muted-foreground">Loading…</p></Panel>}
      {list?.length === 0 && <Panel title="Campaigns"><p className="text-[13px] text-muted-foreground">No giveaways yet. Create one above; it goes live at once and the public link starts showing it.</p></Panel>}
      {(list ?? []).map((c) => {
        const used = Number(c.paid) + Number(c.pending); const remaining = Math.max(0, c.max - used); const pct = c.max ? Math.min(100, Math.round((Number(c.paid) / c.max) * 100)) : 0;
        const state = !c.is_active ? "Stopped" : remaining === 0 ? "Full" : c.id === current?.id ? "Live on /giveaway" : "Live";
        return (
          <Panel key={c.id} title={c.title} icon={Gift} action={<Pill tone={state.startsWith("Live") ? "good" : state === "Full" ? "warn" : "muted"}>{state}</Pill>} note={`${c.product.replace(" Data — ", " ")} · ${formatGHS(Number(c.price))} instead of ${formatGHS(Number(c.normal_price))} · created ${d(c.created_at)}`}>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="flex items-end justify-between text-[12.5px]"><span className="text-muted-foreground"><b className="text-foreground">{c.paid}</b> paid · <b className="text-foreground">{c.pending}</b> claimed, paying now · <b className="text-foreground">{remaining}</b> remaining</span><span className="text-faint-foreground">cap {c.max}</span></div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /><div className="-mt-2.5 h-full rounded-full bg-amber/60" style={{ width: `${c.max ? Math.min(100, Math.round((used / c.max) * 100)) : 0}%`, opacity: 0.35 }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px]">
                  <div><p className="text-faint-foreground">Discount given</p><p className="font-semibold text-foreground">{formatGHS(Number(c.discount_given))}</p></div>
                  <div><p className="text-faint-foreground">Supplier charged (avg)</p><p className="font-semibold text-foreground">{c.cost != null ? formatGHS(Number(c.cost)) : "—"}</p></div>
                  <div><p className="text-faint-foreground">Real cost to us</p><p className={`font-semibold ${Number(c.real_loss ?? 0) > 0 ? "text-ink-rose" : "text-foreground"}`}>{c.real_loss != null ? formatGHS(Number(c.real_loss)) : "—"}</p></div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:w-56">
                <div className="flex items-center gap-2"><input value={capEdit[c.id] ?? String(c.max)} onChange={(e) => setCapEdit({ ...capEdit, [c.id]: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="onyx-field w-full !py-2 text-[13px]" aria-label="Cap" /><Button size="sm" variant="ghost" disabled={capEdit[c.id] == null || capEdit[c.id] === String(c.max)} onClick={() => void saveCap(c)}><Save size={14} /></Button></div>
                <Button size="sm" variant={c.is_active ? "ghost" : "primary"} onClick={() => void toggle(c)}>{c.is_active ? <><Pause size={14} />Stop</> : <><Play size={14} />Resume</>}</Button>
                <Button size="sm" variant="ghost" onClick={() => copy(`https://datayego.com/g/${c.slug}`)}><Copy size={14} />Direct link</Button>
                <Button size="sm" variant="ghost" onClick={() => void showClaims(c)}>{claimsFor === c.id ? "Hide claims" : "Show claims"}</Button>
              </div>
            </div>
            {claimsFor === c.id && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <ManagedList items={claims} filters={[{ id: "all", label: "All" }, { id: "paid", label: "Paid" }, { id: "ordered", label: "Paying" }, { id: "reserved", label: "Claimed" }, { id: "expired", label: "Expired" }]} filterOf={(r) => r.status} searchText={(r) => r.recipient_phone} empty="No claims yet." pageSize={15}
                  render={(r) => <div className="flex items-center justify-between py-2 text-[12.5px]"><span className="font-mono text-foreground">{r.recipient_phone}</span><span className={r.status === "paid" ? "text-primary-glow" : "text-faint-foreground"}>{r.status === "reserved" ? "claimed" : r.status === "ordered" ? "paying" : r.status}</span><span className="text-faint-foreground">{d(r.created_at)}</span></div>}
                  countLabel={(n) => `${n} claim${n === 1 ? "" : "s"}`} />
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
