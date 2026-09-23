import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Receipt, ShieldCheck, Store, TrendingUp, Users, Wallet } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { InlineAction, Money, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { adminDatabase, formatAdminDate, readableStatus } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

/* Overview — the first screen of the day. Counts for the chosen period,
   money for the same period, what needs a human, and the latest orders. */

type Period = "today" | "7d" | "30d" | "all";
const PERIODS = [{ value: "today" as const, label: "Today" }, { value: "7d" as const, label: "7 days" }, { value: "30d" as const, label: "30 days" }, { value: "all" as const, label: "Since launch" }];
const since = (p: Period) => { if (p === "all") return "2026-09-12T00:00:00Z"; const d = new Date(); if (p === "today") d.setHours(0, 0, 0, 0); else d.setDate(d.getDate() - (p === "7d" ? 7 : 30)); return d.toISOString(); };

interface OrderRow { order_reference: string; recipient_phone: string; amount: number; status: string; payment_status: string; admin_resolution_status: string | null; supplier_retry_after: string | null; created_at: string; networks: { name: string } | null; data_products: { name: string } | null }
interface Overview { period: { revenue: number; net: number; fee_income: number }; owed: { undelivered: number; undelivered_count: number }; cash: { supplier_float: Record<string, number> } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }> };
const statusTone = (s: string) => s === "delivered" ? "good" : s.startsWith("failed") ? "bad" : s === "processing" || s === "pending_supplier" ? "warn" : "muted";

export default function Admin() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("today");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [suppliers, setSuppliers] = useState<{ code: string; name: string; balance: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [o, ov, su] = await Promise.all([
      db().from("orders").select("order_reference, recipient_phone, amount, status, payment_status, admin_resolution_status, supplier_retry_after, created_at, networks(name), data_products(name)").gte("created_at", since(period)).order("created_at", { ascending: false }).limit(500),
      db().rpc("finance_overview", { p_from: since(period), p_to: null }),
      db().from("suppliers").select("code, name, balance").neq("status", "disabled").order("display_order"),
    ]);
    setOrders(o.data ?? []); setOverview((ov.data as Overview) ?? null); setSuppliers(su.data ?? []); setLoading(false);
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const paid = orders.filter((x) => x.payment_status === "succeeded");
  const delivered = paid.filter((x) => x.status === "delivered").length;
  const inFlight = paid.filter((x) => ["processing", "pending_supplier", "paid"].includes(x.status));
  const cooldown = inFlight.filter((x) => x.supplier_retry_after).length;
  const verification = paid.filter((x) => x.admin_resolution_status === "awaiting_verification").length;
  const failed = paid.filter((x) => x.status.startsWith("failed")).length;
  const rate = paid.length ? Math.round((delivered / paid.length) * 100) : 0;
  const p = overview?.period;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Overview" description="Orders, money and anything that needs a hand." action={<div className="w-[240px] sm:w-[320px]"><Segmented<Period> value={period} onChange={setPeriod} options={PERIODS} /></div>} />

      <StatGrid>
        <Stat loading={loading} label="Paid orders" value={paid.length} note={`${rate}% delivered`} icon={ClipboardList} to="/admin/orders" />
        <Stat loading={loading} label="Delivered" value={delivered} icon={CheckCircle2} tone="good" />
        <Stat loading={loading} label="In progress" value={inFlight.length} note={cooldown ? `${cooldown} waiting on supplier cooldown` : "with the supplier"} icon={Clock3} tone={inFlight.length ? "warn" : "default"} to="/admin/orders?status=pending" />
        <Stat loading={loading} label="Needs a human" value={failed + verification} note={`${failed} failed · ${verification} MTN verification`} icon={AlertTriangle} tone={failed ? "bad" : verification ? "warn" : "default"} to="/admin/orders?status=failed" />
        <Stat loading={loading} label="Revenue" value={<Money value={p?.revenue} />} note="delivered bundles" icon={TrendingUp} to="/admin/finance" />
        <Stat loading={loading} label="Net profit" value={<Money value={p?.net} tone={Number(p?.net) < 0 ? "bad" : "good"} />} note={`incl. ${formatGHS(Number(p?.fee_income ?? 0))} checkout fee`} icon={Receipt} tone={Number(p?.net) < 0 ? "bad" : "good"} to="/admin/finance" />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Latest orders" icon={ClipboardList} action={<InlineAction to="/admin/orders">View all</InlineAction>}>
          <Rows empty="No orders in this period.">
            {orders.slice(0, 8).map((x) => (
              <Row key={x.order_reference} onClick={() => navigate(`/admin/orders?q=${x.order_reference}`)}
                primary={<span className="font-mono text-[13px]">{x.order_reference}</span>}
                secondary={`${x.recipient_phone} · ${x.networks?.name ?? ""} ${x.data_products?.name ?? ""} · ${formatAdminDate(x.created_at)}`}
                right={formatGHS(Number(x.amount))}
                rightNote={<Pill tone={statusTone(x.status)}>{x.admin_resolution_status === "awaiting_verification" ? "Awaiting verification" : x.supplier_retry_after ? "Cooldown" : readableStatus(x.status)}</Pill>} />
            ))}
          </Rows>
        </Panel>

        <div className="space-y-5">
          <Panel title="Supplier float" icon={Store} action={<InlineAction to="/admin/finance">Finance</InlineAction>}>
            <StatGrid>
              {suppliers.map((s) => <Stat key={s.code} loading={loading} label={s.name} value={s.balance == null ? "—" : <Money value={s.balance} tone={Number(s.balance) < 100 ? "bad" : "default"} />} note={Number(s.balance) < 100 ? "low — top up soon" : "live balance"} tone={Number(s.balance) < 100 ? "bad" : "default"} />)}
            </StatGrid>
          </Panel>
          <Panel title="Owed to customers" icon={Wallet}>
            <StatGrid>
              <Stat loading={loading} label="Paid, not delivered" value={<Money value={overview?.owed.undelivered} />} note={`${overview?.owed.undelivered_count ?? 0} orders`} icon={ShieldCheck} tone={Number(overview?.owed.undelivered_count) > 0 ? "warn" : "default"} to="/admin/orders" />
              <Stat loading={loading} label="Customers" value="→" note="all users" icon={Users} to="/admin/users" />
            </StatGrid>
          </Panel>
        </div>
      </div>
    </div>
  );
}
