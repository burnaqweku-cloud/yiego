import { useCallback, useEffect, useState } from "react";
import { GraduationCap, PackagePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SmsSendersPanel from "@/components/admin/SmsSendersPanel";
import { Field, Panel, Pill, Row, Rows, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { addServiceStock, loadAdminServices, recordServiceRefund, refundServiceToWallet, refundServiceViaPaystack, setServiceProduct, type AddStockResult, type AdminServiceOrder, type AdminServiceProduct, type AdminServices as Data } from "@/lib/services";

/* DY Services in admin: the stock of result-checker PINs, prices, sales and refunds.
   PINs are never shown here after they are added; a PIN is only ever revealed to the person who bought it. */

const PAID_FROM = [["bank", "Bank"], ["outside_funding", "My own money (adds to capital)"], ["kora_held", "Kora balance"]] as const;
const STATUS: Record<string, [string, "good" | "warn" | "bad" | "muted"]> = {
  delivered: ["delivered", "good"], paid_waiting_stock: ["paid, waiting for stock", "bad"], refunded: ["refunded", "muted"], awaiting_payment: ["not paid", "muted"], expired: ["not paid", "muted"], cancelled: ["not paid", "muted"],
};

export default function AdminServices() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(true); const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<AdminServiceProduct | null>(null);
  const [lines, setLines] = useState(""); const [cost, setCost] = useState(""); const [from, setFrom] = useState<string>("bank"); const [note, setNote] = useState("");
  const [result, setResult] = useState<AddStockResult | null>(null); const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<AdminServiceProduct | null>(null);
  const [order, setOrder] = useState<AdminServiceOrder | null>(null); const [reason, setReason] = useState(""); const [ref, setRef] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    const r = await loadAdminServices();
    setData(r.data); setFailed(Boolean(r.error) || !r.data); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pairs = lines.match(/serial\s*(?:number|no\.?)?\s*[:#=-]*\s*[A-Za-z0-9]{4,}\s+pin\s*(?:code|number|no\.?)?\s*[:#=-]*\s*[A-Za-z0-9]{4,}/gi)?.length ?? 0;
  const count = pairs > 0 ? pairs : lines.split(/\r?\n/).filter((l) => l.trim()).length;
  const openAdd = (p: AdminServiceProduct) => { setAdding(p); setLines(""); setCost(""); setNote(""); setResult(null); setFrom("bank"); };
  const add = async () => {
    if (!adding) return;
    const total = Number(cost);
    if (count === 0) return toast.error("Paste at least one checker: serial number, then PIN.");
    if (!Number.isFinite(total) || total <= 0) return toast.error("Enter the total you paid for these.");
    setSaving(true);
    const r = await addServiceStock(adding.code, lines, total, from, note);
    setSaving(false);
    if (r.error || !r.data) return toast.error("Couldn't add stock. Only the owner can add stock.");
    setResult(r.data);
    if (r.data.added > 0) { toast.success(`${r.data.added} added to stock.`); setLines(""); void load(); }
  };
  const saveProduct = async () => {
    if (!edit) return;
    const r = await setServiceProduct(edit);
    if (r.error || !r.data) return toast.error("Couldn't save. The agent price can't be higher than the customer price.");
    toast.success("Saved."); setEdit(null); void load();
  };
  const refund = async (how: "wallet" | "paystack" | "manual") => {
    if (!order) return;
    if (!reason.trim()) return toast.error("Say why, in a few words.");
    if (how === "manual" && !ref.trim()) return toast.error("Enter the reference of the money you sent.");
    setSaving(true);
    const r = how === "wallet" ? await refundServiceToWallet(order.id, reason.trim()) : how === "manual" ? await recordServiceRefund(order.id, ref.trim(), reason.trim()) : await refundServiceViaPaystack(order.id, reason.trim());
    setSaving(false);
    const message = "error" in r && r.error ? (typeof r.error === "string" ? r.error : r.error.message) : null;
    if (message) return toast.error(/no_wallet_for_guest/.test(message) ? "This buyer has no account, so there is no wallet to refund to." : /[_]/.test(message) ? "Couldn't refund. Only the owner can refund." : message);
    toast.success("Refunded."); setOrder(null); void load();
  };

  const t = data?.totals;
  const stockValue = (data?.products ?? []).reduce((s, p) => s + Number(p.stock_value), 0);
  return (
    <div className="space-y-5">
      <AdminPageHeader title="DY Services" description="Result checkers sold from your own stock of PINs. Each PIN is sold once, and only the buyer ever sees it."
        action={<Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy} aria-label="Refresh" title="Refresh"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></Button>} />
      {failed ? <p role="alert" className="text-[13px] text-danger">Couldn’t load DY Services. Tap refresh.</p> : <>
        <StatGrid cols={4}>
          <Stat loading={busy} label="Sales today" value={formatGHS(Number(t?.sales_today ?? 0))} tone="good" />
          <Stat loading={busy} label="Profit today" value={formatGHS(Number(t?.profit_today ?? 0))} note="after PIN cost and agent margins" />
          <Stat loading={busy} label="Stock you own" value={formatGHS(stockValue)} note="unsold PINs, at what you paid" />
          <Stat loading={busy} label="Paid, waiting for stock" value={data?.waiting ?? 0} tone={(data?.waiting ?? 0) > 0 ? "bad" : "default"} note={(data?.waiting ?? 0) > 0 ? "add stock and they deliver by themselves" : "none"} />
        </StatGrid>

        <Panel title="Stock and prices" icon={GraduationCap}>
          <Rows empty="No services yet.">
            {(data?.products ?? []).map((p) => <Row key={p.code}
              primary={<>{p.name} {!p.is_active && <Pill tone="muted">hidden</Pill>}{p.left === 0 ? <Pill tone="bad">out of stock</Pill> : p.left <= p.low_stock_at ? <Pill tone="warn">low</Pill> : null}</>}
              secondary={<>{p.left} left{p.held > 0 ? ` · ${p.held} held for buyers paying now` : ""} · {p.sold_today} sold today · customers {formatGHS(Number(p.customer_price))} · agents {formatGHS(Number(p.agent_price))}</>}
              right={data?.can_edit ? <span className="flex gap-1.5"><Button size="sm" onClick={() => openAdd(p)}><PackagePlus size={14} />Add stock</Button><Button size="sm" variant="ghost" onClick={() => setEdit({ ...p })}>Edit</Button></span> : `${p.left}`} />)}
          </Rows>
        </Panel>

        <Panel title="Orders" note="paid orders, newest first">
          <Rows empty="No sales yet.">
            {(data?.orders ?? []).map((o) => { const [label, tone] = STATUS[o.status] ?? [o.status, "muted"]; return <Row key={o.id} onClick={data?.can_edit && o.status !== "refunded" ? () => { setOrder(o); setReason(""); setRef(""); } : undefined}
              primary={<>{o.quantity > 1 ? `${o.quantity} × ` : ""}{o.name} <Pill tone={tone}>{label}</Pill></>}
              secondary={`${o.reference} · ${o.phone} · ${o.payment_method === "wallet" ? "wallet" : "MoMo/card"}${o.agent_id ? " · agent store" : ""} · ${formatAdminDate(o.paid_at ?? o.created_at)}${o.sent ? ` · SMS/email ${o.sent}` : ""}`}
              right={formatGHS(Number(o.amount))} rightNote={o.cost_amount != null ? `profit ${formatGHS(Number(o.amount) - Number(o.cost_amount) - Number(o.agent_margin ?? 0))}` : undefined} />; })}
          </Rows>
        </Panel>

        <SmsSendersPanel />

        <Panel title="Stock added" note="each batch, with what you paid">
          <Rows empty="Nothing added yet.">
            {(data?.batches ?? []).map((b) => <Row key={b.id} primary={`${b.quantity} × ${b.name}`} secondary={`${formatAdminDate(b.created_at)} · paid from ${PAID_FROM.find(([k]) => k === b.paid_from)?.[1] ?? b.paid_from}${b.note ? ` · ${b.note}` : ""}`}
              right={formatGHS(Number(b.total_cost))} rightNote={`${formatGHS(Number(b.total_cost) / b.quantity)} each`} />)}
          </Rows>
        </Panel>
      </>}

      <Modal open={adding !== null} onClose={() => setAdding(null)} label="Add stock">
        {adding && <div className="w-[min(94vw,540px)] space-y-2.5 p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Add {adding.name} PINs</h2>
          <Field label="Checkers" hint="Paste the whole voucher page as it is: every “Serial Number … PIN …” pair is picked out for you. Or type one per line: serial number, then PIN.">
            <textarea className={`${inputCls} h-40 py-2 font-mono text-[12.5px] leading-5`} placeholder={"Paste here. For example:\nSerial Number: WGR240012345\nPIN: 123456789012"} value={lines} onChange={(e) => setLines(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label={`Total you paid for ${count || "these"}${count ? ` checker${count === 1 ? "" : "s"}` : ""} (GH₵)`} hint={count > 0 && Number(cost) > 0 ? `${formatGHS(Number(cost) / count)} each` : undefined}><input className={inputCls} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label="Paid from"><select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>{PAID_FROM.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></Field>
          </div>
          <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sellpincodes, 12 Nov" /></Field>
          {result && <div className="rounded-xl border border-white/[0.08] px-3 py-2 text-[12px] leading-5 text-muted-foreground">
            <p className="text-foreground">{result.added} added{result.cost_each != null ? ` at ${formatGHS(result.cost_each)} each` : ""}{result.left != null ? `. ${result.left} now in stock.` : "."}</p>
            {result.already_in_stock.length > 0 && <p>Already in stock, skipped: {result.already_in_stock.join(", ")}</p>}
            {result.not_read.length > 0 && <p className="text-danger">Couldn’t read these lines (need a serial number and a PIN): {result.not_read.join(" | ")}</p>}
          </div>}
          <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" size="sm" onClick={() => setAdding(null)}>Close</Button><Button size="sm" onClick={() => void add()} disabled={saving}>{saving ? "Adding…" : `Add ${count || ""} to stock`}</Button></div>
        </div>}
      </Modal>

      <Modal open={edit !== null} onClose={() => setEdit(null)} label="Edit service">
        {edit && <div className="w-[min(94vw,440px)] space-y-2.5 p-5">
          <h2 className="text-[16px] font-semibold text-foreground">{edit.name}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Customer price (GH₵)"><input className={inputCls} inputMode="decimal" value={String(edit.customer_price)} onChange={(e) => setEdit({ ...edit, customer_price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></Field>
            <Field label="Agent price (GH₵)"><input className={inputCls} inputMode="decimal" value={String(edit.agent_price)} onChange={(e) => setEdit({ ...edit, agent_price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></Field>
          </div>
          <Field label="Warn me when this many are left"><input className={inputCls} inputMode="numeric" value={String(edit.low_stock_at)} onChange={(e) => setEdit({ ...edit, low_stock_at: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2 text-[12.5px] text-foreground">Show it for sale<Switch checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} aria-label="Show it for sale" /></label>
          <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" size="sm" onClick={() => setEdit(null)}>Cancel</Button><Button size="sm" onClick={() => void saveProduct()}>Save</Button></div>
        </div>}
      </Modal>

      <Modal open={order !== null} onClose={() => setOrder(null)} label="Refund">
        {order && <div className="w-[min(94vw,460px)] space-y-2.5 p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Refund {order.reference}</h2>
          <p className="text-[12px] leading-5 text-faint-foreground">{order.quantity > 1 ? `${order.quantity} × ` : ""}{order.name} · {formatGHS(Number(order.amount))}{Number(order.fee_amount) > 0 ? ` + ${formatGHS(Number(order.fee_amount))} fee` : ""} · {order.phone}. {order.status === "delivered" ? "The buyer has already seen the PIN, so it is written off and not sold again." : "No PIN was given out for this order."}</p>
          <Field label="Why?"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PIN did not work" /></Field>
          <div className="flex flex-wrap gap-2">
            {order.payment_method === "paystack" && <Button size="sm" onClick={() => void refund("paystack")} disabled={saving}>Refund to their MoMo/card (Paystack)</Button>}
            <Button size="sm" variant="soft" onClick={() => void refund("wallet")} disabled={saving}>Refund to their wallet</Button>
          </div>
          <Field label="Or record money you sent yourself" hint="Enter the reference, then tap Record."><div className="flex gap-2"><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MoMo reference" /><Button size="sm" variant="ghost" onClick={() => void refund("manual")} disabled={saving}>Record</Button></div></Field>
        </div>}
      </Modal>
    </div>
  );
}
