import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, Gift, Store } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import AdminRecordModal from "@/components/admin/AdminRecordModal";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* One agent, in full: who they are, their plan, every order through them
   (store sale vs their own purchase), earnings, payouts, free months. */
interface Agent { id: string; user_id: string; slug: string; store_name: string; tagline: string | null; status: string; paid_until: string | null; momo_number: string | null; momo_name: string | null; whatsapp: string | null; earnings_balance: number; created_at: string }
interface Ord { id: string; order_reference: string; recipient_phone: string; amount: number; agent_price: number | null; agent_margin: number | null; status: string; supplier_status: string | null; admin_resolution_status: string | null; paid_at: string; user_id: string | null; guest_email: string | null; data_products: { name: string; capacity_gb: number } | null; networks: { name: string } | null }
interface Payout { id: string; amount: number; fee: number; net: number; status: string; created_at: string; paid_at: string | null }
interface Grant { id: string; months: number; from_date: string; until_date: string; note: string | null; created_at: string }
interface Ledger { id: string; direction: string; type: string; amount: number; balance_after: number; reference: string; note: string | null; created_at: string }
type Range = "7d" | "30d" | "all"; type Source = "all" | "store" | "self";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const since = (r: Range) => r === "all" ? "2026-09-12" : new Date(Date.now() - (r === "7d" ? 6 : 29) * 86400000).toISOString().slice(0, 10);

export default function AdminAgentDetail() {
  const { id = "" } = useParams(); const { user } = useAuth(); const actor = user?.id ?? "";
  const [a, setA] = useState<Agent | null | undefined>(undefined); const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<Ord[]>([]); const [payouts, setPayouts] = useState<Payout[]>([]); const [grants, setGrants] = useState<Grant[]>([]); const [ledger, setLedger] = useState<Ledger[]>([]);
  const [range, setRange] = useState<Range>("30d"); const [source, setSource] = useState<Source>("all"); const [isMaster, setIsMaster] = useState(false);
  const [granting, setGranting] = useState(false); const [viewing, setViewing] = useState<Ord | null>(null); const [months, setMonths] = useState("1"); const [note, setNote] = useState("");
  const load = useCallback(async () => {
    const { data: g } = await db().from("agents").select("*").eq("id", id).maybeSingle();
    if (!g) { setA(null); return; } setA(g);
    const [p, o, py, gr, lg, r] = await Promise.all([
      db().from("profiles").select("email").eq("id", g.user_id).maybeSingle(),
      db().from("orders").select("id, order_reference, recipient_phone, amount, agent_price, agent_margin, status, supplier_status, admin_resolution_status, paid_at, user_id, guest_email, data_products(name, capacity_gb), networks(name)").eq("agent_id", g.id).eq("payment_status", "succeeded").gte("paid_at", `${since(range)}T00:00:00`).order("paid_at", { ascending: false }).limit(2000),
      db().from("agent_payouts").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }),
      db().from("agent_subscription_grants").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }),
      db().from("agent_ledger_entries").select("*").eq("agent_id", g.id).order("created_at", { ascending: false }).limit(100),
      actor ? db().rpc("admin_role", { p_user: actor }) : Promise.resolve({ data: null, error: null }),
    ]);
    setEmail(p.data?.email ?? "—"); setOrders(o.data ?? []); setPayouts(py.data ?? []); setGrants(gr.data ?? []); setLedger(lg.data ?? []); setIsMaster(r.data === "master");
  }, [id, range, actor]);
  useEffect(() => { void load(); }, [load]);

  const isSelf = (o: Ord) => a != null && o.user_id === a.user_id && Number(o.agent_margin ?? 0) === 0;
  const shown = useMemo(() => orders.filter((o) => source === "all" || (source === "self" ? isSelf(o) : !isSelf(o))), [orders, source, a]); // eslint-disable-line react-hooks/exhaustive-deps
  const storeOrders = orders.filter((o) => !isSelf(o)); const selfOrders = orders.filter(isSelf);
  const delivered = (l: Ord[]) => l.filter((o) => o.status === "delivered");
  const sales = storeOrders.reduce((s, o) => s + Number(o.amount), 0);
  const earned = delivered(storeOrders).reduce((s, o) => s + Number(o.agent_margin ?? 0), 0);
  const pending = storeOrders.filter((o) => !["delivered", "refunded", "cancelled"].includes(o.status)).reduce((s, o) => s + Number(o.agent_margin ?? 0), 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.net), 0);
  const stage = (o: Ord) => o.status === "delivered" ? "delivered" : o.status === "refunded" ? "refunded" : o.admin_resolution_status === "awaiting_verification" ? "verification" : o.status.startsWith("failed") ? "review" : "in progress";

  const grant = async () => {
    const { data, error } = await db().rpc("admin_grant_subscription", { p_actor: actor, p_agent_id: id, p_months: Number(months), p_note: note.trim() || null });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(`Covered until ${(data as { paid_until: string }).paid_until}.`); setGranting(false); setNote(""); void load();
  };
  const exportCsv = () => {
    const lines = [["paid at", "order", "source", "network", "gb", "recipient", "sold for", "agent price", "agent share", "status"], ...shown.map((o) => [o.paid_at, o.order_reference, isSelf(o) ? "own purchase" : "store sale", o.networks?.name ?? "", String(o.data_products?.capacity_gb ?? ""), o.recipient_phone, Number(o.amount).toFixed(2), Number(o.agent_price ?? 0).toFixed(2), Number(o.agent_margin ?? 0).toFixed(2), stage(o)])];
    const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([lines.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); el.download = `datayego-agent-${a?.slug}-${range}.csv`; el.click();
  };

  if (a === undefined) return null;
  if (a === null) return <div className="text-[13px] text-muted-foreground">No such agent.</div>;
  return (
    <div className="space-y-5">
      <AdminPageHeader title={a.store_name} description={`${email} · /s/${a.slug} · joined ${formatAdminDate(a.created_at)}`} action={<div className="flex flex-wrap gap-2"><Link to="/admin/agents/list"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Agents</Button></Link><a href={`/s/${a.slug}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><ExternalLink size={14} />Store</Button></a>{isMaster && <Button size="sm" variant="soft" onClick={() => setGranting(true)}><Gift size={14} />Give months</Button>}</div>} />

      <StatGrid cols={4}>
        <Stat label="Plan" value={<Pill tone={a.status === "active" ? "good" : a.status === "awaiting_payment" ? "warn" : "muted"}>{a.status.replace(/_/g, " ")}</Pill>} note={a.paid_until ? `covered until ${a.paid_until}${grants.length ? " · has free months" : ""}` : "not paid yet"} icon={Store} />
        <Stat label="Earnings balance" value={<Money value={Number(a.earnings_balance)} />} note={`${formatGHS(pending)} pending · ${formatGHS(paidOut)} paid out all time`} tone="good" />
        <Stat label="Contact" value={a.whatsapp ?? a.momo_number ?? "—"} note={a.momo_number ? `MoMo ${a.momo_number}${a.momo_name ? ` (${a.momo_name})` : ""}` : "no MoMo yet"} />
        <Stat label="Tagline" value={a.tagline ?? "—"} note={`slug ${a.slug}`} />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2"><Segmented<Range> value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "all", label: "Since launch" }]} /><Segmented<Source> value={source} onChange={setSource} options={[{ value: "all", label: `All (${orders.length})` }, { value: "store", label: `Store sales (${storeOrders.length})` }, { value: "self", label: `Own purchases (${selfOrders.length})` }]} /><Button variant="ghost" size="sm" onClick={exportCsv}><Download size={14} />CSV</Button></div>
      <StatGrid cols={4}>
        <Stat label="Store sales" value={<Money value={sales} />} note={`${storeOrders.length} orders · ${delivered(storeOrders).length} delivered`} tone="good" />
        <Stat label="Agent's share earned" value={<Money value={earned} />} note="on delivered store sales" />
        <Stat label="Own purchases" value={<Money value={selfOrders.reduce((s, o) => s + Number(o.amount), 0)} />} note={`${selfOrders.length} bought at agent price`} />
        <Stat label="Ours from this agent" value={<Money value={storeOrders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.agent_price ?? o.amount), 0) + selfOrders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.amount), 0)} />} note="agent price on delivered orders, before fees" tone="good" />
      </StatGrid>

      <Panel title="Orders" note={`${shown.length} shown`}>
        <ul className="divide-y divide-white/[0.06]">
          {shown.length === 0 && <li className="py-5 text-center text-[12px] text-faint-foreground">Nothing in this period.</li>}
          {shown.slice(0, 200).map((o) => { const self = isSelf(o); const st = stage(o); return (
            <li key={o.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/[0.02]" onClick={() => setViewing(o)}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-foreground"><span className="font-mono font-semibold">{o.order_reference}</span> <span className="text-muted-foreground">· {o.networks?.name} {o.data_products?.capacity_gb}GB · {o.recipient_phone}</span></p>
                <p className="truncate text-[11px] text-faint-foreground">{formatAdminDate(o.paid_at)} · {self ? "own purchase" : `share ${formatGHS(Number(o.agent_margin ?? 0))}`}</p>
              </div>
              <span className="text-[12.5px] font-semibold tabular-nums">{formatGHS(Number(o.amount))}</span>
              <Pill tone={st === "delivered" ? "good" : st === "refunded" || st === "review" ? "bad" : "warn"}>{st}</Pill>
            </li>); })}
        </ul>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Earnings ledger" note="every credit and debit">
          <Rows empty="Nothing yet.">{ledger.map((l) => <Row key={l.id} primary={`${l.direction === "credit" ? "+" : "−"}${formatGHS(Number(l.amount))} · ${l.type.replace(/_/g, " ")}`} secondary={`${formatAdminDate(l.created_at)} · ${l.reference}${l.note ? ` · ${l.note}` : ""}`} right={formatGHS(Number(l.balance_after))} rightNote="balance after" tone={l.direction === "credit" ? "good" : "muted"} />)}</Rows>
        </Panel>
        <div className="space-y-5">
          <Panel title="Payouts">
            <Rows empty="No payouts yet.">{payouts.map((p) => <Row key={p.id} primary={<>{formatGHS(Number(p.amount))} <Pill tone={p.status === "paid" ? "good" : p.status === "rejected" ? "muted" : "warn"}>{p.status}</Pill></>} secondary={`${formatAdminDate(p.created_at)} · fee ${formatGHS(Number(p.fee))}${p.paid_at ? ` · paid ${formatAdminDate(p.paid_at)}` : ""}`} right={formatGHS(Number(p.net))} rightNote="net" />)}</Rows>
            <div className="mt-2 text-right"><Link to="/admin/agents/payouts" className="text-[12px] text-primary-glow">Manage payouts →</Link></div>
          </Panel>
          {grants.length > 0 && <Panel title="Free months" note="complimentary, not income"><Rows empty="">{grants.map((g) => <Row key={g.id} primary={`${g.months} month${g.months === 1 ? "" : "s"}`} secondary={`${g.from_date} → ${g.until_date}${g.note ? ` · ${g.note}` : ""}`} right={formatAdminDate(g.created_at)} tone="muted" />)}</Rows></Panel>}
        </div>
      </div>

      <AdminRecordModal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.order_reference ?? "Order"} subtitle={viewing ? `${isSelf(viewing) ? "Own purchase at agent price" : "Store sale"} · ${stage(viewing)}` : ""} fields={viewing ? [
        { label: "Bundle", value: `${viewing.networks?.name ?? ""} ${viewing.data_products?.capacity_gb ?? ""}GB` }, { label: "Recipient", value: viewing.recipient_phone }, { label: "Paid at", value: formatAdminDate(viewing.paid_at) },
        ...(isSelf(viewing) ? [{ label: "Paid (agent price)", value: formatGHS(Number(viewing.amount)) }] : [{ label: "Buyer", value: viewing.guest_email ?? "signed-in customer" }, { label: "Sold for", value: formatGHS(Number(viewing.amount)) }, { label: "Agent price", value: formatGHS(Number(viewing.agent_price ?? 0)) }, { label: "Agent's share", value: formatGHS(Number(viewing.agent_margin ?? 0)) }]),
        { label: "Supplier says", value: viewing.supplier_status ?? "—" }, { label: "Order status", value: viewing.status.replace(/_/g, " ") },
      ] : []}>
        {viewing && <div className="flex justify-end"><Link to={`/admin/orders?q=${viewing.order_reference}`}><Button size="sm" variant="soft">Open in Orders</Button></Link></div>}
      </AdminRecordModal>
      <Modal open={granting} onClose={() => setGranting(false)} label="Give months">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Give {a.store_name} free months</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Extends their plan without a payment; recorded as complimentary.{a.paid_until ? ` Currently covered until ${a.paid_until}.` : ""}</p>
          <div className="mt-3 grid gap-2"><Field label="How long"><select value={months} onChange={(e) => setMonths(e.target.value)} className={inputCls}><option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">1 year</option></select></Field><Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setGranting(false)}>Cancel</Button><Button onClick={() => void grant()}>Give</Button></div>
        </div>
      </Modal>
    </div>
  );
}
